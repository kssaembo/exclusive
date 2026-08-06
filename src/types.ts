export type ConnectionLevel = 'connected' | 'connecting' | 'disconnected'

export interface Card {
  id: string
  label: string
}

export interface Team {
  id: string
  name: string
  cards: Card[]
  version: number
}

export interface GameState {
  version: number
  teams: Team[]
  lockedTeamIds: string[]
  updatedAt: number
}

export interface TradeRequest {
  transactionId: string
  stationId: string
  teamAId: string
  teamBId: string
  teamACardIds: string[]
  teamBCardIds: string[]
  expectedTeamVersions: Record<string, number>
  processingDelayMs?: number
}

export type TradeFailureCode =
  | 'TEAM_LOCKED'
  | 'VERSION_CONFLICT'
  | 'INVALID_TEAM'
  | 'INVALID_CARD'
  | 'UNEQUAL_CARD_COUNT'
  | 'EMPTY_TRADE'
  | 'INTERNAL_ERROR'

export type TradeResult =
  | { ok: true; transactionId: string; state: GameState; duplicateRequest?: boolean }
  | { ok: false; transactionId: string; code: TradeFailureCode; message: string; state: GameState; duplicateRequest?: boolean }

export interface AppLog {
  id: string
  at: number
  level: 'success' | 'warning' | 'error' | 'info'
  title: string
  detail?: string
  stationId?: string
}

export interface MessageTestReport {
  testId: string
  requested: number
  received: number
  missing: number
  duplicates: number
  durationMs: number
}

export type WireMessage =
  | { type: 'HELLO'; stationId: string; stationName: string }
  | { type: 'WELCOME'; state: GameState; stationSlot: number }
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'PING'; id: string; sentAt: number }
  | { type: 'PONG'; id: string; sentAt: number }
  | { type: 'TRADE_REQUEST'; request: TradeRequest }
  | { type: 'TRADE_RESULT'; result: TradeResult }
  | { type: 'MESSAGE_TEST_REQUEST'; testId: string; count: 1 | 10 | 100 }
  | { type: 'MESSAGE_TEST_ITEM'; testId: string; sequence: number; total: number; sentAt: number }
  | { type: 'MESSAGE_TEST_REPORT'; report: MessageTestReport }
  | { type: 'ERROR'; code: string; message: string }

export interface StationStatus {
  stationId: string
  name: string
  slot: number
  connection: ConnectionLevel
  latencyMs: number | null
  lastSeenAt: number
  reconnects: number
  testReport?: MessageTestReport
}
