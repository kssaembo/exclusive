export type ConnectionLevel = 'connected' | 'connecting' | 'disconnected'
export type GamePhase = 'setup' | 'active' | 'ended'
export type EndReason = 'monopoly' | 'timeout' | 'manual'
export type ResourceType = 'coal' | 'iron' | 'wood' | 'water' | 'oil' | 'gold' | 'rice' | 'diamond' | 'copper' | 'silver' | 'wheat' | 'corn' | 'gas' | 'ruby' | 'sapphire' | 'bomb'

export interface Card { id: string; type: ResourceType; label: string }
export interface Player { id: string; name: string; cards: Card[]; version: number }
export interface DeckRule { type: ResourceType; label: string; count: number }
export interface GameSettings { playerCount: number; cardsPerPlayer: 8; durationMinutes: number; bombPenalty: 15; bombReverseMonopoly: true; deckRules: DeckRule[] }
export interface GameSetup { playerNames: string[]; durationMinutes: number }
export interface PlayerRanking { playerId: string; rank: number; targetType: ResourceType; targetLabel: string; targetCount: number; requiredCount: number; completionRate: number; bombCount: number; score: number }

export interface TradeRecord {
  tradeId: string; stationId: string; playerAId: string; playerBId: string
  playerACardIds: string[]; playerBCardIds: string[]; status: 'success' | 'failed'
  failureCode?: TradeFailureCode; createdAt: number; completedAt: number
}
export interface MonopolyClaim { claimId: string; stationId: string; playerId: string; resourceType: ResourceType; status: 'pending' | 'approved' | 'rejected'; createdAt: number; resolvedAt?: number; reason?: string }
export interface GameState {
  gameId: string; phase: GamePhase; version: number; settings: GameSettings
  players: Player[]; undealtCards: Card[]; lockedPlayerIds: string[]
  trades: TradeRecord[]; claims: MonopolyClaim[]; winnerPlayerId?: string; winnerResourceType?: ResourceType
  endReason?: EndReason; rankings?: PlayerRanking[]; startedAt?: number; endedAt?: number; updatedAt: number
}
export interface PublicPlayer { id: string; name: string; cardCount: number; version: number; locked: boolean }
export interface PublicGameState {
  gameId: string; phase: GamePhase; version: number; players: PublicPlayer[]
  settings: Pick<GameSettings, 'durationMinutes' | 'bombReverseMonopoly' | 'deckRules'>; tradeCount: number
  winnerPlayerId?: string; winnerResourceType?: ResourceType; endReason?: EndReason
  startedAt?: number; endedAt?: number; updatedAt: number
}
export interface PlayerSnapshot { id: string; name: string; cards: Card[]; version: number; authToken: string }
export interface BoardSnapshot { state: PublicGameState; connectedStations: number; stationCapacity: number; publishedAt: number }
export interface TradeRequest {
  tradeId: string; stationId: string; playerAId: string; playerBId: string
  playerACardIds: string[]; playerBCardIds: string[]; playerAAuthToken: string; playerBAuthToken: string
  expectedPlayerVersions: Record<string, number>; processingDelayMs?: number
}
export type TradeFailureCode = 'GAME_NOT_ACTIVE' | 'PLAYER_LOCKED' | 'VERSION_CONFLICT' | 'INVALID_PLAYER' | 'INVALID_AUTH' | 'INVALID_CARD' | 'UNEQUAL_CARD_COUNT' | 'EMPTY_TRADE' | 'DUPLICATE_TRADE' | 'INTERNAL_ERROR'
export type TradeResult =
  | { ok: true; tradeId: string; publicState: PublicGameState; playerA: PlayerSnapshot; playerB: PlayerSnapshot; duplicateRequest?: boolean }
  | { ok: false; tradeId: string; code: TradeFailureCode; message: string; publicState: PublicGameState; duplicateRequest?: boolean }
export interface AppLog { id: string; at: number; level: 'success' | 'warning' | 'error' | 'info'; title: string; detail?: string; stationId?: string }
export interface MessageTestReport { testId: string; requested: number; received: number; missing: number; duplicates: number; durationMs: number }
export type WireMessage =
  | { type: 'HELLO'; stationId: string; stationName: string }
  | { type: 'WELCOME'; state: PublicGameState; stationSlot: number }
  | { type: 'STATE_SYNC'; state: PublicGameState }
  | { type: 'PING'; id: string; sentAt: number }
  | { type: 'PONG'; id: string; sentAt: number }
  | { type: 'PLAYER_SELECT_REQUEST'; requestId: string; playerId: string }
  | { type: 'PLAYER_SELECT_RESULT'; requestId: string; ok: true; player: PlayerSnapshot }
  | { type: 'PLAYER_SELECT_RESULT'; requestId: string; ok: false; message: string }
  | { type: 'TRADE_REQUEST'; request: TradeRequest }
  | { type: 'TRADE_RESULT'; result: TradeResult }
  | { type: 'CLAIM_REQUEST'; claimId: string; playerId: string; authToken: string; resourceType: ResourceType }
  | { type: 'CLAIM_RECEIVED'; claim: MonopolyClaim }
  | { type: 'MESSAGE_TEST_REQUEST'; testId: string; count: 1 | 10 | 100 }
  | { type: 'MESSAGE_TEST_ITEM'; testId: string; sequence: number; total: number; sentAt: number }
  | { type: 'MESSAGE_TEST_REPORT'; report: MessageTestReport }
  | { type: 'ERROR'; code: string; message: string }
export interface StationStatus { stationId: string; name: string; slot: number; connection: ConnectionLevel; latencyMs: number | null; lastSeenAt: number; reconnects: number; testReport?: MessageTestReport }
