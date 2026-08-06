import { describe, expect, it } from 'vitest'
import { GameEngine } from './GameEngine'
import { createInitialState } from './initialState'
import type { TradeRequest } from '../types'

function request(engine: GameEngine, a: number, b: number, transactionId: string): TradeRequest {
  const state = engine.getState()
  return {
    transactionId,
    stationId: 'test-station',
    teamAId: state.teams[a].id,
    teamBId: state.teams[b].id,
    teamACardIds: [state.teams[a].cards[0].id],
    teamBCardIds: [state.teams[b].cards[0].id],
    expectedTeamVersions: { [state.teams[a].id]: state.teams[a].version, [state.teams[b].id]: state.teams[b].version },
    processingDelayMs: 5,
  }
}

describe('GameEngine', () => {
  it('executes a valid equal-card trade', async () => {
    const engine = new GameEngine(createInitialState())
    const before = engine.getState()
    const result = await engine.execute(request(engine, 0, 1, 'normal'))
    expect(result.ok).toBe(true)
    expect(engine.getState().version).toBe(before.version + 1)
    expect(engine.getState().teams[0].cards).toHaveLength(4)
  })

  it('allows simultaneous trades using different teams', async () => {
    const engine = new GameEngine(createInitialState())
    const results = await Promise.all([engine.execute(request(engine, 0, 1, 'parallel-a')), engine.execute(request(engine, 2, 3, 'parallel-b'))])
    expect(results.every((result) => result.ok)).toBe(true)
    expect(engine.getState().version).toBe(3)
  })

  it('rejects one simultaneous trade when a team overlaps', async () => {
    const engine = new GameEngine(createInitialState())
    const results = await Promise.all([engine.execute(request(engine, 0, 1, 'collision-a')), engine.execute(request(engine, 0, 2, 'collision-b'))])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toMatchObject({ code: 'TEAM_LOCKED' })
  })

  it('returns a cached result for a duplicate transaction id without applying twice', async () => {
    const engine = new GameEngine(createInitialState())
    const sameRequest = request(engine, 4, 5, 'duplicate')
    const results = await Promise.all([engine.execute(sameRequest), engine.execute(sameRequest)])
    expect(results.every((result) => result.ok)).toBe(true)
    expect(results.some((result) => result.duplicateRequest)).toBe(true)
    expect(engine.getState().version).toBe(2)
  })

  it('rejects stale team versions', async () => {
    const engine = new GameEngine(createInitialState())
    const stale = request(engine, 0, 1, 'stale')
    stale.expectedTeamVersions[stale.teamAId] = 0
    const result = await engine.execute(stale)
    expect(result).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' })
  })
})
