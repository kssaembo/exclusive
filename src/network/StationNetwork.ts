import Peer, { type DataConnection } from 'peerjs'
import type { ConnectionLevel, WireMessage } from '../types'
import { hostPeerId } from './ids'
import type { IGameTransport } from './IGameTransport'

export interface StationNetworkEvents {
  onConnection: (status: ConnectionLevel) => void
  onMessage: (message: WireMessage) => void
  onError: (message: string) => void
}

export class StationNetwork implements IGameTransport<WireMessage, ConnectionLevel> {
  private peer?: Peer
  private connection?: DataConnection
  private retryTimer?: number
  private stopped = false
  private retryAttempt = 0
  private connectionAttemptInProgress = false
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
    this.connectionAttemptInProgress = false
    this.events.onConnection('connecting')
    this.statusListeners.forEach((listener) => listener('connecting'))
    this.peer = new Peer({ debug: 1 })
    this.peer.on('open', () => this.connectToHost())
    this.peer.on('error', (error) => {
      this.connectionAttemptInProgress = false
      this.events.onError(`PeerJS: ${error.message}`)
      this.scheduleReconnect()
    })
    this.peer.on('disconnected', () => this.scheduleReconnect())
  }

  connect(): void { this.start() }

  send(message: WireMessage): boolean {
    if (!this.connection?.open) return false
    this.connection.send(message)
    return true
  }

  isConnected(): boolean {
    return this.connection?.open === true
  }

  recoverIfDisconnected(): boolean {
    if (this.stopped || this.isConnected() || this.connectionAttemptInProgress) return false
    this.scheduleReconnect(true)
    return true
  }

  forceReconnect(): void {
    this.connection?.close()
    this.connectionAttemptInProgress = false
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.retryAttempt = 0
    this.scheduleReconnect(true)
  }

  simulateDrop(): void {
    this.connection?.close()
  }

  stop(): void {
    this.stopped = true
    this.connectionAttemptInProgress = false
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.connection?.close()
    this.peer?.destroy()
  }

  disconnect(): void { this.stop() }

  onMessage(handler: (message: WireMessage) => void): () => void {
    this.messageListeners.add(handler); return () => this.messageListeners.delete(handler)
  }

  onStatus(handler: (status: ConnectionLevel) => void): () => void {
    this.statusListeners.add(handler); return () => this.statusListeners.delete(handler)
  }

  private connectToHost(): void {
    if (this.stopped || !this.peer?.open || this.isConnected() || this.connectionAttemptInProgress) return
    this.connectionAttemptInProgress = true
    this.events.onConnection('connecting')
    const connection = this.peer.connect(hostPeerId(this.roomCode), { reliable: true, serialization: 'json' })
    this.connection = connection
    connection.on('open', () => {
      if (this.connection !== connection) {
        connection.close()
        return
      }
      this.connectionAttemptInProgress = false
      this.retryAttempt = 0
      this.events.onConnection('connected')
      this.statusListeners.forEach((listener) => listener('connected'))
      connection.send({ type: 'HELLO', stationId: this.stationId, stationName: this.stationName } satisfies WireMessage)
    })
    connection.on('data', (raw) => this.handleMessage(raw as WireMessage))
    const recoverCurrentConnection = () => {
      if (this.connection !== connection) return
      this.connectionAttemptInProgress = false
      this.scheduleReconnect()
    }
    connection.on('close', recoverCurrentConnection)
    connection.on('error', recoverCurrentConnection)
  }

  private handleMessage(message: WireMessage): void {
    if (message.type === 'PING') {
      this.send({ type: 'PONG', id: message.id, sentAt: message.sentAt })
      return
    }
    this.events.onMessage(message)
    this.messageListeners.forEach((listener) => listener(message))
  }

  private scheduleReconnect(immediate = false): void {
    if (this.stopped || this.retryTimer) return
    this.events.onConnection('disconnected')
    this.statusListeners.forEach((listener) => listener('disconnected'))
    const delay = immediate ? 0 : Math.min(1000 * 2 ** this.retryAttempt, 10000)
    this.retryAttempt += 1
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined
      if (this.peer?.destroyed) {
        this.start()
      } else if (this.peer?.disconnected) {
        this.peer.reconnect()
        window.setTimeout(() => this.connectToHost(), 300)
      } else {
        this.connectToHost()
      }
    }, delay)
  }
}
