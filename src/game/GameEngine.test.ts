import { describe, expect, it } from 'vitest'
import type { TradeRequest } from '../types'
import { GameEngine } from './GameEngine'
import { createInitialState } from './initialState'
import { getDeckRules } from './rules'

function activeEngine(playerCount = 8) {
  const engine = new GameEngine(createInitialState(playerCount, () => 0.42)); engine.startGame(); return engine
}

function request(engine: GameEngine, a: number, b: number, tradeId: string): TradeRequest {
  const state = engine.getState(); const playerA = state.players[a]; const playerB = state.players[b]
  const selectedA = engine.selectPlayer(playerA.id, 'test-station')!
  const selectedB = engine.selectPlayer(playerB.id, 'test-station')!
  return {
    tradeId, stationId: 'test-station', playerAId: playerA.id, playerBId: playerB.id,
    playerACardIds: [playerA.cards[0].id], playerBCardIds: [playerB.cards[0].id],
    playerAAuthToken: selectedA.authToken, playerBAuthToken: selectedB.authToken,
    expectedPlayerVersions: { [playerA.id]: playerA.version, [playerB.id]: playerB.version }, processingDelayMs: 5,
  }
}

describe('variable classroom deck', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index + 6))('deals a complete balanced deck for %i players', (playerCount) => {
    const state = createInitialState(playerCount, () => 0.42)
    const rules = getDeckRules(playerCount)
    expect(state.players).toHaveLength(playerCount)
    expect(state.players.every((player) => player.cards.length === 8)).toBe(true)
    expect(state.players.flatMap((player) => player.cards)).toHaveLength(playerCount * 8)
    expect(rules.filter((rule) => rule.type !== 'bomb')).toHaveLength(playerCount)
    expect(rules.filter((rule) => rule.type !== 'bomb').every((rule) => rule.count === 7 || rule.count === 8)).toBe(true)
    expect(rules.find((rule) => rule.type === 'bomb')?.count).toBe(Math.round(playerCount * 5 / 8))
    expect(rules.reduce((sum, rule) => sum + rule.count, 0)).toBe(playerCount * 8)
    expect(state.undealtCards).toHaveLength(0)
  })
})

