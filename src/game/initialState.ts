import type { GameSetup, GameState } from '../types'
import { createDeck, shuffle } from './rules'

export const DEFAULT_NAMES = ['사자팀', '호랑이팀', '늑대팀', '여우팀', '독수리팀', '곰팀', '상어팀', '용팀']
function accessCode(index: number): string { return String(1100 + index * 137).slice(-4).padStart(4, '0') }
export const DEFAULT_SETUP: GameSetup = { playerNames: DEFAULT_NAMES, durationMinutes: 20, bombPenalty: 15, bombReverseMonopoly: true }
export function createInitialState(setupOrCount: GameSetup | number = DEFAULT_SETUP, random: () => number = Math.random): GameState {
  const setup = typeof setupOrCount === 'number' ? DEFAULT_SETUP : { ...DEFAULT_SETUP, ...setupOrCount, playerNames: setupOrCount.playerNames.slice(0, 8) }
  const names = Array.from({ length: 8 }, (_, index) => setup.playerNames[index]?.trim() || DEFAULT_NAMES[index]); const deck = shuffle(createDeck(), random)
  const players = names.map((name, index) => ({ id: `player-${index + 1}`, name, accessCode: accessCode(index + 1), cards: deck.slice(index * 8, (index + 1) * 8), version: 1 }))
  return { gameId: crypto.randomUUID(), phase: 'setup', version: 1, settings: { playerCount: 8, cardsPerPlayer: 8, durationMinutes: Math.max(1, Math.min(90, setup.durationMinutes)), bombPenalty: Math.max(0, Math.min(50, setup.bombPenalty)), bombReverseMonopoly: setup.bombReverseMonopoly }, players, undealtCards: [], lockedPlayerIds: [], trades: [], claims: [], updatedAt: Date.now() }
}
