import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
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
import type { AppLog, BoardSnapshot, GameSetup, GameState, StationStatus, TradeResult, WireMessage } from '../types'

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
    if (fresh) { window.history.replaceState({}, '', '/host'); saveBackup(engineRef.current.getState()).catch(() => setBackupStatus('백업 실패')) }
    channelRef.current = new BroadcastChannel(`exclusive-board-${roomCode}`)
    QRCode.toDataURL(stationUrl, { width: 320, margin: 1, color: { dark: '#101827', light: '#ffffff' } }).then(setQrUrl)
    if (!fresh) loadBackup().then((backup) => {
      if (isCurrentState(backup)) {
        const migrated = { ...backup, resultsRevealed: backup.resultsRevealed ?? false, settings: { ...createInitialState(setup).settings, ...backup.settings } }
        engineRef.current.replaceState(migrated); addLog('info', '이전 게임 복원', `게임 ${backup.gameId.slice(0, 8)} · v${backup.version}`)
      }
    }).catch(() => addLog('warning', '백업 복원 실패', '새 게임으로 시작합니다.'))

    const unsubscribe = engineRef.current.subscribe((nextState) => {
      setState(nextState)
      const publicState = engineRef.current.getPublicState()
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
      if (message.type === 'STATION_USAGE') network.setStationBusy(stationId, message.busy)
      else if (message.type === 'PLAYER_SELECT_REQUEST') {
        const player = engineRef.current.selectPlayer(message.playerId, stationId)
        network.send(player ? { type: 'PLAYER_SELECT_RESULT', requestId: message.requestId, ok: true, player } : { type: 'PLAYER_SELECT_RESULT', requestId: message.requestId, ok: false, message: '플레이어 명단 또는 게임 상태를 확인하세요.' }, stationId)
      } else if (message.type === 'TRADE_REQUEST') {
        const before = engineRef.current.getState()
        const playerA = before.players.find((player) => player.id === message.request.playerAId)
        const playerB = before.players.find((player) => player.id === message.request.playerBId)
        const aCards = message.request.playerACardIds.map((id) => playerA?.cards.find((card) => card.id === id)?.label ?? id).join(', ')
        const bCards = message.request.playerBCardIds.map((id) => playerB?.cards.find((card) => card.id === id)?.label ?? id).join(', ')
        engineRef.current.execute(message.request).then((result) => {
          network.send({ type: 'TRADE_RESULT', result }, stationId)
          const detail = result.ok ? `${playerA?.name} → ${playerB?.name}: ${aCards} / ${playerB?.name} → ${playerA?.name}: ${bCards} · ${message.request.playerACardIds.length}장` : `${playerA?.name} ↔ ${playerB?.name} · ${resultText(result)}`
          addLog(result.ok ? 'success' : 'error', `거래 ${result.ok ? '완료' : '실패'}`, detail, stationId)
          if (result.ok && result.publicState.endReason === 'monopoly') {
            const official = engineRef.current.getState()
            const winner = official.players.find((player) => player.id === official.winnerPlayerId)
            const resource = official.settings.deckRules.find((rule) => rule.type === official.winnerResourceType)
            addLog('warning', '독점 발생 · 게임 자동 종료', `${winner?.name} · ${resource?.label} 독점`, stationId)
          }
        })
      } else if (message.type === 'MESSAGE_TEST_REQUEST') network.runMessageTest(stationId, message.testId, message.count)
      else if (message.type === 'MESSAGE_TEST_REPORT') { network.recordReport(stationId, message.report); addLog(message.report.missing || message.report.duplicates ? 'error' : 'success', '연결 테스트 완료', `수신 ${message.report.received}/${message.report.requested}`, stationId) }
    }
    return () => { unsubscribe(); network.disconnect(); channelRef.current?.close() }
  }, [roomCode, stationUrl, fresh])

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (state.phase === 'active' && remainingMs <= 0) { engineRef.current.endGame('timeout'); addLog('warning', '제한시간 종료', '최종 결과 계산을 완료했습니다.') } }, [state.phase, remainingMs])
  useEffect(() => {
    const snapshot: BoardSnapshot = { state: engineRef.current.getPublicState(), stations: stations.map(({ slot, connection, busy }) => ({ slot, connection, busy })), stationCapacity: 3, publishedAt: Date.now() }
    channelRef.current?.postMessage(snapshot); localStorage.setItem(`exclusive-board-${roomCode}`, JSON.stringify(snapshot))
  }, [state, stations, now, roomCode])

  const openBoard = () => window.open(boardUrl, 'exclusive-game-board', 'popup=yes,width=1280,height=800')
  const startGame = () => { engineRef.current.startGame(); addLog('success', '시장 개장', `제한시간 ${state.settings.durationMinutes}분`); openBoard() }
  const endGame = () => { if (window.confirm('거래를 중단하고 현재 순위로 게임을 종료할까요?')) { engineRef.current.endGame('manual'); addLog('warning', '교사 수동 종료', '현재 상태로 결과를 계산했습니다.') } }
  const revealResults = () => { engineRef.current.revealResults(); addLog('success', '결과 공개', '최종 점수와 순위를 공개했습니다.'); openBoard() }

  const copyResultsAndLog = async () => {
    const current = engineRef.current.getState()
    const resultRows = [['순위', '플레이어', '최고 자원', '보유/독점', '완성률', '폭탄', '계산 과정', '점수'], ...(current.rankings ?? []).map((rank) => {
      const rate = Math.round(rank.completionRate * 100)
      const monopolyWinner = current.endReason === 'monopoly' && current.winnerPlayerId === rank.playerId
      return [rank.rank, current.players.find((player) => player.id === rank.playerId)?.name ?? '', rank.targetLabel, `${rank.targetCount}/${rank.requiredCount}`, `${rate}%`, rank.bombCount, `${rate} - (${rank.bombCount}×15)${monopolyWinner ? ' · 독점 승리로 1위' : ''}`, rank.score]
    })]
    const logRows = [['시간', '구분', '내용', '거래소'], ...[...logs].reverse().map((log) => [new Date(log.at).toLocaleString('ko-KR'), log.title, log.detail ?? '', stations.find((station) => station.stationId === log.stationId) ? `${stations.find((station) => station.stationId === log.stationId)!.slot}번 거래소` : log.stationId ?? ''] )]
    const rowCount = Math.max(logRows.length, resultRows.length)
    const sideBySideRows = Array.from({ length: rowCount }, (_, index) => [...(logRows[index] ?? ['', '', '', '']), '', ...(resultRows[index] ?? ['', '', '', '', '', '', '', ''])])
    const text = [['게임 운영 과정 로그', '', '', '', '', '독점게임 최종 결과'], ...sideBySideRows, [], ['점수 계산식', '최고 자원 완성률(반올림) - 폭탄 수 × 15점', '', '', '', '독점 성공자는 점수와 관계없이 1위']].map((row) => row.join('\t')).join('\n')
    try { await navigator.clipboard.writeText(text); setCopyStatus('복사 완료') } catch { setCopyStatus('복사 실패') }
    window.setTimeout(() => setCopyStatus(''), 1800)
  }

  const requestReconnect = (stationId: string, slot: number) => {
    const sent = networkRef.current?.send({ type: 'RECONNECT_REQUEST' }, stationId)
    addLog(sent ? 'info' : 'warning', `${slot}번 거래소 재연결 ${sent ? '요청' : '실패'}`, sent ? '거래소 연결만 다시 맺습니다. 게임 상태는 변경되지 않습니다.' : '현재 거래소에 신호를 보낼 수 없습니다.', stationId)
  }

  const winner = state.players.find((player) => player.id === state.winnerPlayerId)
  return <main className={`app-shell host-page ${state.resultsRevealed ? 'celebration' : ''}`}>
    {state.resultsRevealed && <div className="fireworks" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}</div>}
    <header className="topbar"><div><p className="eyebrow">TEACHER CONTROL ROOM</p><h1>독점게임 운영 페이지</h1></div><div className="header-status"><StatusDot status={hostReady ? 'connected' : 'connecting'} /><span>{backupStatus}</span><Link to="/rules">게임 규칙</Link></div></header>
    <section className="host-command panel">
      <div className="command-room"><span>ROOM CODE</span><div className="room-code-with-qr"><strong>{roomCode}</strong>{qrUrl && <button className="qr-button" onClick={() => setQrOpen(true)} aria-label="거래소 QR 크게 보기"><img className="host-qr" src={qrUrl} alt="거래소 접속 QR" /></button>}</div><button onClick={() => navigator.clipboard.writeText(stationUrl)}>거래소 주소 복사</button></div>
      <div className="command-timer"><span>{state.phase === 'setup' ? '게임 준비' : state.phase === 'active' ? '남은 시간' : '게임 종료'}</span><div className="timer-value-row"><strong>{formatTime(remainingMs)}</strong>{state.phase === 'ended' && !state.resultsRevealed && <button className="result-reveal-button" onClick={revealResults}>결과 공개</button>}{state.phase === 'ended' && state.resultsRevealed && <button className="game-exit-button" onClick={() => navigate('/')}>게임종료(메인화면)</button>}</div><div className="timer-actions"><button onClick={openBoard}>학생 전광판 열기 ↗</button>{state.phase === 'setup' && <button className="primary" onClick={startGame}>게임 시작</button>}{state.phase === 'active' && <button className="danger-text" onClick={endGame}>수동 종료</button>}</div></div>
      <div className="command-stations"><span>거래소 연결</span><strong>{connected}<small>/3</small></strong><div className="station-lights">{[1,2,3].map((slot) => { const station = stations.find((item) => item.slot === slot); return <i className={station?.connection === 'connected' ? station.busy ? 'busy' : 'on' : ''} title={`${slot}번 거래소`} key={slot} /> })}</div></div>
    </section>
    {qrOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="거래소 QR 코드" onClick={() => setQrOpen(false)}><div className="qr-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setQrOpen(false)}>닫기 ×</button><img src={qrUrl} alt="거래소 접속 QR 확대" /><h2>거래소 접속</h2><p>태블릿 카메라로 QR 코드를 스캔하세요.</p></div></div>}

    {state.phase === 'ended' && <section className={`panel result-banner ${state.resultsRevealed ? 'revealed' : ''}`}><span>{state.resultsRevealed ? 'FINAL RESULT' : 'GAME STOPPED'}</span><h2>{state.resultsRevealed && winner ? `${winner.name} 우승` : state.endReason === 'monopoly' ? '독점이 발생했습니다' : '게임이 종료되었습니다'}</h2><p>{state.resultsRevealed ? '최종 점수와 순위가 공개되었습니다.' : '결과 공개 버튼을 눌러 점수와 순위를 확인하세요.'}</p>{state.resultsRevealed && <button className="copy-results-button" onClick={copyResultsAndLog}>{copyStatus || '결과 로그 복사하기'}</button>}</section>}

    {!state.resultsRevealed ? <section className="host-main-grid"><article className="panel"><div className="section-heading"><div><span className="label">PRIVATE PLAYER STATUS</span><h2>실시간 독점 현황</h2></div><span className="muted">교사 화면 전용 · 거래 성공 {state.trades.filter((trade) => trade.status === 'success').length}건</span></div><TeamGrid state={state} revealCards /></article><aside className="panel"><div className="section-heading"><div><span className="label">LIVE OPERATIONS</span><h2>운영 기록</h2></div></div><LogPanel logs={logs} /></aside></section>
      : <section className="result-log-layout"><article className="panel"><div className="section-heading"><div><span className="label">GAME OPERATIONS</span><h2>게임 운영 과정 로그</h2></div></div><LogPanel logs={logs} /></article><aside className="panel final-result-panel"><div className="section-heading"><div><span className="label">FINAL RESULT</span><h2>독점게임 최종 결과</h2></div><button className="copy-results-button compact" onClick={copyResultsAndLog}>{copyStatus || '결과 로그 복사하기'}</button></div><p className="score-formula-guide">점수 = 최고 자원 완성률(반올림) − 폭탄 수 × 15점 · 독점 성공자는 1위 고정</p><div className="ranking-table detailed">{state.rankings?.map((rank) => { const rate = Math.round(rank.completionRate * 100); return <div key={rank.playerId}><b>{rank.rank}위</b><span>{state.players.find((player) => player.id === rank.playerId)?.name}</span><span>{rank.targetLabel} {rank.targetCount}/{rank.requiredCount}</span><span>{rate} − ({rank.bombCount}×15)</span><strong>{rank.score}점</strong></div> })}</div></aside></section>}

    <section className="panel diagnostics"><div className="section-heading"><div><span className="label">CONNECTION STATUS</span><h2>거래소 연결 상태</h2></div><span className="muted">재연결은 카드와 게임 상태를 변경하지 않습니다.</span></div><div className="station-list">{[1,2,3].map((slot) => { const station = stations.find((item) => item.slot === slot); return <div className="station-row safe" key={slot}><b>{slot}번 거래소</b>{station ? <><StatusDot status={station.connection} /><span>{station.busy ? '이용 중' : '이용 가능'}</span><span>RTT {station.latencyMs ?? '—'}ms</span><button disabled={station.connection !== 'connected'} onClick={() => requestReconnect(station.stationId, slot)}>재연결 요청</button></> : <><span className="muted">연결 대기</span><span /><span /><button disabled>재연결 요청</button></>}</div> })}</div></section>
  </main>
}
