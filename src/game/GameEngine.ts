import type {
  GameState, MonopolyClaim, Player, PlayerSnapshot, PublicGameState, ResourceType,
  EndReason, TradeFailureCode, TradeRecord, TradeRequest, TradeResult,
} from '../types'
import { buildRankings, MONOPOLY_RULES } from './rules'

const clone = <T,>(value: T): T => structuredClone(value)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
interface AuthSession { playerId: string; stationId: string; gameId: string }

export class GameEngine {
  private state: GameState
  private readonly completed = new Map<string, TradeResult>()
  private readonly pending = new Map<string, Promise<TradeResult>>()
  private readonly authSessions = new Map<string, AuthSession>()
  private readonly listeners = new Set<(state: GameState) => void>()

  constructor(initialState: GameState) { this.state = clone(initialState) }
  getState(): GameState { return clone(this.state) }
  getPublicState(): PublicGameState {
    return {
      gameId: this.state.gameId, phase: this.state.phase, version: this.state.version,
      players: this.state.players.map((player) => ({
        id: player.id, name: player.name, cardCount: player.cards.length, version: player.version,
        locked: this.state.lockedPlayerIds.includes(player.id),
      })), settings: { durationMinutes: this.state.settings.durationMinutes }, tradeCount: this.state.trades.filter((trade) => trade.status === 'success').length,
      winnerPlayerId: this.state.winnerPlayerId, winnerResourceType: this.state.winnerResourceType,
      endReason: this.state.endReason, startedAt: this.state.startedAt, endedAt: this.state.endedAt, updatedAt: this.state.updatedAt,
    }
  }
  replaceState(state: GameState): void {
    this.state = clone({ ...state, lockedPlayerIds: [] })
    this.completed.clear(); this.pending.clear(); this.authSessions.clear(); this.emit()
  }
  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener)
  }
  startGame(): void {
    if (this.state.phase !== 'setup') return
    this.state.phase = 'active'; this.state.startedAt = Date.now(); this.touch(); this.emit()
  }
  endGame(reason: EndReason = 'manual'): void {
    if (this.state.phase === 'ended') return
    this.state.phase = 'ended'; this.state.endReason = reason; this.state.endedAt = Date.now()
    this.state.rankings = buildRankings(this.state.players, this.state.settings.bombPenalty)
    if (!this.state.winnerPlayerId && reason === 'timeout') this.state.winnerPlayerId = this.state.rankings[0]?.playerId
    this.touch(); this.emit()
  }
  authenticate(accessCode: string, stationId: string): PlayerSnapshot | null {
    if (this.state.phase !== 'active') return null
    const player = this.state.players.find((item) => item.accessCode === accessCode.trim())
    if (!player) return null
    const authToken = crypto.randomUUID()
    this.authSessions.set(authToken, { playerId: player.id, stationId, gameId: this.state.gameId })
    return this.snapshot(player, authToken)
  }
  createClaim(claimId: string, stationId: string, playerId: string, authToken: string, resourceType: ResourceType): MonopolyClaim | null {
    if (!this.isAuthorized(authToken, playerId, stationId) || this.state.phase !== 'active') return null
    const existing = this.state.claims.find((claim) => claim.claimId === claimId)
    if (existing) return clone(existing)
    const claim: MonopolyClaim = { claimId, stationId, playerId, resourceType, status: 'pending', createdAt: Date.now() }
    this.state.claims.push(claim); this.touch(); this.emit(); return clone(claim)
  }
  resolveClaim(claimId: string, approve: boolean): MonopolyClaim | null {
    const claim = this.state.claims.find((item) => item.claimId === claimId)
    if (!claim || claim.status !== 'pending') return claim ? clone(claim) : null
    const player = this.state.players.find((item) => item.id === claim.playerId)
    const required = MONOPOLY_RULES.find((rule) => rule.type === claim.resourceType)?.count ?? Number.MAX_SAFE_INTEGER
    const actual = player?.cards.filter((card) => card.type === claim.resourceType).length ?? 0
    const bombAllowed = claim.resourceType !== 'bomb' || this.state.settings.bombReverseMonopoly
    const valid = approve && bombAllowed && actual === required
    claim.status = valid ? 'approved' : 'rejected'; claim.resolvedAt = Date.now()
    claim.reason = valid ? undefined : approve && !bombAllowed ? '이 게임에서는 폭탄 역독점을 사용하지 않습니다.' : approve ? `필요 ${required}장 / 보유 ${actual}장` : '교사가 선언을 반려했습니다.'
    if (valid && player) {
      this.state.winnerPlayerId = player.id; this.state.winnerResourceType = claim.resourceType
      this.state.phase = 'ended'; this.state.endReason = 'monopoly'; this.state.endedAt = Date.now()
      this.state.rankings = buildRankings(this.state.players, this.state.settings.bombPenalty)
    }
    this.touch(); this.emit(); return clone(claim)
  }
  execute(request: TradeRequest): Promise<TradeResult> {
    const completed = this.completed.get(request.tradeId)
    if (completed) return Promise.resolve({ ...clone(completed), duplicateRequest: true })
    const pending = this.pending.get(request.tradeId)
    if (pending) return pending.then((result) => ({ ...clone(result), duplicateRequest: true }))
    if (this.state.trades.some((trade) => trade.tradeId === request.tradeId)) {
      return Promise.resolve({ ok: false, tradeId: request.tradeId, code: 'DUPLICATE_TRADE', message: '호스트 백업에 이미 처리된 TradeID입니다. 다시 적용하지 않았습니다.', publicState: this.getPublicState(), duplicateRequest: true })
    }
    const operation = this.process(request).then((result) => {
      this.completed.set(request.tradeId, clone(result))
      if (this.completed.size > 1000) this.completed.delete(this.completed.keys().next().value as string)
      return result
    }).finally(() => this.pending.delete(request.tradeId))
    this.pending.set(request.tradeId, operation); return operation
  }
  private async process(request: TradeRequest): Promise<TradeResult> {
    const processingGameId = this.state.gameId
    const fail = (code: TradeFailureCode, message: string): TradeResult => {
      this.recordTrade(request, 'failed', code)
      return { ok: false, tradeId: request.tradeId, code, message, publicState: this.getPublicState() }
    }
    if (this.state.phase !== 'active') return fail('GAME_NOT_ACTIVE', '진행 중인 게임이 아닙니다.')
    if (request.playerAId === request.playerBId) return fail('INVALID_PLAYER', '서로 다른 두 참가자를 인증해야 합니다.')
    if (!request.playerACardIds.length) return fail('EMPTY_TRADE', '교환할 카드를 선택하세요.')
    if (request.playerACardIds.length !== request.playerBCardIds.length) return fail('UNEQUAL_CARD_COUNT', '양쪽 카드 수가 같아야 합니다.')
    const playerA = this.findPlayer(request.playerAId); const playerB = this.findPlayer(request.playerBId)
    if (!playerA || !playerB) return fail('INVALID_PLAYER', '존재하지 않는 참가자입니다.')
    if (!this.isAuthorized(request.playerAAuthToken, playerA.id, request.stationId) || !this.isAuthorized(request.playerBAuthToken, playerB.id, request.stationId)) {
      return fail('INVALID_AUTH', '인증이 만료되었거나 다른 거래소에서 발급된 인증입니다.')
    }
    if (this.state.lockedPlayerIds.includes(playerA.id) || this.state.lockedPlayerIds.includes(playerB.id)) return fail('PLAYER_LOCKED', '다른 거래소가 이 참가자를 거래 중입니다.')
    if (request.expectedPlayerVersions[playerA.id] !== playerA.version || request.expectedPlayerVersions[playerB.id] !== playerB.version) {
      return fail('VERSION_CONFLICT', '카드 상태가 변경되었습니다. 다시 인증해 최신 카드를 확인하세요.')
    }
    const aCards = request.playerACardIds.map((id) => playerA.cards.find((card) => card.id === id))
    const bCards = request.playerBCardIds.map((id) => playerB.cards.find((card) => card.id === id))
    if (aCards.some((card) => !card) || bCards.some((card) => !card)) return fail('INVALID_CARD', '이미 이동했거나 소유하지 않은 카드가 포함되어 있습니다.')
    this.state.lockedPlayerIds.push(playerA.id, playerB.id); this.emit()
    try {
      await wait(request.processingDelayMs ?? 400)
      if (this.state.gameId !== processingGameId || this.state.phase !== 'active') {
        return { ok: false, tradeId: request.tradeId, code: 'GAME_NOT_ACTIVE', message: '거래 처리 중 게임이 종료되거나 교체되어 반영하지 않았습니다.', publicState: this.getPublicState() }
      }
      playerA.cards = [...playerA.cards.filter((card) => !request.playerACardIds.includes(card.id)), ...(bCards as CardArray)]
      playerB.cards = [...playerB.cards.filter((card) => !request.playerBCardIds.includes(card.id)), ...(aCards as CardArray)]
      playerA.version += 1; playerB.version += 1; this.touch(); this.recordTrade(request, 'success')
      return { ok: true, tradeId: request.tradeId, publicState: this.getPublicState(), playerA: this.snapshot(playerA, request.playerAAuthToken), playerB: this.snapshot(playerB, request.playerBAuthToken) }
    } catch { return fail('INTERNAL_ERROR', '거래 처리 중 예기치 않은 오류가 발생했습니다.') }
    finally { this.state.lockedPlayerIds = this.state.lockedPlayerIds.filter((id) => id !== playerA.id && id !== playerB.id); this.emit() }
  }
  private isAuthorized(token: string, playerId: string, stationId: string): boolean {
    const auth = this.authSessions.get(token)
    return !!auth && auth.playerId === playerId && auth.stationId === stationId && auth.gameId === this.state.gameId
  }
  private snapshot(player: Player, authToken: string): PlayerSnapshot { return { id: player.id, name: player.name, cards: clone(player.cards), version: player.version, authToken } }
  private findPlayer(id: string): Player | undefined { return this.state.players.find((player) => player.id === id) }
  private recordTrade(request: TradeRequest, status: TradeRecord['status'], failureCode?: TradeFailureCode): void {
    if (this.state.trades.some((trade) => trade.tradeId === request.tradeId)) return
    this.state.trades.push({ tradeId: request.tradeId, stationId: request.stationId, playerAId: request.playerAId, playerBId: request.playerBId, playerACardIds: [...request.playerACardIds], playerBCardIds: [...request.playerBCardIds], status, failureCode, createdAt: Date.now(), completedAt: Date.now() })
    if (this.state.trades.length > 1000) this.state.trades.shift()
  }
  private touch(): void { this.state.version += 1; this.state.updatedAt = Date.now() }
  private emit(): void { const snapshot = this.getState(); this.listeners.forEach((listener) => listener(snapshot)) }
}

type CardArray = Player['cards']
