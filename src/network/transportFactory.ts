import type { ConnectionLevel, MessageTestReport, PublicGameState, StationStatus, WireMessage } from '../types'
import { HostNetwork, type HostNetworkEvents } from './HostNetwork'
import type { IGameTransport } from './IGameTransport'
import { StationNetwork, type StationNetworkEvents } from './StationNetwork'

export interface IHostGameTransport extends IGameTransport<WireMessage, StationStatus[]> {
  updateState(state: PublicGameState): void
  broadcast(message: WireMessage): void
  runMessageTest(stationId: string, testId: string, count: number): void
  recordReport(stationId: string, report: MessageTestReport): void
  setStationBusy(stationId: string, busy: boolean): void
}

export interface IStationGameTransport extends IGameTransport<WireMessage, ConnectionLevel> {
  isConnected(): boolean
  recoverIfDisconnected(): boolean
  forceReconnect(): void
  simulateDrop(): void
}

// 통신 구현 선택은 이 파일 한 곳에서만 한다. BaaS 전환 시 생성 함수의 구현체를 교체한다.
export function createHostTransport(roomCode: string, state: PublicGameState, events: HostNetworkEvents): IHostGameTransport {
  return new HostNetwork(roomCode, state, events)
}

export function createStationTransport(roomCode: string, stationId: string, stationName: string, events: StationNetworkEvents): IStationGameTransport {
  return new StationNetwork(roomCode, stationId, stationName, events)
}
