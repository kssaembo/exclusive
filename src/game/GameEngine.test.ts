import { describe, expect, it } from 'vitest'
import type { TradeRequest } from '../types'
import { GameEngine } from './GameEngine'
import { createInitialState } from './initialState'

function activeEngine() {
  const engine = new GameEngine(createInitialState(8, () => 0.42)); engine.startGame(); return engine
}

function request(engine: GameEngine, a: number, b: number, tradeId: string): TradeRequest {
  const state = engine.getState(); const playerA = state.players[a]; const playerB = state.players[b]
  const authA = engine.authenticate(playerA.accessCode, 'test-station')!
  const authB = engine.authenticate(playerB.accessCode, 'test-station')!
  return {
    tradeId, stationId: 'test-station', playerAId: playerA.id, playerBId: playerB.id,
    playerACardIds: [playerA.cards[0].id], playerBCardIds: [playerB.cards[0].id],
    playerAAuthToken: authA.authToken, playerBAuthToken: authB.authToken,
    expectedPlayerVersions: { [playerA.id]: playerA.version, [playerB.id]: playerB.version }, processingDelayMs: 5,
  }
}

describe('GameEngine', () => {
  it('keeps private cards out of public state', () => {
    const publicState = activeEngine().getPublicState()
    expect(publicState.players[0]).not.toHaveProperty('cards')
    expect(publicState.players[0]).not.toHaveProperty('accessCode')
  })

  it('requires an active game for authentication and trades', async () => {
    const engine = new GameEngine(createInitialState(8, () => 0.42))
    expect(engine.authenticate(engine.getState().players[0].accessCode, 'test-station')).toBeNull()
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

  it('rejects an auth token issued to another station', async () => {
    const engine = activeEngine(); const invalid = request(engine, 0, 1, 'auth-station')
    invalid.stationId = 'other-station'
    expect(await engine.execute(invalid)).toMatchObject({ ok: false, code: 'INVALID_AUTH' })
  })

  it('only ends the game when the teacher approves a valid monopoly', () => {
    const state = createInitialState(8, () => 0.42)
    const coal = state.players.flatMap((player) => player.cards.filter((card) => card.type === 'coal'))
    state.players.forEach((player) => { player.cards = player.cards.filter((card) => card.type !== 'coal') })
    state.players[0].cards.push(...coal)
    const engine = new GameEngine(state); engine.startGame()
    const auth = engine.authenticate(engine.getState().players[0].accessCode, 'station-1')!
    const claim = engine.createClaim('claim-1', 'station-1', auth.id, auth.authToken, 'coal')!
    expect(claim.status).toBe('pending')
    expect(engine.resolveClaim(claim.claimId, true)?.status).toBe('approved')
    expect(engine.getState().phase).toBe('ended')
  })
})
