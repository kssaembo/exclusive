import type { GameSetup, GameState } from '../types'
import { createDeck, getDeckRules, shuffle } from './rules'

export const DEFAULT_NAMES = ['사자팀', '호랑이팀', '늑대팀', '여우팀', '독수리팀', '곰팀', '상어팀', '용팀']
export const DEFAULT_SETUP: GameSetup = { playerNames: DEFAULT_NAMES, durationMinutes: 60 }
export function createInitialState(setupOrCount: GameSetup | number = DEFAULT_SETUP, random: () => number = Math.random): GameState {
  const fallbackCount = typeof setupOrCount === 'number' ? Math.max(6, Math.min(15, setupOrCount)) : setupOrCount.playerNames.length
  const setup = typeof setupOrCount === 'number'
    ? { ...DEFAULT_SETUP, playerNames: Array.from({ length: fallbackCount }, (_, index) => DEFAULT_NAMES[index] ?? `플레이어 ${index + 1}`) }
    : { ...DEFAULT_SETUP, ...setupOrCount, playerNames: setupOrCount.playerNames.slice(0, 15) }
  const names = setup.playerNames.map((name, index) => name.trim() || `플레이어 ${index + 1}`).slice(0, 15)
  if (names.length < 6) throw new Error('플레이어는 6명 이상이어야 합니다.')
  const deckRules = getDeckRules(names.length)
  const deck = shuffle(createDeck(deckRules), random)
  const players = names.map((name, index) => ({ id: `player-${index + 1}`, name, cards: deck.slice(index * 8, (index + 1) * 8), version: 1 }))
  return { gameId: crypto.randomUUID(), phase: 'setup', version: 1, settings: { playerCount: names.length, cardsPerPlayer: 8, durationMinutes: Math.max(1, Math.min(90, setup.durationMinutes)), bombPenalty: 15, bombReverseMonopoly: true, deckRules }, players, undealtCards: [], lockedPlayerIds: [], trades: [], claims: [], resultsRevealed: false, updatedAt: Date.now() }
}
