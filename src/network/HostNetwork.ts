import Peer, { PeerErrorType, type DataConnection } from 'peerjs'
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
  private livenessTimer?: number
  private hostRetryTimer?: number
  private hostRetryAttempt = 0
  private stopped = false
  private readonly connections = new Map<string, ConnectionEntry>()
  private readonly viewerConnections = new Map<string, DataConnection>()
  private currentState: PublicGameState
  private readonly messageListeners = new Set<(message: WireMessage, senderId?: string) => void>()
  private readonly statusListeners = new Set<(statuses: StationStatus[]) => void>()

  constructor(private readonly roomCode: string, initialState: PublicGameState, private readonly events: HostNetworkEvents) {
    this.currentState = initialState
  }

  start(): void {
    this.stopped = false
    this.hostRetryAttempt = 0
    if (this.hostRetryTimer) window.clearTimeout(this.hostRetryTimer)
    if (this.livenessTimer) window.clearInterval(this.livenessTimer)
    const previousPeer = this.peer
    this.peer = undefined
    previousPeer?.destroy()
    this.openHostPeer()
    this.livenessTimer = window.setInterval(() => this.checkStationLiveness(), 3000)
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
    const viewer = this.viewerConnections.get(stationId)
    if (viewer?.open) { viewer.send(message); return true }
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
    this.stopped = true
    if (this.hostRetryTimer) window.clearTimeout(this.hostRetryTimer)
    this.hostRetryTimer = undefined
    if (this.livenessTimer) window.clearInterval(this.livenessTimer)
    this.livenessTimer = undefined
    this.connections.forEach((entry) => {
      if (entry.pingTimer) window.clearInterval(entry.pingTimer)
      entry.connection.close()
    })
    this.viewerConnections.forEach((connection) => connection.close())
    this.viewerConnections.clear()
    const peer = this.peer
    this.peer = undefined
    peer?.destroy()
  }

  disconnect(): void { this.stop() }

  onMessage(handler: (message: WireMessage, senderId?: string) => void): () => void {
    this.messageListeners.add(handler); return () => this.messageListeners.delete(handler)
  }

  onStatus(handler: (statuses: StationStatus[]) => void): () => void {
    this.statusListeners.add(handler); return () => this.statusListeners.delete(handler)
  }

  private openHostPeer(): void {
    if (this.stopped) return
    const peer = new Peer(hostPeerId(this.roomCode), { debug: 1 })
    this.peer = peer
    peer.on('open', () => {
      if (this.peer !== peer || this.stopped) return
      this.hostRetryAttempt = 0
      if (this.hostRetryTimer) window.clearTimeout(this.hostRetryTimer)
      this.hostRetryTimer = undefined
      this.events.onOpen()
    })
    peer.on('connection', (connection) => {
      if (this.peer === peer && !this.stopped) this.accept(connection)
      else connection.close()
    })
    peer.on('error', (error) => {
      if (this.peer !== peer || this.stopped) return
      this.events.onError(`PeerJS: ${error.message}`)
      if (error.type === PeerErrorType.UnavailableID) this.scheduleHostRestart()
    })
    peer.on('disconnected', () => {
      if (this.peer !== peer || this.stopped || peer.destroyed) return
      this.events.onError('시그널링 서버 연결이 끊겼습니다. 자동 복구를 시도합니다.')
      window.setTimeout(() => {
        if (this.peer !== peer || this.stopped || peer.destroyed || !peer.disconnected) return
        try {
          peer.reconnect()
        } catch {
          this.scheduleHostRestart()
        }
        window.setTimeout(() => {
          if (this.peer === peer && !this.stopped && !peer.open) this.scheduleHostRestart()
        }, 2000)
      }, 1000)
    })
  }

  private scheduleHostRestart(): void {
    if (this.stopped || this.hostRetryTimer) return
    const delay = Math.min(1000 * 2 ** this.hostRetryAttempt, 10_000)
    this.hostRetryAttempt += 1
    this.hostRetryTimer = window.setTimeout(() => {
      this.hostRetryTimer = undefined
      if (this.stopped) return
      const previousPeer = this.peer
      this.peer = undefined
      previousPeer?.destroy()
      this.openHostPeer()
    }, delay)
  }

  private accept(connection: DataConnection): void {
    let identifiedStationId: string | undefined
    let identifiedViewerId: string | undefined

    connection.on('data', (raw) => {
      const message = raw as WireMessage
      if (message.type === 'CARD_VIEWER_HELLO') {
        identifiedViewerId = message.viewerId
        this.viewerConnections.get(message.viewerId)?.close()
        this.viewerConnections.set(message.viewerId, connection)
        this.events.onMessage(message.viewerId, message)
        return
      }
      if (identifiedViewerId) {
        this.events.onMessage(identifiedViewerId, message)
        this.messageListeners.forEach((listener) => listener(message, identifiedViewerId))
        return
      }
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
      if (identifiedViewerId && this.viewerConnections.get(identifiedViewerId) === connection) this.viewerConnections.delete(identifiedViewerId)
      if (!identifiedStationId) return
      const entry = this.connections.get(identifiedStationId)
      if (entry?.connection === connection && entry.status.connection !== 'disconnected') {
        entry.status.connection = 'disconnected'
        entry.status.busy = false
        if (entry.pingTimer) window.clearInterval(entry.pingTimer)
        this.emitStatuses()
      }
    }
    connection.on('close', markDisconnected)
    connection.on('error', markDisconnected)
  }

  private checkStationLiveness(): void {
    const now = Date.now()
    let changed = false
    this.connections.forEach((entry) => {
      if (entry.status.connection !== 'connected' || now - entry.status.lastSeenAt < 15_000) return
      entry.status.connection = 'disconnected'
      entry.status.busy = false
      entry.status.latencyMs = null
      if (entry.pingTimer) window.clearInterval(entry.pingTimer)
      entry.pingTimer = undefined
      entry.connection.close()
      changed = true
    })
    if (changed) this.emitStatuses()
  }

  private emitStatuses(): void {
    const statuses = [...this.connections.values()].map(({ status }) => ({ ...status })).sort((a, b) => a.slot - b.slot)
    this.events.onStatus(statuses)
    this.statusListeners.forEach((listener) => listener(statuses))
  }
}