describe('GameEngine', () => {
  it('keeps private cards and selection tokens out of public state', () => {
    const publicState = activeEngine().getPublicState()
    expect(publicState.players[0]).not.toHaveProperty('cards')
    expect(publicState.players[0]).not.toHaveProperty('authToken')
  })

  it('requires an active game before a player can be selected', () => {
    const engine = new GameEngine(createInitialState(8, () => 0.42))
    expect(engine.selectPlayer(engine.getState().players[0].id, 'test-station')).toBeNull()
  })

  it('executes a valid equal-card trade', async () => {
    const engine = activeEngine(); const before = engine.getState()
    const result = await engine.execute(request(engine, 0, 1, 'normal'))
    expect(result.ok).toBe(true); expect(engine.getState().version).toBe(before.version + 1)
    expect(engine.getState().players[0].cards).toHaveLength(8)
  })

  it('allows simultaneous trades using different players', async () => {
    const engine = activeEngine()
    const results = await Promise.all([engine.execute(request(engine, 0, 1, 'parallel-a')), engine.execute(request(engine, 2, 3, 'parallel-b'))])
    expect(results.every((result) => result.ok)).toBe(true)
  })

  it('rejects one simultaneous trade when a player overlaps', async () => {
    const engine = activeEngine()
    const results = await Promise.all([engine.execute(request(engine, 0, 1, 'collision-a')), engine.execute(request(engine, 0, 2, 'collision-b'))])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toMatchObject({ code: 'PLAYER_LOCKED' })
  })

  it('returns a cached result for duplicate TradeID without applying twice', async () => {
    const engine = activeEngine(); const sameRequest = request(engine, 4, 5, 'duplicate')
    const beforeVersion = engine.getState().version
    const results = await Promise.all([engine.execute(sameRequest), engine.execute(sameRequest)])
    expect(results.every((result) => result.ok)).toBe(true)
    expect(results.some((result) => result.duplicateRequest)).toBe(true)
    expect(engine.getState().version).toBe(beforeVersion + 1)
  })

  it('uses backed-up trade history to block replay after host restoration', async () => {
    const engine = activeEngine(); const sameRequest = request(engine, 0, 1, 'persisted-duplicate')
    await engine.execute(sameRequest)
    const restored = new GameEngine(engine.getState())
    const beforeVersion = restored.getState().version
    expect(await restored.execute(sameRequest)).toMatchObject({ ok: false, code: 'DUPLICATE_TRADE', duplicateRequest: true })
    expect(restored.getState().version).toBe(beforeVersion)
  })

  it('rejects stale player versions', async () => {
    const engine = activeEngine(); const stale = request(engine, 0, 1, 'stale')
    stale.expectedPlayerVersions[stale.playerAId] = 0
    expect(await engine.execute(stale)).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' })
  })

  it('keeps an internal player selection session scoped to one station', async () => {
    const engine = activeEngine(); const invalid = request(engine, 0, 1, 'session-station')
    invalid.stationId = 'other-station'
    expect(await engine.execute(invalid)).toMatchObject({ ok: false, code: 'INVALID_AUTH' })
  })

  it('only ends the game when the teacher approves a valid resource monopoly', () => {
    const state = createInitialState(10, () => 0.42)
    const target = state.settings.deckRules.find((rule) => rule.type !== 'bomb')!
    const cards = state.players.flatMap((player) => player.cards.filter((card) => card.type === target.type))
    state.players.forEach((player) => { player.cards = player.cards.filter((card) => card.type !== target.type) })
    state.players[0].cards.push(...cards)
    const engine = new GameEngine(state); engine.startGame()
    const selected = engine.selectPlayer(engine.getState().players[0].id, 'station-1')!
    const claim = engine.createClaim('claim-1', 'station-1', selected.id, selected.authToken, target.type)!
    expect(claim.status).toBe('pending')
    expect(engine.resolveClaim(claim.claimId, true)?.status).toBe('approved')
    expect(engine.getState().phase).toBe('ended')
  })

  it('supports a player-count-adjusted bomb reverse monopoly', () => {
    const state = createInitialState(15, () => 0.42)
    const bombs = state.players.flatMap((player) => player.cards.filter((card) => card.type === 'bomb'))
    expect(bombs).toHaveLength(9)
    state.players.forEach((player) => { player.cards = player.cards.filter((card) => card.type !== 'bomb') })
    state.players[0].cards.push(...bombs)
    const engine = new GameEngine(state); engine.startGame()
    const selected = engine.selectPlayer(engine.getState().players[0].id, 'station-1')!
    const claim = engine.createClaim('bomb-claim', 'station-1', selected.id, selected.authToken, 'bomb')!
    expect(engine.resolveClaim(claim.claimId, true)?.status).toBe('approved')
    expect(engine.getState()).toMatchObject({ phase: 'ended', winnerResourceType: 'bomb', endReason: 'monopoly' })
  })

  it('automatically stops after a trade creates a monopoly and reveals rankings only on command', async () => {
    const state = createInitialState(8, () => 0.42)
    const target = state.settings.deckRules.find((rule) => rule.type !== 'bomb' && rule.count === 8)!
    const allCards = state.players.flatMap((player) => player.cards)
    const targetCards = allCards.filter((card) => card.type === target.type)
    const otherCards = allCards.filter((card) => card.type !== target.type)
    state.players[0].cards = [...targetCards.slice(0, 7), otherCards[0]]
    state.players[1].cards = [targetCards[7], ...otherCards.slice(1, 8)]
    const remaining = otherCards.slice(8)
    state.players.slice(2).forEach((player, index) => { player.cards = remaining.slice(index * 8, (index + 1) * 8) })
    const engine = new GameEngine(state); engine.startGame()
    const playerA = engine.getState().players[0]; const playerB = engine.getState().players[1]
    const selectedA = engine.selectPlayer(playerA.id, 'station-auto')!; const selectedB = engine.selectPlayer(playerB.id, 'station-auto')!
    const result = await engine.execute({
      tradeId: 'automatic-monopoly', stationId: 'station-auto', playerAId: playerA.id, playerBId: playerB.id,
      playerACardIds: [otherCards[0].id], playerBCardIds: [targetCards[7].id],
      playerAAuthToken: selectedA.authToken, playerBAuthToken: selectedB.authToken,
      expectedPlayerVersions: { [playerA.id]: playerA.version, [playerB.id]: playerB.version }, processingDelayMs: 1,
    })
    expect(result).toMatchObject({ ok: true, publicState: { phase: 'ended', endReason: 'monopoly', resultsRevealed: false } })
    if (result.ok) expect(result.publicState.winnerPlayerId).toBeUndefined()
    expect(engine.getState().winnerPlayerId).toBe(playerA.id)
    expect(engine.getPublicState().rankings).toBeUndefined()
    engine.revealResults()
    expect(engine.getPublicState().resultsRevealed).toBe(true)
    expect(engine.getPublicState().rankings).toHaveLength(8)
  })

  it('calculates final rankings with the fixed 15-point bomb penalty', () => {
    const engine = activeEngine(12); engine.endGame('timeout')
    expect(engine.getState().rankings).toBeUndefined()
    engine.revealResults()
    const state = engine.getState()
    expect(state.rankings).toHaveLength(12)
    expect(state.settings.bombPenalty).toBe(15)
    expect(state.rankings?.[0].rank).toBe(1)
    expect(state.winnerPlayerId).toBe(state.rankings?.[0].playerId)
  })
})
