import { useEffect, useRef, useState } from 'react'
import { StatusDot } from '../components/StatusDot'
import { TeamGrid } from '../components/TeamGrid'
import { GameEngine } from '../game/GameEngine'
import { createInitialState } from '../game/initialState'
import { MONOPOLY_RULES } from '../game/rules'
import { createStationTransport, type IStationGameTransport } from '../network/transportFactory'
import { createId } from '../network/ids'
import type { ConnectionLevel, MessageTestReport, PlayerSnapshot, PublicGameState, ResourceType, TradeRequest, WireMessage } from '../types'

type TradeStage = 'auth-a' | 'select-a' | 'privacy' | 'auth-b' | 'select-b' | 'review' | 'processing' | 'done'
type Notice = { kind: 'success' | 'error' | 'info'; text: string }

export function StationPage() {
  const params = new URLSearchParams(location.search)
  const [roomInput, setRoomInput] = useState(params.get('room')?.toUpperCase() ?? localStorage.getItem('exclusive-last-room') ?? '')
  const [activeRoom, setActiveRoom] = useState('')
  const [connection, setConnection] = useState<ConnectionLevel>('disconnected')
  const [state, setState] = useState<PublicGameState>(() => new GameEngine(createInitialState()).getPublicState())
  const [slot, setSlot] = useState<number | null>(null)
  const [stage, setStage] = useState<TradeStage>('auth-a')
  const [accessCode, setAccessCode] = useState('')
  const [playerA, setPlayerA] = useState<PlayerSnapshot | null>(null)
  const [playerB, setPlayerB] = useState<PlayerSnapshot | null>(null)
  const [cardsA, setCardsA] = useState<string[]>([])
  const [cardsB, setCardsB] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice>({ kind: 'info', text: '방 코드를 입력해 연결하세요.' })
  const [lastRequest, setLastRequest] = useState<TradeRequest | null>(null)
  const [testReport, setTestReport] = useState<MessageTestReport | null>(null)
  const [claimPlayerId, setClaimPlayerId] = useState('')
  const [claimType, setClaimType] = useState<ResourceType>('coal')
  const networkRef = useRef<IStationGameTransport | undefined>(undefined)
  const lastRequestRef = useRef<TradeRequest | null>(null)
  const stageRef = useRef<TradeStage>('auth-a')
  const authRequests = useRef(new Map<string, 'A' | 'B'>())
  const testRef = useRef<{ testId: string; total: number; startedAt: number; received: Map<number, number>; timer?: number } | undefined>(undefined)
  const stationIdRef = useRef(localStorage.getItem('exclusive-station-id') || createId('station'))

  useEffect(() => { localStorage.setItem('exclusive-station-id', stationIdRef.current) }, [])
  useEffect(() => { stageRef.current = stage }, [stage])
  useEffect(() => {
    const recoverIfDisconnected = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      networkRef.current?.recoverIfDisconnected()
    }
    document.addEventListener('visibilitychange', recoverIfDisconnected)
    window.addEventListener('online', recoverIfDisconnected)
    window.addEventListener('pageshow', recoverIfDisconnected)
    return () => {
      document.removeEventListener('visibilitychange', recoverIfDisconnected)
      window.removeEventListener('online', recoverIfDisconnected)
      window.removeEventListener('pageshow', recoverIfDisconnected)
    }
  }, [])
  useEffect(() => () => networkRef.current?.disconnect(), [])

  const connect = () => {
    const room = roomInput.trim().toUpperCase()
    if (room.length < 4) { setNotice({ kind: 'error', text: '올바른 방 코드를 입력하세요.' }); return }
    localStorage.setItem('exclusive-last-room', room); networkRef.current?.disconnect(); setActiveRoom(room)
    const network = createStationTransport(room, stationIdRef.current, '거래소 태블릿', { onConnection: setConnection, onError: (message) => setNotice({ kind: 'error', text: message }), onMessage: handleMessage })
    networkRef.current = network; network.connect()

    function handleMessage(message: WireMessage) {
      if (message.type === 'WELCOME') {
        setState(message.state); setSlot(message.stationSlot); setNotice({ kind: 'success', text: `거래소 ${message.stationSlot} 연결 완료` })
        if (lastRequestRef.current && stageRef.current === 'processing') network.send({ type: 'TRADE_REQUEST', request: lastRequestRef.current })
      }
      else if (message.type === 'STATE_SYNC') setState(message.state)
      else if (message.type === 'AUTH_RESULT') {
        const side = authRequests.current.get(message.requestId); authRequests.current.delete(message.requestId)
        if (!message.ok) { setNotice({ kind: 'error', text: message.message }); return }
        if (side === 'A') { setPlayerA(message.player); setCardsA([]); setStage('select-a'); setNotice({ kind: 'success', text: `${message.player.name} 인증 완료. 교환할 카드를 선택하세요.` }) }
        if (side === 'B') {
          setPlayerA((currentA) => {
            if (currentA?.id === message.player.id) { setNotice({ kind: 'error', text: '첫 번째 참가자와 다른 참가자를 인증하세요.' }); return currentA }
            setPlayerB(message.player); setCardsB([]); setStage('select-b'); setNotice({ kind: 'success', text: `${message.player.name} 인증 완료. 교환할 카드를 선택하세요.` }); return currentA
          })
        }
        setAccessCode('')
      } else if (message.type === 'TRADE_RESULT') {
        setState(message.result.publicState)
        if (message.result.ok) { setPlayerA(message.result.playerA); setPlayerB(message.result.playerB); setStage('done'); setNotice({ kind: 'success', text: `거래 완료 · 공식 상태 v${message.result.publicState.version}${message.result.duplicateRequest ? ' · 중복 안전 처리' : ''}` }) }
        else { setStage('review'); setNotice({ kind: 'error', text: `${message.result.code} · ${message.result.message}` }) }
      } else if (message.type === 'CLAIM_RECEIVED') {
        setNotice({ kind: message.claim.status === 'approved' ? 'success' : message.claim.status === 'rejected' ? 'error' : 'info', text: message.claim.status === 'pending' ? '독점 선언이 교사 화면에 접수되었습니다.' : message.claim.status === 'approved' ? '독점 선언이 승인되어 게임이 종료되었습니다.' : `독점 선언 반려 · ${message.claim.reason ?? ''}` })
      } else if (message.type === 'MESSAGE_TEST_ITEM') receiveTestItem(message)
      else if (message.type === 'ERROR') setNotice({ kind: 'error', text: `${message.code} · ${message.message}` })
    }

    function receiveTestItem(message: Extract<WireMessage, { type: 'MESSAGE_TEST_ITEM' }>) {
      let test = testRef.current
      if (!test || test.testId !== message.testId) { test = { testId: message.testId, total: message.total, startedAt: Date.now(), received: new Map() }; testRef.current = test }
      test.received.set(message.sequence, (test.received.get(message.sequence) ?? 0) + 1)
      if (test.timer) window.clearTimeout(test.timer)
      test.timer = window.setTimeout(() => finishMessageTest(network), test.received.size === test.total ? 80 : 1200)
    }
  }

  const finishMessageTest = (network = networkRef.current) => {
    const test = testRef.current; if (!test || !network) return
    const received = test.received.size
    const report: MessageTestReport = { testId: test.testId, requested: test.total, received, missing: test.total - received, duplicates: [...test.received.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0), durationMs: Date.now() - test.startedAt }
    setTestReport(report); network.send({ type: 'MESSAGE_TEST_REPORT', report }); testRef.current = undefined
  }
  const authenticate = (side: 'A' | 'B') => {
    if (!/^[0-9]{4}$/.test(accessCode)) { setNotice({ kind: 'error', text: '4자리 인증코드를 입력하세요.' }); return }
    const requestId = createId('auth'); authRequests.current.set(requestId, side)
    if (!networkRef.current?.send({ type: 'AUTH_REQUEST', requestId, accessCode })) setNotice({ kind: 'error', text: '호스트에 연결되지 않았습니다.' })
    else setNotice({ kind: 'info', text: '호스트에서 참가자 정보를 확인 중입니다…' })
  }
  const toggleCard = (side: 'A' | 'B', cardId: string) => {
    const setter = side === 'A' ? setCardsA : setCardsB
    setter((cards) => cards.includes(cardId) ? cards.filter((id) => id !== cardId) : [...cards, cardId])
  }
  const submitTrade = (dropAfterSend = false) => {
    if (!playerA || !playerB || !cardsA.length || cardsA.length !== cardsB.length) { setNotice({ kind: 'error', text: '양쪽에서 같은 수의 카드를 선택하세요.' }); return }
    const request: TradeRequest = { tradeId: createId('trade'), stationId: stationIdRef.current, playerAId: playerA.id, playerBId: playerB.id, playerACardIds: cardsA, playerBCardIds: cardsB, playerAAuthToken: playerA.authToken, playerBAuthToken: playerB.authToken, expectedPlayerVersions: { [playerA.id]: playerA.version, [playerB.id]: playerB.version }, processingDelayMs: 500 }
    if (!networkRef.current?.send({ type: 'TRADE_REQUEST', request })) { setNotice({ kind: 'error', text: '연결되지 않아 거래를 보낼 수 없습니다.' }); return }
    lastRequestRef.current = request; setLastRequest(request); setStage('processing'); setNotice({ kind: 'info', text: '호스트가 팀 잠금·버전·카드 소유권을 검증 중입니다…' })
    if (dropAfterSend) window.setTimeout(() => networkRef.current?.simulateDrop(), 100)
  }
  const resetTrade = () => { lastRequestRef.current = null; setStage('auth-a'); setPlayerA(null); setPlayerB(null); setCardsA([]); setCardsB([]); setLastRequest(null); setNotice({ kind: 'info', text: '첫 번째 참가자를 인증하세요.' }) }
  const resendDuplicate = () => { if (lastRequest) { networkRef.current?.send({ type: 'TRADE_REQUEST', request: lastRequest }); setNotice({ kind: 'info', text: '동일 TradeID를 다시 전송했습니다.' }) } }
  const requestMessageTest = (count: 1 | 10 | 100) => { const testId = createId('msgtest'); testRef.current = { testId, total: count, startedAt: Date.now(), received: new Map() }; networkRef.current?.send({ type: 'MESSAGE_TEST_REQUEST', testId, count }); setNotice({ kind: 'info', text: `${count}개 메시지 수신 대기 중…` }) }
  const requestClaim = () => {
    const player = [playerA, playerB].find((item) => item?.id === claimPlayerId)
    if (!player) return
    networkRef.current?.send({ type: 'CLAIM_REQUEST', claimId: createId('claim'), playerId: player.id, authToken: player.authToken, resourceType: claimType })
    setNotice({ kind: 'info', text: '독점 선언을 전송했습니다…' })
  }

  if (!activeRoom) return <main className="station-entry"><div className="entry-card"><p className="eyebrow">거래소 태블릿</p><h1>호스트 방 연결</h1><p>교사 화면의 코드를 입력하세요.</p><input value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} maxLength={8} placeholder="예: A3K9PX" autoFocus /><button onClick={connect}>WebRTC 연결</button><div className={`notice ${notice.kind}`}>{notice.text}</div></div></main>

  const currentPlayer = stage === 'select-a' ? playerA : stage === 'select-b' ? playerB : null
  const currentCards = stage === 'select-a' ? cardsA : cardsB
  const currentSide = stage === 'select-a' ? 'A' : 'B'
  return (
    <main className="app-shell station-page">
      <header className="topbar"><div><p className="eyebrow">TRADE STATION {slot ?? '—'} · ROOM {activeRoom}</p><h1>비공개 카드 교환</h1></div><div className="header-status"><StatusDot status={connection} /><span>{state.phase === 'active' ? '거래 가능' : state.phase === 'ended' ? '시장 폐장' : '개장 대기'}</span></div></header>
      <div className={`notice sticky ${notice.kind}`}>{notice.text}</div>

      <section className="panel trade-flow"><div className="step-track"><span className={stage.startsWith('auth') || stage.startsWith('select') ? 'active' : ''}>1 인증/선택</span><span className={stage === 'review' ? 'active' : ''}>2 확인</span><span className={stage === 'processing' || stage === 'done' ? 'active' : ''}>3 호스트 검증</span></div>
        {(stage === 'auth-a' || stage === 'auth-b') && <div className="auth-panel"><span className="label">{stage === 'auth-a' ? 'Player A' : 'Player B'} 인증</span><h2>{stage === 'auth-a' ? '첫 번째 참가자' : '두 번째 참가자'}의 4자리 코드</h2><input inputMode="numeric" maxLength={4} value={accessCode} onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, ''))} placeholder="0000" autoFocus /><button className="primary large" disabled={connection !== 'connected' || state.phase !== 'active'} onClick={() => authenticate(stage === 'auth-a' ? 'A' : 'B')}>인증하기</button></div>}
        {(stage === 'select-a' || stage === 'select-b') && currentPlayer && <div className="private-selection"><span className="label">{currentPlayer.name} · v{currentPlayer.version}</span><h2>내가 줄 카드를 선택하세요</h2><p className="privacy-warning">이 화면은 본인만 확인하고 다른 학생에게 보여주지 마세요.</p><div className="large-card-grid">{currentPlayer.cards.map((card) => <button className={currentCards.includes(card.id) ? 'selected' : ''} key={card.id} onClick={() => toggleCard(currentSide, card.id)}><b>{card.label}</b><small>{card.id}</small></button>)}</div><button className="primary large full" disabled={!currentCards.length} onClick={() => { if (stage === 'select-a') setStage('privacy'); else setStage('review') }}>{currentCards.length}장 선택 완료</button></div>}
        {stage === 'privacy' && <div className="privacy-screen"><div className="privacy-icon">●</div><h2>Player A 선택 완료</h2><p>화면을 가린 뒤 Player B에게 태블릿을 건네주세요.</p><button className="primary large" onClick={() => setStage('auth-b')}>Player B가 이어서 진행</button></div>}
        {stage === 'review' && <div className="review-panel"><span className="label">최종 확인</span><h2>{playerA?.name} {cardsA.length}장 ↔ {playerB?.name} {cardsB.length}장</h2><p>각자 선택한 카드 내용은 숨기고 장수만 확인합니다.</p><div className="trade-actions"><button className="primary large" disabled={cardsA.length !== cardsB.length} onClick={() => submitTrade(false)}>호스트에 거래 요청</button><button className="warning-button" onClick={() => submitTrade(true)}>전송 후 연결 끊기 테스트</button></div></div>}
        {stage === 'processing' && <div className="privacy-screen"><div className="spinner" /><h2>공식 거래 처리 중</h2><p>태블릿을 닫거나 새로고침하지 마세요.</p></div>}
        {stage === 'done' && <div className="done-panel"><span className="label">거래 완료</span><h2>양쪽 카드가 최신 상태로 갱신되었습니다</h2><div className="post-cards"><div><b>{playerA?.name}</b><span>{playerA?.cards.length}장 · v{playerA?.version}</span></div><div><b>{playerB?.name}</b><span>{playerB?.cards.length}장 · v{playerB?.version}</span></div></div><button className="primary large" onClick={resetTrade}>다음 거래 시작</button></div>}
      </section>

      {stage === 'done' && <section className="panel claim-panel"><div className="section-heading"><div><span className="label">교사 검증 요청</span><h2>독점 선언</h2></div></div><div className="claim-controls"><select value={claimPlayerId} onChange={(e) => setClaimPlayerId(e.target.value)}><option value="">선언 참가자</option>{[playerA, playerB].filter(Boolean).map((player) => <option value={player!.id} key={player!.id}>{player!.name}</option>)}</select><select value={claimType} onChange={(e) => setClaimType(e.target.value as ResourceType)}>{MONOPOLY_RULES.filter((rule) => rule.type !== 'bomb' || state.phase === 'active').map((rule) => <option key={rule.type} value={rule.type}>{rule.label} {rule.count}장{rule.type === 'bomb' ? ' · 역독점' : ''}</option>)}</select><button disabled={!claimPlayerId} onClick={requestClaim}>교사에게 선언</button></div></section>}

      <details className="panel network-tests"><summary>네트워크 진단 도구</summary><div className="test-buttons"><button onClick={() => requestMessageTest(1)}>1회</button><button onClick={() => requestMessageTest(10)}>10회</button><button onClick={() => requestMessageTest(100)}>100회</button><button onClick={() => networkRef.current?.forceReconnect()}>수동 재연결</button><button disabled={!lastRequest} onClick={resendDuplicate}>동일 TradeID 재전송</button></div>{testReport && <p className="report-line">수신 <b>{testReport.received}/{testReport.requested}</b> · 누락 <b>{testReport.missing}</b> · 중복 <b>{testReport.duplicates}</b> · {testReport.durationMs}ms</p>}</details>
      <section className="panel"><div className="section-heading"><div><span className="label">공개 상태만 표시</span><h2>전체 참가자 현황</h2></div></div><TeamGrid state={state} /></section>
    </main>
  )
}
