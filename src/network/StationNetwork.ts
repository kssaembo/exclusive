import Peer, { type DataConnection } from 'peerjs'
import type { ConnectionLevel, WireMessage } from '../types'
import { hostPeerId } from './ids'

interface StationNetworkEvents {
  onConnection: (status: ConnectionLevel) => void
  onMessage: (message: WireMessage) => void
  onError: (message: string) => void
}

export class StationNetwork {
  private peer?: Peer
  private connection?: DataConnection
  private retryTimer?: number
  private stopped = false
  private retryAttempt = 0

  constructor(
    private readonly roomCode: string,
    private readonly stationId: string,
    private readonly stationName: string,
    private readonly events: StationNetworkEvents,
  ) {}

  start(): void {
    this.stopped = false
    this.events.onConnection('connecting')
    this.peer = new Peer({ debug: 1 })
    this.peer.on('open', () => this.connect())
    this.peer.on('error', (error) => {
      this.events.onError(`PeerJS: ${error.message}`)
      this.scheduleReconnect()
    })
    this.peer.on('disconnected', () => this.scheduleReconnect())
  }

  send(message: WireMessage): boolean {
    if (!this.connection?.open) return false
    this.connection.send(message)
    return true
  }

  forceReconnect(): void {
    this.connection?.close()
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.retryAttempt = 0
    this.scheduleReconnect(true)
  }

  simulateDrop(): void {
    this.connection?.close()
  }

  stop(): void {
    this.stopped = true
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.connection?.close()
    this.peer?.destroy()
  }

  private connect(): void {
    if (this.stopped || !this.peer?.open) return
    this.events.onConnection('connecting')
    const connection = this.peer.connect(hostPeerId(this.roomCode), { reliable: true, serialization: 'json' })
    this.connection = connection
    connection.on('open', () => {
      this.retryAttempt = 0
      this.events.onConnection('connected')
      connection.send({ type: 'HELLO', stationId: this.stationId, stationName: this.stationName } satisfies WireMessage)
    })
    connection.on('data', (raw) => this.handleMessage(raw as WireMessage))
    connection.on('close', () => this.scheduleReconnect())
    connection.on('error', () => this.scheduleReconnect())
  }

  private handleMessage(message: WireMessage): void {
    if (message.type === 'PING') {
      this.send({ type: 'PONG', id: message.id, sentAt: message.sentAt })
      return
    }
    this.events.onMessage(message)
  }

  private scheduleReconnect(immediate = false): void {
    if (this.stopped || this.retryTimer) return
    this.events.onConnection('disconnected')
    const delay = immediate ? 0 : Math.min(1000 * 2 ** this.retryAttempt, 10000)
    this.retryAttempt += 1
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined
      if (this.peer?.destroyed) {
        this.start()
      } else if (this.peer?.disconnected) {
        this.peer.reconnect()
        window.setTimeout(() => this.connect(), 300)
      } else {
        this.connect()
      }
    }, delay)
  }
}
