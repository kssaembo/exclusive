import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { LogPanel } from '../components/LogPanel'
import { StatusDot } from '../components/StatusDot'
import { TeamGrid } from '../components/TeamGrid'
import { GameEngine } from '../game/GameEngine'
import { createInitialState } from '../game/initialState'
import { MONOPOLY_TYPES } from '../game/rules'
import { createHostTransport, type IHostGameTransport } from '../network/transportFactory'
import { createId, createRoomCode } from '../network/ids'
import { loadBackup, saveBackup } from '../storage/indexedDb'
import type { AppLog, GameState, StationStatus, TradeRequest, TradeResult, WireMessage } from '../types'

const resultText = (result: TradeResult) => result.ok ? '성공' : `${result.code}: ${result.message}`
const isCurrentState = (value: GameState | null): value is GameState => !!value && Array.isArray(value.players) && typeof value.gameId === 'string'

export function HostPage() {
  const [roomCode] = useState(() => sessionStorage.getItem('exclusive-room-code') || createRoomCode())
  const engineRef = useRef(new GameEngine(createInitialState()))
  const networkRef = useRef<IHostGameTransport | undefined>(undefined)
  const [state, setState] = useState(engineRef.current.getState())
  const [playerCount, setPlayerCount] = useState(8)
  const [stations, setStations] = useState<StationStatus[]>([])
  const [logs, setLogs] = useState<AppLog[]>([])
  const [hostReady, setHostReady] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [backupStatus, setBackupStatus] = useState('백업 준비 중')
  const stationUrl = useMemo(() => `${window.location.origin}/station?room=${roomCode}`, [roomCode])

  const addLog = (level: AppLog['level'], title: string, detail?: string, stationId?: string) => {
    setLogs((current) => [{ id: createId('log'), at: Date.now(), level, title, detail, stationId }, ...current].slice(0, 200))
  }

  useEffect(() => {
    sessionStorage.setItem('exclusive-room-code', roomCode)
    QRCode.toDataURL(stationUrl, { width: 240, margin: 1, color: { dark: '#101827', light: '#ffffff' } }).then(setQrUrl)
    loadBackup().then((backup) => {
      if (isCurrentState(backup)) {
        engineRef.current.replaceState(backup); setPlayerCount(backup.settings.playerCount)
        addLog('info', '호스트 백업 복원', `게임 ${backup.gameId.slice(0, 8)} · 상태 v${backup.version}`)
      }
    }).catch(() => addLog('warning', '백업 복원 실패', '새 게임 준비 상태로 시작합니다.'))

    const unsubscribe = engineRef.current.subscribe((nextState) => {
      setState(nextState)
      const publicState = engineRef.current.getPublicState()
      networkRef.current?.updateState(publicState)
      networkRef.current?.broadcast({ type: 'STATE_SYNC', state: publicState })
      saveBackup(nextState).then(() => setBackupStatus(`백업 ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`)).catch(() => setBackupStatus('백업 실패'))
    })

    const network = createHostTransport(roomCode, engineRef.current.getPublicState(), {
      onOpen: () => { setHostReady(true); addLog('success', '방 생성 완료', `방 코드 ${roomCode}`) },
      onStatus: setStations,
      onError: (message) => addLog('error', '네트워크 경고', message),
      onMessage: (stationId, message) => handleNetworkMessage(stationId, message),
    })
    networkRef.current = network; network.connect()

    function handleNetworkMessage(stationId: string, message: WireMessage) {
      if (message.type === 'AUTH_REQUEST') {
        const player = engineRef.current.authenticate(message.accessCode, stationId)
        network.send(player
          ? { type: 'AUTH_RESULT', requestId: message.requestId, ok: true, player }
          : { type: 'AUTH_RESULT', requestId: message.requestId, ok: false, message: '인증코드가 틀렸거나 게임이 진행 중이 아닙니다.' }, stationId)
        addLog(player ? 'success' : 'warning', `참가자 인증 ${player ? '성공' : '실패'}`, player?.name, stationId)
      } else if (message.type === 'TRADE_REQUEST') {
        engineRef.current.execute(message.request).then((result) => {
          network.send({ type: 'TRADE_RESULT', result }, stationId)
          addLog(result.ok ? 'success' : 'error', `거래 ${result.ok ? '성공' : '실패'}`, `${message.request.tradeId.slice(0, 12)} · ${resultText(result)}`, stationId)
        })
      } else if (message.type === 'CLAIM_REQUEST') {
        const claim = engineRef.current.createClaim(message.claimId, stationId, message.playerId, message.authToken, message.resourceType)
        if (claim) {
          network.send({ type: 'CLAIM_RECEIVED', claim }, stationId)
          addLog('warning', '독점 선언 접수', `${state.players.find((p) => p.id === message.playerId)?.name ?? message.playerId} · ${MONOPOLY_TYPES.find((r) => r.type === message.resourceType)?.label}`, stationId)
        } else network.send({ type: 'ERROR', code: 'INVALID_CLAIM', message: '인증 또는 게임 상태를 확인하세요.' }, stationId)
      } else if (message.type === 'MESSAGE_TEST_REQUEST') {
        network.runMessageTest(stationId, message.testId, message.count)
      } else if (message.type === 'MESSAGE_TEST_REPORT') {
        network.recordReport(stationId, message.report)
        addLog(message.report.missing || message.report.duplicates ? 'error' : 'success', '메시지 테스트 완료', `수신 ${message.report.received}/${message.report.requested} · 누락 ${message.report.missing} · 중복 ${message.report.duplicates}`, stationId)
      }
    }
    return () => { unsubscribe(); network.disconnect() }
  }, [roomCode, stationUrl])

  const newGame = () => {
    if (state.phase !== 'setup' && !window.confirm('현재 게임을 폐기하고 새 게임을 만들까요?')) return
    engineRef.current.replaceState(createInitialState(playerCount)); addLog('warning', '새 게임 생성', `${playerCount}팀 · 64장 덱`)
  }
  const startGame = () => { engineRef.current.startGame(); addLog('success', '게임 시작', `${state.players.length}팀 · 팀당 ${state.settings.cardsPerPlayer}장`) }
  const endGame = () => { if (window.confirm('거래를 중단하고 게임을 종료할까요?')) { engineRef.current.endGame(); addLog('warning', '게임 종료', '교사 수동 종료') } }

  const makeRequest = (a: number, b: number, tradeId = createId('host-test')): TradeRequest => {
    const snapshot = engineRef.current.getState(); const playerA = snapshot.players[a]; const playerB = snapshot.players[b]
    const authA = engineRef.current.authenticate(playerA.accessCode, 'host-test')!; const authB = engineRef.current.authenticate(playerB.accessCode, 'host-test')!
    return { tradeId, stationId: 'host-test', playerAId: playerA.id, playerBId: playerB.id, playerACardIds: [playerA.cards[0].id], playerBCardIds: [playerB.cards[0].id], playerAAuthToken: authA.authToken, playerBAuthToken: authB.authToken, expectedPlayerVersions: { [playerA.id]: playerA.version, [playerB.id]: playerB.version }, processingDelayMs: 500 }
  }
  const runScenario = async (scenario: 'normal' | 'parallel' | 'collision' | 'duplicate' | 'version') => {
    if (state.phase !== 'active') { addLog('error', '테스트 실행 불가', '게임을 먼저 시작하세요.'); return }
    const requiredPlayers = scenario === 'duplicate' ? 6 : scenario === 'parallel' ? 4 : scenario === 'collision' ? 3 : 2
    if (state.players.length < requiredPlayers) { addLog('error', '테스트 실행 불가', `${scenario} 시나리오는 최소 ${requiredPlayers}팀이 필요합니다.`); return }
    let results: TradeResult[] = []
    if (scenario === 'normal') results = [await engineRef.current.execute(makeRequest(0, 1))]
    if (scenario === 'parallel') results = await Promise.all([engineRef.current.execute(makeRequest(0, 1)), engineRef.current.execute(makeRequest(2, 3))])
    if (scenario === 'collision') results = await Promise.all([engineRef.current.execute(makeRequest(0, 1)), engineRef.current.execute(makeRequest(0, 2))])
    if (scenario === 'duplicate') { const req = makeRequest(4, 5, createId('duplicate')); results = await Promise.all([engineRef.current.execute(req), engineRef.current.execute(req)]) }
    if (scenario === 'version') { const req = makeRequest(0, 1); req.expectedPlayerVersions[req.playerAId] = 0; results = [await engineRef.current.execute(req)] }
    addLog('info', `시나리오 · ${scenario}`, results.map(resultText).join(' | '))
  }
  const resolveClaim = (claimId: string, approve: boolean) => {
    const claim = engineRef.current.resolveClaim(claimId, approve)
    if (!claim) return
    networkRef.current?.send({ type: 'CLAIM_RECEIVED', claim }, claim.stationId)
    addLog(claim.status === 'approved' ? 'success' : 'warning', `독점 선언 ${claim.status === 'approved' ? '승인' : '반려'}`, claim.reason)
  }

  const pendingClaims = state.claims.filter((claim) => claim.status === 'pending')
  return (
    <main className="app-shell host-page">
      <header className="topbar"><div><p className="eyebrow">교사 호스트 · 유일한 공식 상태</p><h1>독점게임 운영 콘솔</h1></div><div className="header-status"><StatusDot status={hostReady ? 'connected' : 'connecting'} /><span>{state.phase} · v{state.version}</span></div></header>
      <section className="host-overview">
        <article className="panel room-panel"><div><span className="label">방 코드</span><strong className="room-code">{roomCode}</strong><p>거래소에서 코드 입력 또는 QR 스캔</p></div>{qrUrl && <img src={qrUrl} alt="거래소 접속 QR 코드" />}<button className="secondary" onClick={() => navigator.clipboard.writeText(stationUrl)}>접속 주소 복사</button></article>
        <article className="panel station-panel"><div className="section-heading"><div><span className="label">실시간 연결</span><h2>거래소 {stations.filter((s) => s.connection === 'connected').length}/3</h2></div><span className="backup-badge">{backupStatus}</span></div><div className="station-list">{[1,2,3].map((slot) => { const station = stations.find((item) => item.slot === slot); return <div className="station-row" key={slot}><b>거래소 {slot}</b>{station ? <><StatusDot status={station.connection} /><span>RTT {station.latencyMs ?? '—'}ms</span><span>재연결 {station.reconnects}</span></> : <span className="muted">대기 중</span>}</div> })}</div></article>
      </section>

      <section className="panel game-control"><div className="section-heading"><div><span className="label">게임 수명주기</span><h2>설정 · 시작 · 종료</h2></div></div><div className="control-row"><label>팀 수 <input type="number" min="2" max="16" value={playerCount} disabled={state.phase === 'active'} onChange={(e) => setPlayerCount(Number(e.target.value))} /></label><button onClick={newGame}>덱 생성/재배부</button><button className="primary" disabled={state.phase !== 'setup'} onClick={startGame}>게임 시작</button><button className="danger-text" disabled={state.phase !== 'active'} onClick={endGame}>게임 종료</button></div><p className="hint">64장 덱을 섞어 팀별 동일 수량으로 배부하며 나머지는 호스트에 보관합니다. 학생에게 해당 팀의 4자리 인증코드를 안내하세요.</p></section>

      {pendingClaims.length > 0 && <section className="panel claims"><div className="section-heading"><div><span className="label">교사 판정 필요</span><h2>독점 선언 {pendingClaims.length}건</h2></div></div>{pendingClaims.map((claim) => <div className="claim-row" key={claim.claimId}><span><b>{state.players.find((p) => p.id === claim.playerId)?.name}</b> · {MONOPOLY_TYPES.find((r) => r.type === claim.resourceType)?.label}</span><div><button onClick={() => resolveClaim(claim.claimId, true)}>검증 후 승인</button><button className="danger-text" onClick={() => resolveClaim(claim.claimId, false)}>반려</button></div></div>)}</section>}

      <section className="panel test-panel"><div className="section-heading"><div><span className="label">회귀 테스트</span><h2>거래 안정성 시나리오</h2></div></div><div className="test-buttons"><button onClick={() => runScenario('normal')}>정상 거래</button><button onClick={() => runScenario('parallel')}>동시 거래</button><button onClick={() => runScenario('collision')}>충돌 거래</button><button onClick={() => runScenario('duplicate')}>TradeID 중복</button><button onClick={() => runScenario('version')}>Version 충돌</button></div></section>

      <section className="content-grid"><article className="panel"><div className="section-heading"><div><span className="label">호스트 전용 비공개 데이터</span><h2>팀별 카드와 인증코드</h2></div><span>미배부 {state.undealtCards.length}장</span></div><TeamGrid state={state} revealCards /></article><article className="panel"><div className="section-heading"><div><span className="label">최근 200건</span><h2>운영 로그</h2></div></div><LogPanel logs={logs} /></article></section>

      <section className="panel results-panel"><div className="section-heading"><div><span className="label">거래소별 최신 결과</span><h2>메시지 전송 품질</h2></div></div><div className="results-grid">{[1,2,3].map((slot) => { const report = stations.find((s) => s.slot === slot)?.testReport; return <div key={slot}><b>거래소 {slot}</b>{report ? <><strong className={report.missing || report.duplicates ? 'bad' : 'good'}>{report.received}/{report.requested}</strong><small>누락 {report.missing} · 중복 {report.duplicates} · {report.durationMs}ms</small></> : <span className="muted">테스트 전</span>}</div> })}</div></section>
    </main>
  )
}
