import Peer, { type DataConnection } from 'peerjs'
import type { MessageTestReport, PublicGameState, StationStatus, WireMessage } from '../types'
import type { IGameTransport } from './IGameTransport'
import { createId, hostPeerId } from './ids'

export interface HostNetworkEvents {
  onStatus: (statuses: StationStatus[]) => void
  onMessage: (stationId: string, message: WireMessage) => void
  onOpen: () => void
  onError: (message: string) => void
}

interface ConnectionEntry {
  connection: DataConnection
  status: StationStatus
  pingTimer?: number
}

export class HostNetwork implements IGameTransport<WireMessage, StationStatus[]> {
  private peer?: Peer
  private readonly connections = new Map<string, ConnectionEntry>()
  private currentState: PublicGameState
  private readonly messageListeners = new Set<(message: WireMessage, senderId?: string) => void>()
  private readonly statusListeners = new Set<(statuses: StationStatus[]) => void>()

  constructor(private readonly roomCode: string, initialState: PublicGameState, private readonly events: HostNetworkEvents) {
    this.currentState = initialState
  }

  start(): void {
    this.peer = new Peer(hostPeerId(this.roomCode), { debug: 1 })
    this.peer.on('open', () => this.events.onOpen())
    this.peer.on('connection', (connection) => this.accept(connection))
    this.peer.on('error', (error) => this.events.onError(`PeerJS: ${error.message}`))
    this.peer.on('disconnected', () => {
      this.events.onError('시그널링 서버 연결이 끊겼습니다. 자동 복구를 시도합니다.')
      window.setTimeout(() => {
        if (this.peer?.disconnected && !this.peer.destroyed) this.peer.reconnect()
      }, 1000)
    })
  }

  connect(): void { this.start() }

  updateState(state: PublicGameState): void {
    this.currentState = state
  }

  broadcast(message: WireMessage): void {
    this.connections.forEach(({ connection }) => {
      if (connection.open) connection.send(message)
    })
  }

  send(message: WireMessage, stationId?: string): boolean {
    if (!stationId) return false
    const entry = this.connections.get(stationId)
    if (!entry?.connection.open) return false
    entry.connection.send(message)
    return true
  }

  runMessageTest(stationId: string, testId: string, count: number): void {
    for (let sequence = 0; sequence < count; sequence += 1) {
      this.send({ type: 'MESSAGE_TEST_ITEM', testId, sequence, total: count, sentAt: Date.now() }, stationId)
    }
  }

  recordReport(stationId: string, report: MessageTestReport): void {
    const entry = this.connections.get(stationId)
    if (entry) {
      entry.status.testReport = report
      this.emitStatuses()
    }
  }

  setStationBusy(stationId: string, busy: boolean): void {
    const entry = this.connections.get(stationId)
    if (entry) { entry.status.busy = busy; this.emitStatuses() }
  }

  stop(): void {
    this.connections.forEach((entry) => {
      if (entry.pingTimer) window.clearInterval(entry.pingTimer)
      entry.connection.close()
    })
    this.peer?.destroy()
  }

  disconnect(): void { this.stop() }

  onMessage(handler: (message: WireMessage, senderId?: string) => void): () => void {
    this.messageListeners.add(handler); return () => this.messageListeners.delete(handler)
  }

  onStatus(handler: (statuses: StationStatus[]) => void): () => void {
    this.statusListeners.add(handler); return () => this.statusListeners.delete(handler)
  }

  private accept(connection: DataConnection): void {
    let identifiedStationId: string | undefined

    connection.on('data', (raw) => {
      const message = raw as WireMessage
      if (message.type === 'HELLO') {
        identifiedStationId = message.stationId
        let previous = this.connections.get(message.stationId)
        if (!previous) {
          const abandoned = [...this.connections.entries()].find(([, entry]) => entry.status.connection === 'disconnected')
          if (abandoned) {
            const [abandonedId, abandonedEntry] = abandoned
            if (abandonedEntry.pingTimer) window.clearInterval(abandonedEntry.pingTimer)
            this.connections.delete(abandonedId)
            previous = abandonedEntry
          }
        }
        const connectedCount = [...this.connections.values()].filter((entry) => entry.status.connection === 'connected').length
        if (!previous && connectedCount >= 3) {
          connection.send({ type: 'ERROR', code: 'ROOM_FULL', message: '거래소 3대가 이미 연결되어 있습니다.' } satisfies WireMessage)
          window.setTimeout(() => connection.close(), 300)
          return
        }
        previous?.connection.close()
        if (previous?.pingTimer) window.clearInterval(previous.pingTimer)
        const usedSlots = [...this.connections.values()].filter((entry) => entry.status.stationId !== message.stationId).map((entry) => entry.status.slot)
        const slot = previous?.status.slot ?? [1, 2, 3].find((candidate) => !usedSlots.includes(candidate)) ?? 3
        const status: StationStatus = {
          stationId: message.stationId,
          name: message.stationName || `거래소 ${slot}`,
          slot,
          connection: 'connected',
          busy: previous?.status.busy ?? false,
          latencyMs: null,
          lastSeenAt: Date.now(),
          reconnects: previous ? previous.status.reconnects + 1 : 0,
          testReport: previous?.status.testReport,
        }
        const entry: ConnectionEntry = { connection, status }
        entry.pingTimer = window.setInterval(() => {
          if (!connection.open) return
          const sentAt = Date.now()
          connection.send({ type: 'PING', id: createId('ping'), sentAt } satisfies WireMessage)
        }, 3000)
        this.connections.set(message.stationId, entry)
        connection.send({ type: 'WELCOME', state: this.currentState, stationSlot: slot } satisfies WireMessage)
        this.emitStatuses()
        return
      }

      if (!identifiedStationId) return
      const entry = this.connections.get(identifiedStationId)
      if (entry) entry.status.lastSeenAt = Date.now()
      if (message.type === 'PONG' && entry) {
        entry.status.latencyMs = Date.now() - message.sentAt
        this.emitStatuses()
      }
      this.events.onMessage(identifiedStationId, message)
      this.messageListeners.forEach((listener) => listener(message, identifiedStationId))
    })

    const markDisconnected = () => {
      if (!identifiedStationId) return
      const entry = this.connections.get(identifiedStationId)
      if (entry?.connection === connection) {
        entry.status.connection = 'disconnected'
        entry.status.busy = false
        if (entry.pingTimer) window.clearInterval(entry.pingTimer)
        this.emitStatuses()
      }
    }
    connection.on('close', markDisconnected)
    connection.on('error', markDisconnected)
  }

  private emitStatuses(): void {
    const statuses = [...this.connections.values()].map(({ status }) => ({ ...status })).sort((a, b) => a.slot - b.slot)
    this.events.onStatus(statuses)
    this.statusListeners.forEach((listener) => listener(statuses))
  }
}
