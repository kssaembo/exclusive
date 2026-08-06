import { useEffect, useRef, useState } from 'react'
import { StatusDot } from '../components/StatusDot'
import { TeamGrid } from '../components/TeamGrid'
import { createInitialState } from '../game/initialState'
import { StationNetwork } from '../network/StationNetwork'
import { createId } from '../network/ids'
import type { ConnectionLevel, GameState, MessageTestReport, TradeRequest, TradeResult, WireMessage } from '../types'

interface Draft { teamAId: string; teamBId: string; teamACards: string[]; teamBCards: string[] }
const emptyDraft: Draft = { teamAId: '', teamBId: '', teamACards: [], teamBCards: [] }

export function StationPage() {
  const params = new URLSearchParams(location.search)
  const [roomInput, setRoomInput] = useState(params.get('room')?.toUpperCase() ?? '')
  const [activeRoom, setActiveRoom] = useState('')
  const [connection, setConnection] = useState<ConnectionLevel>('disconnected')
  const [state, setState] = useState<GameState>(createInitialState())
  const [slot, setSlot] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(() => {
    try { return JSON.parse(localStorage.getItem('exclusive-station-draft') || '') as Draft } catch { return emptyDraft }
  })
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string }>({ kind: 'info', text: '방 코드를 입력해 연결하세요.' })
  const [pendingTradeId, setPendingTradeId] = useState('')
  const [lastRequest, setLastRequest] = useState<TradeRequest | null>(null)
  const [testReport, setTestReport] = useState<MessageTestReport | null>(null)
  const networkRef = useRef<StationNetwork | undefined>(undefined)
  const testRef = useRef<{ testId: string; total: number; startedAt: number; received: Map<number, number>; timer?: number } | undefined>(undefined)
  const stationIdRef = useRef(localStorage.getItem('exclusive-station-id') || createId('station'))

  useEffect(() => {
    localStorage.setItem('exclusive-station-id', stationIdRef.current)
    localStorage.setItem('exclusive-station-draft', JSON.stringify(draft))
  }, [draft])

  useEffect(() => {
    const recover = () => {
      if (document.visibilityState === 'visible' || navigator.onLine) networkRef.current?.forceReconnect()
    }
    document.addEventListener('visibilitychange', recover)
    window.addEventListener('online', recover)
    return () => { document.removeEventListener('visibilitychange', recover); window.removeEventListener('online', recover) }
  }, [])

  useEffect(() => () => networkRef.current?.stop(), [])

  const connect = () => {
    const room = roomInput.trim().toUpperCase()
    if (room.length < 4) { setNotice({ kind: 'error', text: '올바른 방 코드를 입력하세요.' }); return }
    networkRef.current?.stop()
    setActiveRoom(room)
    const network = new StationNetwork(room, stationIdRef.current, '거래소 태블릿', {
      onConnection: setConnection,
      onError: (message) => setNotice({ kind: 'error', text: message }),
      onMessage: handleMessage,
    })
    networkRef.current = network
    network.start()

    function handleMessage(message: WireMessage) {
      if (message.type === 'WELCOME') {
        setState(message.state); setSlot(message.stationSlot); setNotice({ kind: 'success', text: `거래소 ${message.stationSlot} 연결 완료` })
      } else if (message.type === 'STATE_SYNC') {
        setState(message.state)
      } else if (message.type === 'TRADE_RESULT') {
        setPendingTradeId('')
        setState(message.result.state)
        setNotice({ kind: message.result.ok ? 'success' : 'error', text: message.result.ok ? `거래 성공 · 상태 v${message.result.state.version}${message.result.duplicateRequest ? ' (중복 재전송 안전 처리)' : ''}` : `${message.result.code} · ${message.result.message}` })
        if (message.result.ok) setDraft(emptyDraft)
      } else if (message.type === 'MESSAGE_TEST_ITEM') {
        receiveTestItem(message)
      } else if (message.type === 'ERROR') {
        setNotice({ kind: 'error', text: `${message.code} · ${message.message}` })
      }
    }

    function receiveTestItem(message: Extract<WireMessage, { type: 'MESSAGE_TEST_ITEM' }>) {
      let test = testRef.current
      if (!test || test.testId !== message.testId) {
        test = { testId: message.testId, total: message.total, startedAt: Date.now(), received: new Map() }
        testRef.current = test
      }
      test.received.set(message.sequence, (test.received.get(message.sequence) ?? 0) + 1)
      if (test.timer) window.clearTimeout(test.timer)
      test.timer = window.setTimeout(() => finishMessageTest(network), test?.received.size === test?.total ? 80 : 1200)
    }
  }

  const finishMessageTest = (network = networkRef.current) => {
    const test = testRef.current
    if (!test || !network) return
    const received = test.received.size
    const report: MessageTestReport = {
      testId: test.testId,
      requested: test.total,
      received,
      missing: test.total - received,
      duplicates: [...test.received.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      durationMs: Date.now() - test.startedAt,
    }
    setTestReport(report)
    network.send({ type: 'MESSAGE_TEST_REPORT', report })
    setNotice({ kind: report.missing || report.duplicates ? 'error' : 'success', text: `전송 테스트 완료 · 수신 ${received}/${test.total}, 누락 ${report.missing}, 중복 ${report.duplicates}` })
    testRef.current = undefined
  }

  const teamA = state.teams.find((team) => team.id === draft.teamAId)
  const teamB = state.teams.find((team) => team.id === draft.teamBId)
  const toggleCard = (side: 'A' | 'B', cardId: string) => setDraft((current) => {
    const key = side === 'A' ? 'teamACards' : 'teamBCards'
    const cards = current[key]
    return { ...current, [key]: cards.includes(cardId) ? cards.filter((id) => id !== cardId) : [...cards, cardId] }
  })

  const makeTradeRequest = (): TradeRequest | null => {
    if (!teamA || !teamB) { setNotice({ kind: 'error', text: '서로 다른 두 팀을 선택하세요.' }); return null }
    if (!draft.teamACards.length || draft.teamACards.length !== draft.teamBCards.length) { setNotice({ kind: 'error', text: '양 팀에서 같은 수의 카드를 선택하세요.' }); return null }
    return {
      transactionId: createId('trade'), stationId: stationIdRef.current, teamAId: teamA.id, teamBId: teamB.id,
      teamACardIds: draft.teamACards, teamBCardIds: draft.teamBCards,
      expectedTeamVersions: { [teamA.id]: teamA.version, [teamB.id]: teamB.version }, processingDelayMs: 700,
    }
  }

  const submitTrade = (dropAfterSend = false) => {
    const request = makeTradeRequest()
    if (!request) return
    if (!networkRef.current?.send({ type: 'TRADE_REQUEST', request })) { setNotice({ kind: 'error', text: '연결되지 않아 거래를 보낼 수 없습니다.' }); return }
    setPendingTradeId(request.transactionId); setLastRequest(request); setNotice({ kind: 'info', text: '호스트가 팀을 잠그고 거래를 검증 중입니다…' })
    if (dropAfterSend) window.setTimeout(() => networkRef.current?.simulateDrop(), 100)
  }

  const resendDuplicate = () => {
    if (!lastRequest) { setNotice({ kind: 'error', text: '먼저 거래를 한 번 실행하세요.' }); return }
    networkRef.current?.send({ type: 'TRADE_REQUEST', request: lastRequest })
    setPendingTradeId(lastRequest.transactionId); setNotice({ kind: 'info', text: '같은 거래 ID를 재전송했습니다.' })
  }

  const requestMessageTest = (count: 1 | 10 | 100) => {
    const testId = createId('msgtest')
    testRef.current = { testId, total: count, startedAt: Date.now(), received: new Map() }
    if (!networkRef.current?.send({ type: 'MESSAGE_TEST_REQUEST', testId, count })) setNotice({ kind: 'error', text: '연결되지 않았습니다.' })
    else setNotice({ kind: 'info', text: `${count}개 메시지 수신 대기 중…` })
  }

  if (!activeRoom) return (
    <main className="station-entry"><div className="entry-card"><p className="eyebrow">거래소 태블릿</p><h1>방에 연결</h1><p>교사 화면의 6자리 코드를 입력하세요.</p><input value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} maxLength={8} placeholder="예: A3K9PX" autoFocus /><button onClick={connect}>WebRTC 연결</button><div className={`notice ${notice.kind}`}>{notice.text}</div></div></main>
  )

  return (
    <main className="app-shell station-page">
      <header className="topbar"><div><p className="eyebrow">거래소 {slot ?? '—'} · 방 {activeRoom}</p><h1>카드 교환 단말</h1></div><div className="header-status"><StatusDot status={connection} /><span>상태 v{state.version}</span></div></header>
      <div className={`notice sticky ${notice.kind}`}>{notice.text}</div>

      <section className="panel network-tests"><div className="section-heading"><div><span className="label">네트워크 검증</span><h2>메시지 전송</h2></div><button className="secondary" onClick={() => networkRef.current?.forceReconnect()}>수동 재연결</button></div><div className="test-buttons"><button onClick={() => requestMessageTest(1)}>1회</button><button onClick={() => requestMessageTest(10)}>10회</button><button onClick={() => requestMessageTest(100)}>100회</button></div>{testReport && <p className="report-line">수신 <b>{testReport.received}/{testReport.requested}</b> · 누락 <b>{testReport.missing}</b> · 중복 <b>{testReport.duplicates}</b> · {testReport.durationMs}ms</p>}</section>

      <section className="panel trade-builder"><div className="section-heading"><div><span className="label">공식 거래 요청</span><h2>1. 두 팀 선택</h2></div><span>각 팀 v{teamA?.version ?? '—'} / v{teamB?.version ?? '—'}</span></div>
        <div className="team-selectors"><select value={draft.teamAId} onChange={(e) => setDraft({ ...draft, teamAId: e.target.value, teamACards: [] })}><option value="">첫 번째 팀</option>{state.teams.filter((team) => team.id !== draft.teamBId).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select><span>⇄</span><select value={draft.teamBId} onChange={(e) => setDraft({ ...draft, teamBId: e.target.value, teamBCards: [] })}><option value="">두 번째 팀</option>{state.teams.filter((team) => team.id !== draft.teamAId).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></div>
        <h2 className="step-title">2. 같은 수의 카드 선택</h2>
        <div className="card-pickers">{[teamA, teamB].map((team, index) => <div key={index}><h3>{team?.name ?? `${index + 1}팀을 선택하세요`}</h3><div>{team?.cards.map((card) => { const selected = (index === 0 ? draft.teamACards : draft.teamBCards).includes(card.id); return <button className={selected ? 'selected' : ''} onClick={() => toggleCard(index === 0 ? 'A' : 'B', card.id)} key={card.id}>{card.label}</button> })}</div></div>)}</div>
        <div className="trade-actions"><button className="primary large" disabled={!!pendingTradeId || connection !== 'connected'} onClick={() => submitTrade(false)}>{pendingTradeId ? '거래 처리 중…' : '거래 요청 보내기'}</button><button className="warning-button" disabled={!!pendingTradeId} onClick={() => submitTrade(true)}>전송 직후 연결 끊기</button><button className="secondary" onClick={resendDuplicate}>같은 거래 ID 재전송</button></div>
      </section>
      <section className="panel"><div className="section-heading"><div><span className="label">실시간 동기화</span><h2>전체 카드 상태</h2></div></div><TeamGrid state={state} compact /></section>
    </main>
  )
}
