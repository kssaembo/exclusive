import type { GameState, TradeRequest, TradeResult } from '../types'

const clone = <T,>(value: T): T => structuredClone(value)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class GameEngine {
  private state: GameState
  private readonly completed = new Map<string, TradeResult>()
  private readonly pending = new Map<string, Promise<TradeResult>>()
  private readonly listeners = new Set<(state: GameState) => void>()

  constructor(initialState: GameState) {
    this.state = clone(initialState)
  }

  getState(): GameState {
    return clone(this.state)
  }

  replaceState(state: GameState): void {
    this.state = clone({ ...state, lockedTeamIds: [] })
    this.emit()
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  execute(request: TradeRequest): Promise<TradeResult> {
    const completed = this.completed.get(request.transactionId)
    if (completed) return Promise.resolve({ ...clone(completed), duplicateRequest: true })

    const pending = this.pending.get(request.transactionId)
    if (pending) return pending.then((result) => ({ ...clone(result), duplicateRequest: true }))

    const operation = this.process(request)
      .then((result) => {
        this.completed.set(request.transactionId, clone(result))
        if (this.completed.size > 500) this.completed.delete(this.completed.keys().next().value as string)
        return result
      })
      .finally(() => this.pending.delete(request.transactionId))

    this.pending.set(request.transactionId, operation)
    return operation
  }

  private async process(request: TradeRequest): Promise<TradeResult> {
    const fail = (code: Exclude<TradeResult, { ok: true }>['code'], message: string): TradeResult => ({
      ok: false,
      transactionId: request.transactionId,
      code,
      message,
      state: this.getState(),
    })

    if (request.teamAId === request.teamBId) return fail('INVALID_TEAM', '서로 다른 두 팀을 선택해야 합니다.')
    if (request.teamACardIds.length === 0) return fail('EMPTY_TRADE', '교환할 카드를 선택하세요.')
    if (request.teamACardIds.length !== request.teamBCardIds.length) return fail('UNEQUAL_CARD_COUNT', '양 팀의 카드 수가 같아야 합니다.')

    const teamA = this.state.teams.find((team) => team.id === request.teamAId)
    const teamB = this.state.teams.find((team) => team.id === request.teamBId)
    if (!teamA || !teamB) return fail('INVALID_TEAM', '존재하지 않는 팀입니다.')

    if (this.state.lockedTeamIds.includes(teamA.id) || this.state.lockedTeamIds.includes(teamB.id)) {
      return fail('TEAM_LOCKED', '다른 거래소가 이 팀을 거래 중입니다.')
    }
    if (request.expectedTeamVersions[teamA.id] !== teamA.version || request.expectedTeamVersions[teamB.id] !== teamB.version) {
      return fail('VERSION_CONFLICT', '화면의 팀 상태가 최신이 아닙니다. 동기화 후 다시 시도하세요.')
    }

    const aCards = request.teamACardIds.map((id) => teamA.cards.find((card) => card.id === id))
    const bCards = request.teamBCardIds.map((id) => teamB.cards.find((card) => card.id === id))
    if (aCards.some((card) => !card) || bCards.some((card) => !card)) return fail('INVALID_CARD', '이미 이동했거나 존재하지 않는 카드입니다.')

    this.state.lockedTeamIds.push(teamA.id, teamB.id)
    this.emit()
    try {
      await wait(request.processingDelayMs ?? 450)
      teamA.cards = [...teamA.cards.filter((card) => !request.teamACardIds.includes(card.id)), ...(bCards as NonNullable<(typeof bCards)[number]>[])]
      teamB.cards = [...teamB.cards.filter((card) => !request.teamBCardIds.includes(card.id)), ...(aCards as NonNullable<(typeof aCards)[number]>[])]
      teamA.version += 1
      teamB.version += 1
      this.state.version += 1
      this.state.updatedAt = Date.now()
      return { ok: true, transactionId: request.transactionId, state: this.getStateWithoutLocks() }
    } catch {
      return fail('INTERNAL_ERROR', '거래 처리 중 예기치 않은 오류가 발생했습니다.')
    } finally {
      this.state.lockedTeamIds = this.state.lockedTeamIds.filter((id) => id !== teamA.id && id !== teamB.id)
      this.emit()
    }
  }

  private getStateWithoutLocks(): GameState {
    return clone({ ...this.state, lockedTeamIds: [] })
  }

  private emit(): void {
    const snapshot = this.getState()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
