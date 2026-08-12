# 독점게임 학급용 WebRTC 엔진 v1.0

교사 브라우저가 유일한 공식 게임 상태를 보유하고, 거래소 태블릿 2~3대가 PeerJS(WebRTC DataChannel)로 연결되는 학급용 독점게임입니다. 현재 UI는 기능 검증용 Placeholder이며 이미지·애니메이션·BGM·효과음에 의존하지 않습니다.

## 현재 구현 범위

### 교사 Host (`/host`)

- 2~16팀 설정, 64장 덱 생성·무작위 배부, 게임 시작·종료
- 방 코드와 거래소 접속 QR 생성
- 거래소 최대 3대 연결, RTT·연결 끊김·재접속 횟수 표시
- 모든 팀의 공식 카드, 카드 ID, 4자리 인증코드, 버전, 잠금 상태 확인
- 정상·동시·충돌·TradeID 중복·Version 충돌 자동 시나리오
- 거래·인증·네트워크·독점 선언 실시간 로그
- 독점 선언 교사 승인/반려
- 게임 전체 상태와 거래 이력을 IndexedDB에 자동 백업·복원

### 거래소 Station (`/station`)

- 방 코드/QR로 호스트 연결 및 자동 재접속
- Player A 인증 → 비공개 카드 선택 → 화면 가리기 → Player B 인증 → 비공개 선택
- 같은 장수인지 확인한 뒤 호스트에 공식 거래 요청
- 성공 시 양쪽 최신 카드와 버전 수신
- 거래 요청 직후 연결이 끊기면 재접속 후 같은 TradeID를 자동 재전송하여 결과 회수
- 독점 선언을 교사에게 전송
- 메시지 1/10/100회 전송, 수신·누락·중복 집계
- 연결 끊기, 수동 재접속, 동일 TradeID 재전송 진단

## 기본 카드 규칙

| 종류 | 수량 | 독점 조건 |
| --- | ---: | --- |
| 석탄·철·나무 | 각 8장 | 한 팀이 해당 종류 8장 전부 보유 |
| 물·석유·금·쌀·다이아 | 각 7장 | 한 팀이 해당 종류 7장 전부 보유 |
| 폭탄 | 5장 | 독점 대상 아님 |

모든 카드에는 종류와 별도로 `CARD-0001` 형식의 고유 ID가 있습니다. 64장을 팀 수로 균등 배부하고 나머지는 호스트의 `undealtCards`에 보관합니다. 카드 구성과 독점 수량은 `src/game/rules.ts` 한 곳에서 변경할 수 있습니다.

## 상태 권위와 동시성

- 공식 `Players`, `Cards`, `Trades`, `Locks`, `Claims`, `GameState`는 Host에만 존재합니다.
- Station에 방송되는 `PublicGameState`에는 팀명·카드 장수·버전·잠금만 있고 카드 내용과 인증코드는 없습니다.
- 카드 내용은 4자리 코드를 Host가 검증한 뒤 해당 Station 메모리에만 일시 전달됩니다.
- 거래 전 두 참가자를 원자적으로 잠급니다. 다른 참가자끼리의 거래는 동시에 진행할 수 있지만 한 참가자가 겹치는 두 번째 거래는 거절됩니다.
- 각 참가자의 `version`이 Station이 본 값과 다르면 거래를 거절합니다.
- 처리 중·완료된 `TradeID`는 멱등 처리합니다. 완료 이력은 IndexedDB 백업에도 포함되어 Host 재시작 뒤 재전송돼도 다시 반영되지 않습니다.
- 처리 중 게임이 종료되거나 새 게임으로 교체되면 대기 중이던 거래를 반영하지 않습니다.

## 계층 구조

```text
src/
  game/
    GameEngine.ts       # 순수 게임 규칙, 인증, 거래, 잠금, 버전, 독점 판정
    initialState.ts     # 게임 생성과 배부
    rules.ts            # 64장 덱과 독점 규칙
  network/
    IGameTransport.ts   # 통신 구현과 무관한 인터페이스
    WebRTCTransport.ts  # 현재 주입하는 WebRTC 구현 진입점
    transportFactory.ts # UI에 Transport 구현을 주입하는 단일 조립 지점
    HostNetwork.ts      # PeerJS 다중 Station 어댑터
    StationNetwork.ts   # PeerJS Station 어댑터와 재접속
  pages/                # Host/Station UI 계층
  components/           # 재사용 UI
  storage/              # Host IndexedDB 백업
  types.ts              # 도메인/메시지 계약
```

