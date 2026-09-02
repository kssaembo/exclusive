import Peer, { type DataConnection } from 'peerjs'
import type { ConnectionLevel, WireMessage } from '../types'
import { hostPeerId } from './ids'
import type { IGameTransport } from './IGameTransport'

export interface StationNetworkEvents {
  onConnection: (status: ConnectionLevel) => void
  onMessage: (message: WireMessage) => void
  onError: (message: string) => void
}

const HOST_SILENCE_LIMIT_MS = 12_000

export class StationNetwork implements IGameTransport<WireMessage, ConnectionLevel> {
  private peer?: Peer
  private connection?: DataConnection
  private retryTimer?: number
  private watchdogTimer?: number
  private stopped = false
  private rebuilding = false
  private retryAttempt = 0
  private connectionAttemptInProgress = false
  private lastMessageAt = 0
  private readonly messageListeners = new Set<(message: WireMessage) => void>()
  private readonly statusListeners = new Set<(status: ConnectionLevel) => void>()

  constructor(
    private readonly roomCode: string,
    private readonly stationId: string,
    private readonly stationName: string,
    private readonly events: StationNetworkEvents,
  ) {}

  start(): void {
    this.stopped = false
    this.rebuilding = false
    this.connectionAttemptInProgress = false
    this.openPeer()
  }

  connect(): void { this.start() }

  send(message: WireMessage): boolean {
    if (!this.connection?.open) return false
    try {
      this.connection.send(message)
      return true
    } catch {
      this.forceReconnect()
      return false
    }
  }

  isConnected(): boolean {
    return this.connection?.open === true && Date.now() - this.lastMessageAt < HOST_SILENCE_LIMIT_MS
  }

  recoverIfDisconnected(): boolean {
    if (this.stopped || this.rebuilding || this.connectionAttemptInProgress || !navigator.onLine) return false
    if (document.visibilityState !== 'visible') return false
    if (this.connection?.open && Date.now() - this.lastMessageAt < HOST_SILENCE_LIMIT_MS) return false
    this.forceReconnect()
    return true
  }

  forceReconnect(): void {
    if (this.stopped || this.rebuilding) return
    this.rebuilding = true
    this.connectionAttemptInProgress = false
    this.retryAttempt = 0
    this.clearTimers()

    const oldConnection = this.connection
    const oldPeer = this.peer
    this.connection = undefined
    this.peer = undefined
    oldConnection?.close()
    oldPeer?.destroy()
    this.emitConnection('connecting')

    window.setTimeout(() => {
      if (this.stopped) return
      this.rebuilding = false
      this.openPeer()
    }, 180)
  }

  simulateDrop(): void { this.connection?.close() }

  stop(): void {
    this.stopped = true
    this.rebuilding = false
    this.connectionAttemptInProgress = false
    this.clearTimers()
    const connection = this.connection
    const peer = this.peer
    this.connection = undefined
    this.peer = undefined
    connection?.close()
    peer?.destroy()
  }

  disconnect(): void { this.stop() }

  onMessage(handler: (message: WireMessage) => void): () => void {
    this.messageListeners.add(handler); return () => this.messageListeners.delete(handler)
  }

  onStatus(handler: (status: ConnectionLevel) => void): () => void {
    this.statusListeners.add(handler); return () => this.statusListeners.delete(handler)
  }

  private openPeer(): void {
    if (this.stopped) return
    this.emitConnection('connecting')
    const peer = new Peer({ debug: 1 })
    this.peer = peer
    peer.on('open', () => {
      if (this.peer === peer) this.connectToHost()
    })
    peer.on('error', (error) => {
      if (this.peer !== peer || this.stopped || this.rebuilding) return
      this.connectionAttemptInProgress = false
      this.events.onError(`PeerJS: ${error.message}`)
      this.scheduleReconnect()
    })
    peer.on('disconnected', () => {
      if (this.peer === peer && !this.rebuilding) this.scheduleReconnect()
    })
  }

  private connectToHost(): void {
    if (this.stopped || this.rebuilding || !this.peer?.open || this.connection?.open || this.connectionAttemptInProgress) return
    this.connectionAttemptInProgress = true
    this.emitConnection('connecting')
    const connection = this.peer.connect(hostPeerId(this.roomCode), { reliable: true, serialization: 'json' })
    this.connection = connection
    connection.on('open', () => {
      if (this.connection !== connection) {
        connection.close()
        return
      }
      this.connectionAttemptInProgress = false
      this.retryAttempt = 0
      this.lastMessageAt = Date.now()
      this.emitConnection('connected')
      this.startWatchdog()
      connection.send({ type: 'HELLO', stationId: this.stationId, stationName: this.stationName } satisfies WireMessage)
    })
    connection.on('data', (raw) => this.handleMessage(raw as WireMessage))
    const recoverCurrentConnection = () => {
      if (this.connection !== connection || this.stopped || this.rebuilding) return
      this.connectionAttemptInProgress = false
      this.scheduleReconnect()
    }
    connection.on('close', recoverCurrentConnection)
    connection.on('error', recoverCurrentConnection)
  }

  private handleMessage(message: WireMessage): void {
    this.lastMessageAt = Date.now()
    if (message.type === 'PING') {
      this.send({ type: 'PONG', id: message.id, sentAt: message.sentAt })
      return
    }
    this.events.onMessage(message)
    this.messageListeners.forEach((listener) => listener(message))
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) window.clearInterval(this.watchdogTimer)
    this.watchdogTimer = window.setInterval(() => {
      if (this.stopped || this.rebuilding || document.visibilityState !== 'visible' || !navigator.onLine) return
      if (!this.connection?.open || Date.now() - this.lastMessageAt >= HOST_SILENCE_LIMIT_MS) this.forceReconnect()
    }, 3000)
  }

  private scheduleReconnect(immediate = false): void {
    if (this.stopped || this.rebuilding || this.retryTimer) return
    this.emitConnection('disconnected')
    const delay = immediate ? 0 : Math.min(1000 * 2 ** this.retryAttempt, 10000)
    this.retryAttempt += 1
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined
      if (this.stopped) return
      if (this.peer?.destroyed) {
        this.forceReconnect()
      } else if (this.peer?.disconnected) {
        this.peer.reconnect()
        window.setTimeout(() => this.connectToHost(), 300)
      } else {
        this.connectToHost()
      }
    }, delay)
  }

  private clearTimers(): void {
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    if (this.watchdogTimer) window.clearInterval(this.watchdogTimer)
    this.retryTimer = undefined
    this.watchdogTimer = undefined
  }

  private emitConnection(status: ConnectionLevel): void {
    this.events.onConnection(status)
    this.statusListeners.forEach((listener) => listener(status))
  }
}
