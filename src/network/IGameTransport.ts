export interface IGameTransport<TMessage, TStatus = unknown> {
  connect(): void
  disconnect(): void
  send(message: TMessage, recipientId?: string): boolean
  onMessage(handler: (message: TMessage, senderId?: string) => void): () => void
  onStatus(handler: (status: TStatus) => void): () => void
}