UI는 `transportFactory.ts`에서 Transport 구현체를 주입받고, `GameEngine`에는 PeerJS 코드가 없습니다. 향후 `FirebaseTransport`가 `IGameTransport`와 동일한 메시지 계약을 구현하면 조립 지점만 바꾸고 게임 규칙을 그대로 유지할 수 있습니다.

## 로컬 실행

Node.js 20.19 이상 또는 22.12 이상이 필요합니다.

```bash
npm install
npm run dev
```

- 홈: `http://localhost:5173`
- 교사 Host: `http://localhost:5173/host`
- 거래소 Station: `http://localhost:5173/station`

같은 Wi-Fi의 다른 태블릿에서 개발 서버에 접속하려면 다음처럼 실행합니다.

```bash
npm run dev -- --host
```

실기기 WebRTC 검증은 HTTPS가 자동 적용되는 Vercel 배포판을 권장합니다.

## 자동검사와 빌드

```bash
npm test
npm run build
npm run preview
```

현재 자동검사는 비공개 상태 분리, 게임 단계, 정상 거래, 서로 다른 참가자의 동시 거래, 같은 참가자 충돌, TradeID 멱등성, Host 복원 후 재전송 방지, Version 충돌, Station 범위 인증, 독점 승인까지 검증합니다.

## 현장 검증 순서

1. Host에서 팀 수를 입력하고 `덱 생성/재배부` 후 인증코드를 학생에게 안내합니다.
2. 거래소 3대를 QR로 연결하고 모두 초록 상태인지 확인합니다.
3. Host에서 `게임 시작`을 누릅니다.
4. 각 거래소에서 메시지 100회 테스트를 5회 실시해 누락·중복을 확인합니다.
5. 서로 다른 네 팀의 거래 두 건을 동시에 실행해 모두 성공하는지 확인합니다.
6. 같은 팀이 포함된 거래를 두 거래소에서 동시에 실행해 한 건만 성공하는지 확인합니다.
7. `전송 후 연결 끊기 테스트`를 실행하고 재접속 뒤 거래 결과가 한 번만 반영되는지 확인합니다.
8. 태블릿 화면을 껐다 켜거나 다른 앱에서 복귀해 자동 재접속과 공개 상태 동기화를 확인합니다.
9. 독점 조건을 충족한 팀이 선언하고 Host 승인 시 게임이 종료되는지 확인합니다.

## GitHub 업로드

GitHub에서 빈 저장소를 만든 뒤 프로젝트 폴더에서 실행합니다.

```bash
git init
git add .
git commit -m "Build classroom monopoly WebRTC engine v1"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

이미 Git 저장소라면 `git init`과 원격 추가는 생략합니다. 비밀번호나 토큰을 코드에 넣지 않습니다.

## Vercel 배포

1. Vercel에서 **Add New → Project**를 선택하고 GitHub 저장소를 가져옵니다.
2. Framework Preset은 **Vite**를 선택합니다.
3. Build Command는 `npm run build`, Output Directory는 `dist`입니다.
4. 환경 변수는 필요하지 않습니다.
5. 배포 후 `https://배포주소.vercel.app/host`를 엽니다.

`vercel.json`이 `/host`와 `/station` 직접 접속을 SPA 진입점으로 연결합니다.

## 운영상 제한

- Host 탭이 닫힌 동안에는 공식 거래가 진행되지 않습니다. 같은 브라우저에서 다시 열면 마지막 IndexedDB 상태를 복원합니다.
- PeerJS 기본 시그널링 서버가 학교 방화벽에서 차단되거나 TURN이 필요한 NAT 환경이면 연결이 실패할 수 있습니다.
- 4자리 인증코드는 교실 운영 편의를 위한 참가자 식별 수단이며 인터넷 서비스용 강한 사용자 인증은 아닙니다.
- 현재 독점 조건은 한 자원 종류의 전체 카드를 한 팀이 보유하는 것입니다. 세트 점수·폭탄 감점·최종 순위 계산은 규칙 확정 후 `game` 계층에 추가할 수 있습니다.
