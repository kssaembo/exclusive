import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { LogPanel } from '../components/LogPanel'
import { StatusDot } from '../components/StatusDot'
import { TeamGrid } from '../components/TeamGrid'
import { GameEngine } from '../game/GameEngine'
import { createInitialState } from '../game/initialState'
import { HostNetwork } from '../network/HostNetwork'
import { createId, createRoomCode } from '../network/ids'
import { loadBackup, saveBackup } from '../storage/indexedDb'
import type { AppLog, GameState, StationStatus, TradeRequest, TradeResult, WireMessage } from '../types'

const resultText = (result: TradeResult) => result.ok ? '성공' : `${result.code}: ${result.message}`

export function HostPage() {
  const [roomCode] = useState(() => sessionStorage.getItem('exclusive-room-code') || createRoomCode())
  const engineRef = useRef(new GameEngine(createInitialState()))
  const networkRef = useRef<HostNetwork | undefined>(undefined)
  const [state, setState] = useState(engineRef.current.getState())
  const [stations, setStations] = useState<StationStatus[]>([])
  const [logs, setLogs] = useState<AppLog[]>([])
  const [hostReady, setHostReady] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [backupStatus, setBackupStatus] = useState('백업 준비 중')

  const stationUrl = useMemo(() => `${window.location.origin}/station?room=${roomCode}`, [roomCode])
  const addLog = (level: AppLog['level'], title: string, detail?: string, stationId?: string) => {
    setLogs((current) => [{ id: createId('log'), at: Date.now(), level, title, detail, stationId }, ...current].slice(0, 120))
  }

  useEffect(() => {
    sessionStorage.setItem('exclusive-room-code', roomCode)
    QRCode.toDataURL(stationUrl, { width: 240, margin: 1, color: { dark: '#101827', light: '#ffffff' } }).then(setQrUrl)
    loadBackup().then((backup) => {
      if (backup) {
        engineRef.current.replaceState(backup)
        addLog('info', 'IndexedDB 백업 복원', `상태 버전 v${backup.version}`)
      }
    }).catch(() => addLog('warning', '백업 복원 실패', '새 게임 상태로 시작합니다.'))

    const unsubscribe = engineRef.current.subscribe((nextState) => {
      setState(nextState)
      networkRef.current?.updateState(nextState)
      networkRef.current?.broadcast({ type: 'STATE_SYNC', state: nextState })
      saveBackup(nextState)
        .then(() => setBackupStatus(`백업 완료 ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`))
        .catch(() => setBackupStatus('백업 실패'))
    })

    const network = new HostNetwork(roomCode, engineRef.current.getState(), {
      onOpen: () => { setHostReady(true); addLog('success', '방 생성 완료', `방 코드 ${roomCode}`) },
      onStatus: setStations,
      onError: (message) => addLog('error', '네트워크 경고', message),
      onMessage: (stationId, message) => handleNetworkMessage(stationId, message),
    })
    networkRef.current = network
    network.start()
    const currentEngine = engineRef.current

    function handleNetworkMessage(stationId: string, message: WireMessage) {
      if (message.type === 'TRADE_REQUEST') {
        currentEngine.execute(message.request).then((result) => {
          network.send(stationId, { type: 'TRADE_RESULT', result })
          addLog(result.ok ? 'success' : 'error', `거래 ${result.ok ? '성공' : '실패'} · ${stationId.slice(-6)}`, resultText(result), stationId)
        })
      } else if (message.type === 'MESSAGE_TEST_REQUEST') {
        network.runMessageTest(stationId, message.testId, message.count)
        addLog('info', `메시지 ${message.count}회 전송`, `거래소 ${stationId.slice(-6)}`, stationId)
      } else if (message.type === 'MESSAGE_TEST_REPORT') {
        network.recordReport(stationId, message.report)
        const report = message.report
        addLog(report.missing || report.duplicates ? 'error' : 'success', '메시지 테스트 완료', `수신 ${report.received}/${report.requested} · 누락 ${report.missing} · 중복 ${report.duplicates}`, stationId)
      }
    }

    return () => { unsubscribe(); network.stop() }
  }, [roomCode, stationUrl])

  const makeRequest = (a: number, b: number, id = createId('host-test')): TradeRequest => {
    const snapshot = engineRef.current.getState()
    return {
      transactionId: id,
      stationId: 'host-test',
      teamAId: snapshot.teams[a].id,
      teamBId: snapshot.teams[b].id,
      teamACardIds: [snapshot.teams[a].cards[0].id],
      teamBCardIds: [snapshot.teams[b].cards[0].id],
      expectedTeamVersions: { [snapshot.teams[a].id]: snapshot.teams[a].version, [snapshot.teams[b].id]: snapshot.teams[b].version },
      processingDelayMs: 700,
    }
  }

  const runScenario = async (scenario: 'normal' | 'parallel' | 'collision' | 'duplicate') => {
    addLog('info', `시나리오 시작 · ${scenario}`, '호스트 내부 자동 검증')
    let results: TradeResult[] = []
    if (scenario === 'normal') results = [await engineRef.current.execute(makeRequest(0, 1))]
    if (scenario === 'parallel') results = await Promise.all([engineRef.current.execute(makeRequest(0, 1)), engineRef.current.execute(makeRequest(2, 3))])
    if (scenario === 'collision') results = await Promise.all([engineRef.current.execute(makeRequest(0, 1)), engineRef.current.execute(makeRequest(0, 2))])
    if (scenario === 'duplicate') {
      const id = createId('duplicate')
      const request = makeRequest(4, 5, id)
      results = await Promise.all([engineRef.current.execute(request), engineRef.current.execute(request)])
    }
    const successes = results.filter((result) => result.ok).length
    const duplicateSafe = scenario !== 'duplicate' || engineRef.current.getState().version === results[0].state.version
    addLog(
      (scenario === 'collision' && successes === 1) || (scenario === 'parallel' && successes === 2) || (scenario === 'normal' && successes === 1) || (scenario === 'duplicate' && successes === 2 && duplicateSafe) ? 'success' : 'error',
      `시나리오 완료 · ${scenario}`,
      `응답 성공 ${successes}/${results.length} · ${results.map(resultText).join(' | ')}`,
    )
  }

  const resetGame = () => {
    if (!window.confirm('카드 상태와 버전을 초기화할까요? 연결은 유지됩니다.')) return
    engineRef.current.replaceState(createInitialState())
    addLog('warning', '게임 상태 초기화', '8개 팀, 팀당 카드 4장')
  }

  return (
    <main className="app-shell host-page">
      <header className="topbar">
        <div><p className="eyebrow">교사 호스트 · 공식 상태 관리자</p><h1>독점게임 WebRTC 검증판</h1></div>
        <div className="header-status"><StatusDot status={hostReady ? 'connected' : 'connecting'} /><span>상태 v{state.version}</span></div>
      </header>

      <section className="host-overview">
        <article className="panel room-panel">
          <div><span className="label">방 코드</span><strong className="room-code">{roomCode}</strong><p>거래소에서 코드 입력 또는 QR 스캔</p></div>
          {qrUrl && <img src={qrUrl} alt="거래소 접속 QR 코드" />}
          <button className="secondary" onClick={() => navigator.clipboard.writeText(stationUrl)}>접속 주소 복사</button>
        </article>

        <article className="panel station-panel">
          <div className="section-heading"><div><span className="label">실시간 연결</span><h2>거래소 {stations.filter((s) => s.connection === 'connected').length}/3</h2></div><span className="backup-badge">{backupStatus}</span></div>
          <div className="station-list">
            {[1, 2, 3].map((slot) => {
              const station = stations.find((item) => item.slot === slot)
              return <div className="station-row" key={slot}><b>거래소 {slot}</b>{station ? <><StatusDot status={station.connection} /><span>RTT {station.latencyMs ?? '—'}ms</span><span>재연결 {station.reconnects}</span></> : <span className="muted">대기 중</span>}</div>
            })}
          </div>
        </article>
      </section>

      <section className="panel test-panel">
        <div className="section-heading"><div><span className="label">호스트 자동 검증</span><h2>거래 시나리오</h2></div><button className="danger-text" onClick={resetGame}>상태 초기화</button></div>
        <div className="test-buttons">
          <button onClick={() => runScenario('normal')}>정상 거래</button>
          <button onClick={() => runScenario('parallel')}>동시 거래</button>
          <button onClick={() => runScenario('collision')}>충돌 거래</button>
          <button onClick={() => runScenario('duplicate')}>중복 요청</button>
        </div>
        <p className="hint">동시 거래는 서로 다른 4개 팀, 충돌 거래는 같은 팀이 겹치는 2개 요청을 거의 동시에 실행합니다.</p>
      </section>

      <section className="content-grid">
        <article className="panel"><div className="section-heading"><div><span className="label">호스트 공식 데이터</span><h2>팀별 카드 상태</h2></div><span>잠금 {state.lockedTeamIds.length}팀</span></div><TeamGrid state={state} /></article>
        <article className="panel"><div className="section-heading"><div><span className="label">최근 120건</span><h2>검증 로그</h2></div></div><LogPanel logs={logs} /></article>
      </section>

      <section className="panel results-panel">
        <div className="section-heading"><div><span className="label">거래소별 최신 결과</span><h2>메시지 전송 품질</h2></div></div>
        <div className="results-grid">{[1,2,3].map((slot) => { const report = stations.find((s) => s.slot === slot)?.testReport; return <div key={slot}><b>거래소 {slot}</b>{report ? <><strong className={report.missing || report.duplicates ? 'bad' : 'good'}>{report.received}/{report.requested}</strong><small>누락 {report.missing} · 중복 {report.duplicates} · {report.durationMs}ms</small></> : <span className="muted">테스트 전</span>}</div> })}</div>
      </section>
    </main>
  )
}
