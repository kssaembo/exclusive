import type { GameState } from '../types'
import { createDeck, shuffle } from './rules'

const DEFAULT_NAMES = ['사자', '호랑이', '늑대', '여우', '독수리', '곰', '상어', '용', '판다', '문어', '펭귄', '돌고래']

function accessCode(index: number): string {
  return String(1100 + index * 137).slice(-4).padStart(4, '0')
}

export function createInitialState(playerCount = 8, random: () => number = Math.random): GameState {
  const safeCount = Math.max(2, Math.min(16, Math.floor(playerCount)))
  const deck = shuffle(createDeck(), random)
  const cardsPerPlayer = Math.floor(deck.length / safeCount)
  const players = Array.from({ length: safeCount }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `${DEFAULT_NAMES[index] ?? index + 1}팀`,
    accessCode: accessCode(index + 1),
    cards: deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer),
    version: 1,
  }))
  return {
    gameId: crypto.randomUUID(), phase: 'setup', version: 1,
    settings: { playerCount: safeCount, cardsPerPlayer }, players,
    undealtCards: deck.slice(safeCount * cardsPerPlayer), lockedPlayerIds: [],
    trades: [], claims: [], updatedAt: Date.now(),
  }
}
