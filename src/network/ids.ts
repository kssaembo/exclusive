export const HOST_PREFIX = 'exclusive-game-v1-'

export function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function hostPeerId(roomCode: string): string {
  return `${HOST_PREFIX}${roomCode.toLowerCase()}`
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}
