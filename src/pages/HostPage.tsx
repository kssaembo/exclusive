import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { LogPanel } from '../components/LogPanel'
import { StatusDot } from '../components/StatusDot'
import { TeamGrid } from '../components/TeamGrid'
import { GameEngine } from '../game/GameEngine'
import { createInitialState, DEFAULT_SETUP } from '../game/initialState'
import { createHostTransport, type IHostGameTransport } from '../network/transportFactory'
import { createId, createRoomCode } from '../network/ids'
import { loadBackup, saveBackup } from '../storage/indexedDb'
import type { AppLog, BoardSnapshot, GameSetup, GameState, StationStatus, TradeRequest, TradeResult, WireMessage } from '../types'

const resultText = (result: TradeResult) => result.ok ? '성공' : `${result.code}: ${result.message}`
const isCurrentState = (value: GameState | null): value is GameState => !!value && Array.isArray(value.players) && typeof value.gameId === 'string' && value.settings?.playerCount >= 6 && value.settings?.playerCount <= 15 && Array.isArray(value.settings.deckRules)
const formatTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}`

export function HostPage() {
  const navigate = useNavigate()
  const fresh = new URLSearchParams(location.search).get('fresh') === '1'
  const setup = useMemo<GameSetup>(() => { try { return { ...DEFAULT_SETUP, ...JSON.parse(sessionStorage.getItem('exclusive-game-setup') ?? '{}') } } catch { return DEFAULT_SETUP } }, [])
  const [roomCode] = useState(() => sessionStorage.getItem('exclusive-room-code') || createRoomCode())
  const engineRef = useRef(new GameEngine(createInitialState(setup)))
  const networkRef = useRef<IHostGameTransport | undefined>(undefined)
  const channelRef = useRef<BroadcastChannel | undefined>(undefined)
  const [state, setState] = useState(engineRef.current.getState())
  const [stations, setStations] = useState<StationStatus[]>([])
  const [logs, setLogs] = useState<AppLog[]>([])
  const [hostReady, setHostReady] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [backupStatus, setBackupStatus] = useState('로컬 백업 준비')
  const [now, setNow] = useState(Date.now())
  const stationUrl = useMemo(() => `${window.location.origin}/station?room=${roomCode}`, [roomCode])
  const boardUrl = useMemo(() => `${window.location.origin}/board?room=${roomCode}`, [roomCode])
  const connected = stations.filter((station) => station.connection === 'connected').length
  const remainingMs = state.startedAt ? Math.max(0, state.startedAt + state.settings.durationMinutes * 60000 - (state.phase === 'ended' ? state.endedAt ?? now : now)) : state.settings.durationMinutes * 60000

  const addLog = (level: AppLog['level'], title: string, detail?: string, stationId?: string) => setLogs((current) => [{ id: createId('log'), at: Date.now(), level, title, detail, stationId }, ...current].slice(0, 500))

  useEffect(() => {
    sessionStorage.setItem('exclusive-room-code', roomCode)
    if (fresh) {
      window.history.replaceState({}, '', '/host')
      saveBackup(engineRef.current.getState()).catch(() => setBackupStatus('백업 실패'))
    }
    channelRef.current = new BroadcastChannel(`exclusive-board-${roomCode}`)
    QRCode.toDataURL(stationUrl, { width: 220, margin: 1, color: { dark: '#101827', light: '#ffffff' } }).then(setQrUrl)
    if (!fresh) loadBackup().then((backup) => { if (isCurrentState(backup)) { const migrated = { ...backup, settings: { ...createInitialState(setup).settings, ...backup.settings } }; engineRef.current.replaceState(migrated); addLog('info', '이전 게임 복원', `게임 ${backup.gameId.slice(0, 8)} · v${backup.version}`) } }).catch(() => addLog('warning', '백업 복원 실패', '새 게임으로 시작합니다.'))

    const unsubscribe = engineRef.current.subscribe((nextState) => {
      setState(nextState); const publicState = engineRef.current.getPublicState()
      networkRef.current?.updateState(publicState); networkRef.current?.broadcast({ type: 'STATE_SYNC', state: publicState })
      saveBackup(nextState).then(() => setBackupStatus(`백업 ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`)).catch(() => setBackupStatus('백업 실패'))
    })
    const network = createHostTransport(roomCode, engineRef.current.getPublicState(), {
      onOpen: () => { setHostReady(true); addLog('success', '게임방 생성', `방 코드 ${roomCode}`) },
      onStatus: setStations,
      onError: (message) => addLog('error', '연결 경고', message),
      onMessage: (stationId, message) => handleNetworkMessage(stationId, message),
    })
    networkRef.current = network; network.connect()

    function handleNetworkMessage(stationId: string, message: WireMessage) {
      if (message.type === 'PLAYER_SELECT_REQUEST') {
        const player = engineRef.current.selectPlayer(message.playerId, stationId)
        network.send(player ? { type: 'PLAYER_SELECT_RESULT', requestId: message.requestId, ok: true, player } : { type: 'PLAYER_SELECT_RESULT', requestId: message.requestId, ok: false, message: '플레이어 명단 또는 게임 상태를 확인하세요.' }, stationId)
      } else if (message.type === 'TRADE_REQUEST') {
        const before = engineRef.current.getState()
        const playerA = before.players.find((p) => p.id === message.request.playerAId)
        const playerB = before.players.find((p) => p.id === message.request.playerBId)
        const aCards = message.request.playerACardIds.map((id) => playerA?.cards.find((card) => card.id === id)?.label ?? id).join(', ')
        const bCards = message.request.playerBCardIds.map((id) => playerB?.cards.find((card) => card.id === id)?.label ?? id).join(', ')
        engineRef.current.execute(message.request).then((result) => {
          network.send({ type: 'TRADE_RESULT', result }, stationId)
          const detail = result.ok
            ? `${playerA?.name} → ${playerB?.name}: ${aCards} / ${playerB?.name} → ${playerA?.name}: ${bCards} · ${message.request.playerACardIds.length}장`
            : `${playerA?.name} ↔ ${playerB?.name} · ${message.request.playerACardIds.length}장 · ${resultText(result)}`
          addLog(result.ok ? 'success' : 'error', `거래 ${result.ok ? '완료' : '실패'}`, detail, stationId)
        })
      } else if (message.type === 'CLAIM_REQUEST') {
        const claim = engineRef.current.createClaim(message.claimId, stationId, message.playerId, message.authToken, message.resourceType)
        if (claim) { network.send({ type: 'CLAIM_RECEIVED', claim }, stationId); const current = engineRef.current.getState(); addLog('warning', '독점 선언 접수', `${current.players.find((p) => p.id === claim.playerId)?.name} · ${current.settings.deckRules.find((r) => r.type === claim.resourceType)?.label}`, stationId) }
        else network.send({ type: 'ERROR', code: 'INVALID_CLAIM', message: '플레이어 선택 세션 또는 게임 상태를 확인하세요.' }, stationId)
      } else if (message.type === 'MESSAGE_TEST_REQUEST') network.runMessageTest(stationId, message.testId, message.count)
      else if (message.type === 'MESSAGE_TEST_REPORT') { network.recordReport(stationId, message.report); addLog(message.report.missing || message.report.duplicates ? 'error' : 'success', '연결 테스트 완료', `수신 ${message.report.received}/${message.report.requested}`, stationId) }
    }
    return () => { unsubscribe(); network.disconnect(); channelRef.current?.close() }
  }, [roomCode, stationUrl, fresh])

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (state.phase === 'active' && remainingMs <= 0) { engineRef.current.endGame('timeout'); addLog('warning', '제한시간 종료', '진행률과 폭탄 감점으로 최종 순위를 계산했습니다.') } }, [state.phase, remainingMs])
  useEffect(() => {
    const snapshot: BoardSnapshot = { state: engineRef.current.getPublicState(), connectedStations: connected, stationCapacity: 3, publishedAt: Date.now() }
    channelRef.current?.postMessage(snapshot); localStorage.setItem(`exclusive-board-${roomCode}`, JSON.stringify(snapshot))
  }, [state, connected, now, roomCode])

  const openBoard = () => window.open(boardUrl, 'exclusive-game-board', 'popup=yes,width=1280,height=800')
  const startGame = () => { engineRef.current.startGame(); addLog('success', '시장 개장', `제한시간 ${state.settings.durationMinutes}분`); openBoard() }
  const endGame = () => { if (window.confirm('거래를 중단하고 현재 순위로 게임을 종료할까요?')) { engineRef.current.endGame('manual'); addLog('warning', '교사 수동 종료', '현재 진행률로 순위를 계산했습니다.') } }
  const resolveClaim = (claimId: string, approve: boolean) => { const claim = engineRef.current.resolveClaim(claimId, approve); if (!claim) return; networkRef.current?.send({ type: 'CLAIM_RECEIVED', claim }, claim.stationId); addLog(claim.status === 'approved' ? 'success' : 'warning', `독점 선언 ${claim.status === 'approved' ? '승인' : '반려'}`, claim.reason) }
  const downloadLog = () => {
    const current = engineRef.current.getState(); const rows = [['시간','구분','내용','거래소'], ...[...logs].reverse().map((log) => [new Date(log.at).toLocaleString('ko-KR'), log.title, log.detail ?? '', log.stationId ?? ''])]
    const csv = '\uFEFF' + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `독점게임-${current.gameId.slice(0,8)}-운영로그.csv`; anchor.click(); URL.revokeObjectURL(anchor.href)
  }
  const copyLog = async () => {
    const rows = [['시간', '구분', '내용', '거래소'], ...[...logs].reverse().map((log) => [new Date(log.at).toLocaleString('ko-KR'), log.title, log.detail ?? '', log.stationId ?? ''])]
    const text = rows.map((row) => row.join('\t')).join('\n')
    try { await navigator.clipboard.writeText(text); setCopyStatus('복사 완료') }
    catch { setCopyStatus('복사 실패') }
    window.setTimeout(() => setCopyStatus(''), 1800)
  }
  const makeRequest = (a: number, b: number, tradeId = createId('host-test')): TradeRequest => { const snapshot = engineRef.current.getState(); const pa = snapshot.players[a]; const pb = snapshot.players[b]; const aa = engineRef.current.selectPlayer(pa.id, 'host-test')!; const ab = engineRef.current.selectPlayer(pb.id, 'host-test')!; return { tradeId, stationId: 'host-test', playerAId: pa.id, playerBId: pb.id, playerACardIds: [pa.cards[0].id], playerBCardIds: [pb.cards[0].id], playerAAuthToken: aa.authToken, playerBAuthToken: ab.authToken, expectedPlayerVersions: { [pa.id]: pa.version, [pb.id]: pb.version }, processingDelayMs: 300 } }
  const runScenario = async (kind: 'normal'|'parallel'|'collision') => { if (state.phase !== 'active') return addLog('error', '진단 실행 불가', '게임을 먼저 시작하세요.'); const results = kind === 'normal' ? [await engineRef.current.execute(makeRequest(0,1))] : kind === 'parallel' ? await Promise.all([engineRef.current.execute(makeRequest(0,1)),engineRef.current.execute(makeRequest(2,3))]) : await Promise.all([engineRef.current.execute(makeRequest(0,1)),engineRef.current.execute(makeRequest(0,2))]); addLog('info', `진단 · ${kind}`, results.map(resultText).join(' | ')) }

  const pendingClaims = state.claims.filter((claim) => claim.status === 'pending')
  const winner = state.players.find((player) => player.id === state.winnerPlayerId)
  return <main className="app-shell host-page">
    <header className="topbar"><div><p className="eyebrow">TEACHER CONTROL ROOM</p><h1>독점게임 운영 페이지</h1></div><div className="header-status"><StatusDot status={hostReady ? 'connected' : 'connecting'} /><span>{backupStatus}</span><Link to="/rules">게임 규칙</Link></div></header>
    <section className="host-command panel"><div className="command-room"><span>ROOM CODE</span><strong>{roomCode}</strong><div className="room-tools"><button onClick={() => navigator.clipboard.writeText(stationUrl)}>거래소 주소 복사</button>{qrUrl && <button className="qr-button" onClick={() => setQrOpen(true)} aria-label="거래소 QR 크게 보기"><img className="host-qr" src={qrUrl} alt="거래소 접속 QR" /></button>}</div></div><div className="command-timer"><span>{state.phase === 'setup' ? '게임 준비' : state.phase === 'active' ? '남은 시간' : '게임 종료'}</span><strong>{formatTime(remainingMs)}</strong><div><button onClick={openBoard}>학생 전광판 열기 ↗</button>{state.phase === 'setup' && <button className="primary" onClick={startGame}>게임 시작</button>}{state.phase === 'active' && <button className="danger-text" onClick={endGame}>수동 종료</button>}{state.phase === 'ended' && <button onClick={() => navigate('/setup')}>새 게임 설정</button>}</div></div><div className="command-stations"><span>거래소 연결</span><strong>{connected}<small>/3</small></strong><div className="station-lights">{[1,2,3].map((slot) => { const station = stations.find((s) => s.slot === slot); return <i className={station?.connection === 'connected' ? 'on' : ''} title={`거래소 ${slot}`} key={slot} /> })}</div></div></section>
    {qrOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="거래소 QR 코드" onClick={() => setQrOpen(false)}><div className="qr-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setQrOpen(false)}>닫기 ×</button><img src={qrUrl} alt="거래소 접속 QR 확대" /><h2>거래소 접속</h2><p>태블릿 카메라로 QR 코드를 스캔하세요.</p></div></div>}

    {pendingClaims.length > 0 && <section className="panel claim-alert"><div><span className="label">MONOPOLY CLAIM</span><h2>독점 선언을 검증하세요</h2></div>{pendingClaims.map((claim) => <div className="claim-row" key={claim.claimId}><span><b>{state.players.find((p) => p.id === claim.playerId)?.name}</b> · {state.settings.deckRules.find((r) => r.type === claim.resourceType)?.label} 독점</span><div><button className="primary" onClick={() => resolveClaim(claim.claimId, true)}>카드 확인 후 승인</button><button className="danger-text" onClick={() => resolveClaim(claim.claimId, false)}>반려</button></div></div>)}</section>}

    {state.phase === 'ended' && <section className="panel result-banner"><span>FINAL RESULT</span><h2>{winner ? `${winner.name} 우승` : '게임 종료'}</h2><p>{state.endReason === 'monopoly' ? `${state.settings.deckRules.find((r) => r.type === state.winnerResourceType)?.label} 독점 성공` : '종료 시점의 자원 완성도에서 폭탄 감점을 반영한 결과입니다.'}</p><button onClick={downloadLog}>운영 로그 CSV 내려받기</button></section>}

    <section className="host-main-grid"><article className="panel"><div className="section-heading"><div><span className="label">PRIVATE PLAYER STATUS</span><h2>실시간 독점 현황</h2></div><span className="muted">교사 화면 전용 · 거래 성공 {state.trades.filter((t) => t.status === 'success').length}건</span></div><TeamGrid state={state} revealCards />{state.rankings && <div className="ranking-table">{state.rankings.map((rank) => <div key={rank.playerId}><b>{rank.rank}위</b><span>{state.players.find((p) => p.id === rank.playerId)?.name}</span><span>{rank.targetLabel} {rank.targetCount}/{rank.requiredCount}</span><span>폭탄 {rank.bombCount}</span><strong>{rank.score}점</strong></div>)}</div>}</article><aside className="panel"><div className="section-heading"><div><span className="label">LIVE OPERATIONS</span><h2>운영 기록</h2></div>{state.phase === 'ended' && <button onClick={copyLog}>{copyStatus || '복사하기'}</button>}</div><LogPanel logs={logs} /></aside></section>

    <details className="panel diagnostics"><summary>연결 상세 및 진단 도구</summary><div className="station-list">{[1,2,3].map((slot) => { const station = stations.find((s) => s.slot === slot); return <div className="station-row" key={slot}><b>거래소 {slot}</b>{station ? <><StatusDot status={station.connection} /><span>RTT {station.latencyMs ?? '—'}ms</span><span>재연결 {station.reconnects}</span></> : <span className="muted">연결 대기</span>}</div> })}</div><div className="test-buttons"><button onClick={() => runScenario('normal')}>정상 거래 진단</button><button onClick={() => runScenario('parallel')}>동시 거래 진단</button><button onClick={() => runScenario('collision')}>충돌 거래 진단</button></div></details>
  </main>
}
