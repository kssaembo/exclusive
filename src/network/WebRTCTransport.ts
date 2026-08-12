// UI와 게임 엔진은 이 파일의 구현 세부사항이 아니라 IGameTransport 계약에만 의존한다.
// Firebase 전환 시 같은 계약을 구현하는 FirebaseTransport를 추가하면 된다.
export type { IGameTransport } from './IGameTransport'
export { HostNetwork as WebRTCHostTransport } from './HostNetwork'
export { StationNetwork as WebRTCStationTransport } from './StationNetwork'
