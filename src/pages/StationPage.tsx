import { useEffect, useRef, useState } from 'react'
import { StatusDot } from '../components/StatusDot'
import { GameEngine } from '../game/GameEngine'
import { createInitialState } from '../game/initialState'
import { createStationTransport, type IStationGameTransport } from '../network/transportFactory'
import { createId } from '../network/ids'
import type { ConnectionLevel, MessageTestReport, PlayerSnapshot, PublicGameState, ResourceType, TradeRequest, WireMessage } from '../types'

type TradeStage = 'select-a-player' | 'select-a-cards' | 'privacy' | 'select-b-player' | 'select-b-cards' | 'review' | 'processing' | 'done'
type Notice = { kind: 'success' | 'error' | 'info'; text: string }
type PendingPlayer = { side: 'A' | 'B'; id: string; name: string } | null

export function StationPage() {
  const params = new URLSearchParams(location.search)
  const [roomInput, setRoomInput] = useState(params.get('room')?.toUpperCase() ?? localStorage.getItem('exclusive-last-room') ?? '')
  const [activeRoom, setActiveRoom] = useState('')
  const [connection, setConnection] = useState<ConnectionLevel>('disconnected')
  const [state, setState] = useState<PublicGameState>(() => new GameEngine(createInitialState()).getPublicState())
  const [stage, setStage] = useState<TradeStage>('select-a-player')
  const [pendingPlayer, setPendingPlayer] = useState<PendingPlayer>(null)
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
  const stageRef = useRef<TradeStage>('select-a-player')
  const playerRequests = useRef(new Map<string, 'A' | 'B'>())
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
    localStorage.setItem('exclusive-last-room', room)
    networkRef.current?.disconnect()
    setActiveRoom(room)
    const network = createStationTransport(room, stationIdRef.current, '0번 거래소', { onConnection: setConnection, onError: (message) => setNotice({ kind: 'error', text: message }), onMessage: handleMessage })
    networkRef.current = network
    network.connect()

    function handleMessage(message: WireMessage) {
      if (message.type === 'WELCOME') {
        setState(message.state)
        setNotice({ kind: 'success', text: '게임 운영 페이지와 연결되었습니다.' })
        if (lastRequestRef.current && stageRef.current === 'processing') network.send({ type: 'TRADE_REQUEST', request: lastRequestRef.current })
      } else if (message.type === 'STATE_SYNC') setState(message.state)
      else if (message.type === 'PLAYER_SELECT_RESULT') {
        const side = playerRequests.current.get(message.requestId)
        playerRequests.current.delete(message.requestId)
        if (!message.ok) { setNotice({ kind: 'error', text: message.message }); return }
        if (side === 'A') {
          setPlayerA(message.player); setCardsA([]); setStage('select-a-cards')
          setNotice({ kind: 'success', text: `${message.player.name} 선택 완료. 교환할 카드를 고르세요.` })
        }
        if (side === 'B') {
          if (playerA?.id === message.player.id) { setNotice({ kind: 'error', text: '첫 번째 플레이어와 다른 플레이어를 선택하세요.' }); return }
          setPlayerB(message.player); setCardsB([]); setStage('select-b-cards')
          setNotice({ kind: 'success', text: `${message.player.name} 선택 완료. 교환할 카드를 고르세요.` })
        }
      } else if (message.type === 'TRADE_RESULT') {
        setState(message.result.publicState)
        if (message.result.ok) {
          setPlayerA(message.result.playerA); setPlayerB(message.result.playerB); setStage('done')
          setNotice({ kind: 'success', text: `거래가 완료되었습니다.${message.result.duplicateRequest ? ' 중복 요청은 안전하게 처리되었습니다.' : ''}` })
        } else { setStage('review'); setNotice({ kind: 'error', text: `${message.result.code} · ${message.result.message}` }) }
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
    const test = testRef.current
    if (!test || !network) return
    const received = test.received.size
    const report: MessageTestReport = { testId: test.testId, requested: test.total, received, missing: test.total - received, duplicates: [...test.received.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0), durationMs: Date.now() - test.startedAt }
    setTestReport(report)
    network.send({ type: 'MESSAGE_TEST_REPORT', report })
    setNotice(report.missing === 0 && report.duplicates === 0
      ? { kind: 'success', text: `연결됨 · 신호 ${report.received}/${report.requested} 정상` }
      : { kind: 'error', text: '연결 상태가 불안정합니다. 재연결 버튼을 눌러주세요.' })
    testRef.current = undefined
  }

  const runNetworkTest = () => {
    if (connection !== 'connected') { setNotice({ kind: 'error', text: '연결됨 표시가 아닙니다. 재연결 버튼을 눌러주세요.' }); return }
    const testId = createId('msgtest')
    testRef.current = { testId, total: 10, startedAt: Date.now(), received: new Map() }
    if (!networkRef.current?.send({ type: 'MESSAGE_TEST_REQUEST', testId, count: 10 })) setNotice({ kind: 'error', text: '신호를 보낼 수 없습니다. 재연결 버튼을 눌러주세요.' })
    else setNotice({ kind: 'info', text: '게임 운영 페이지와 신호를 주고받는 중입니다…' })
  }

  const confirmPlayer = () => {
    if (!pendingPlayer) return
    const requestId = createId('player-select')
    playerRequests.current.set(requestId, pendingPlayer.side)
    if (!networkRef.current?.send({ type: 'PLAYER_SELECT_REQUEST', requestId, playerId: pendingPlayer.id })) setNotice({ kind: 'error', text: '게임 운영 페이지에 연결되지 않았습니다.' })
    else setNotice({ kind: 'info', text: `${pendingPlayer.name}의 카드 정보를 불러오는 중입니다…` })
    setPendingPlayer(null)
  }

  const toggleCard = (side: 'A' | 'B', cardId: string) => {
    const setter = side === 'A' ? setCardsA : setCardsB
    setter((cards) => cards.includes(cardId) ? cards.filter((id) => id !== cardId) : [...cards, cardId])
  }

  const submitTrade = () => {
    if (!playerA || !playerB || !cardsA.length || cardsA.length !== cardsB.length) { setNotice({ kind: 'error', text: '양쪽에서 같은 수의 카드를 선택하세요.' }); return }
    const request: TradeRequest = { tradeId: createId('trade'), stationId: stationIdRef.current, playerAId: playerA.id, playerBId: playerB.id, playerACardIds: cardsA, playerBCardIds: cardsB, playerAAuthToken: playerA.authToken, playerBAuthToken: playerB.authToken, expectedPlayerVersions: { [playerA.id]: playerA.version, [playerB.id]: playerB.version }, processingDelayMs: 500 }
    if (!networkRef.current?.send({ type: 'TRADE_REQUEST', request })) { setNotice({ kind: 'error', text: '연결되지 않아 거래를 보낼 수 없습니다.' }); return }
    lastRequestRef.current = request; setLastRequest(request); setStage('processing'); setNotice({ kind: 'info', text: '게임 운영 페이지에서 거래를 검증 중입니다…' })
  }

  const resetTrade = () => {
    lastRequestRef.current = null; setStage('select-a-player'); setPlayerA(null); setPlayerB(null); setCardsA([]); setCardsB([]); setLastRequest(null); setClaimPlayerId(''); setNotice({ kind: 'info', text: '첫 번째 플레이어를 명단에서 선택하세요.' })
  }

  const requestClaim = () => {
    const player = [playerA, playerB].find((item) => item?.id === claimPlayerId)
    if (!player) return
    networkRef.current?.send({ type: 'CLAIM_REQUEST', claimId: createId('claim'), playerId: player.id, authToken: player.authToken, resourceType: claimType })
    setNotice({ kind: 'info', text: '독점 선언을 전송했습니다…' })
  }

  if (!activeRoom) return <main className="station-entry"><div className="entry-card"><p className="eyebrow">0번 거래소</p><h1>게임방 연결</h1><p>교사 화면의 방 코드를 입력하세요.</p><input value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} maxLength={8} placeholder="예: A3K9PX" autoFocus /><button onClick={connect}>연결하기</button><div className={`notice ${notice.kind}`}>{notice.text}</div></div></main>

  const selectingA = stage === 'select-a-player'
  const selectingB = stage === 'select-b-player'
  const currentPlayer = stage === 'select-a-cards' ? playerA : stage === 'select-b-cards' ? playerB : null
  const currentCards = stage === 'select-a-cards' ? cardsA : cardsB
  const currentSide = stage === 'select-a-cards' ? 'A' : 'B'

  return <main className="app-shell station-page">
    <section className="station-diagnostics"><button onClick={runNetworkTest}>네트워크 진단</button><button onClick={() => networkRef.current?.forceReconnect()}>재연결</button><span><StatusDot status={connection} />{connection === 'connected' ? '연결됨' : connection === 'connecting' ? '연결 중' : '연결 안 됨'}</span></section>
    <header className="topbar"><div><p className="eyebrow">ROOM {activeRoom}</p><h1>0번 거래소</h1></div><div className="header-status"><StatusDot status={connection} /><span>{state.phase === 'active' ? '거래 가능' : state.phase === 'ended' ? '시장 폐장' : '개장 대기'}</span></div></header>
    <div className={`notice sticky ${notice.kind}`}>{notice.text}</div>

    <section className="panel trade-flow">
      <div className="step-track"><span className={stage.includes('player') || stage.includes('cards') || stage === 'privacy' ? 'active' : ''}>1 플레이어·카드 선택</span><span className={stage === 'review' ? 'active' : ''}>2 거래 확인</span><span className={stage === 'processing' || stage === 'done' ? 'active' : ''}>3 거래 완료</span></div>
      {(selectingA || selectingB) && <div className="player-picker"><span className="label">{selectingA ? 'PLAYER A' : 'PLAYER B'}</span><h2>{selectingA ? '첫 번째' : '두 번째'} 플레이어 선택</h2><p>본인의 이름을 선택하세요.</p><div className="player-list">{state.players.filter((player) => !selectingB || player.id !== playerA?.id).map((player) => <button key={player.id} onClick={() => setPendingPlayer({ side: selectingA ? 'A' : 'B', id: player.id, name: player.name })}>{player.name}</button>)}</div></div>}
      {(stage === 'select-a-cards' || stage === 'select-b-cards') && currentPlayer && <div className="private-selection"><span className="label">{currentPlayer.name}</span><h2>내가 줄 카드를 선택하세요</h2><p className="privacy-warning">이 화면은 본인만 확인하고 다른 학생에게 보여주지 마세요.</p><div className="large-card-grid">{currentPlayer.cards.map((card) => <button className={currentCards.includes(card.id) ? 'selected' : ''} key={card.id} onClick={() => toggleCard(currentSide, card.id)}><b>{card.label}</b><small>{card.id}</small></button>)}</div><button className="primary large full" disabled={!currentCards.length} onClick={() => { if (stage === 'select-a-cards') setStage('privacy'); else setStage('review') }}>{currentCards.length}장 선택 완료</button></div>}
      {stage === 'privacy' && <div className="privacy-screen"><div className="privacy-icon">●</div><h2>{playerA?.name} 선택 완료</h2><p>화면을 가린 뒤 두 번째 플레이어에게 태블릿을 건네주세요.</p><button className="primary large" onClick={() => setStage('select-b-player')}>두 번째 플레이어 선택</button></div>}
      {stage === 'review' && <div className="review-panel"><span className="label">최종 확인</span><h2>{playerA?.name} {cardsA.length}장 ↔ {playerB?.name} {cardsB.length}장</h2><p>각자 선택한 카드 내용은 숨기고 장수만 확인합니다.</p><div className="trade-actions"><button className="primary large" disabled={cardsA.length !== cardsB.length} onClick={submitTrade}>거래 요청</button></div></div>}
      {stage === 'processing' && <div className="privacy-screen"><div className="spinner" /><h2>공식 거래 처리 중</h2><p>태블릿을 닫거나 새로고침하지 마세요.</p></div>}
      {stage === 'done' && <div className="done-panel"><span className="label">거래 완료</span><h2>양쪽 카드가 최신 상태로 갱신되었습니다</h2><div className="post-cards"><div><b>{playerA?.name}</b><span>{playerA?.cards.length}장</span></div><div><b>{playerB?.name}</b><span>{playerB?.cards.length}장</span></div></div><button className="primary large" onClick={resetTrade}>다음 거래 시작</button></div>}
    </section>

    {stage === 'done' && <section className="panel claim-panel"><div className="section-heading"><div><span className="label">교사 검증 요청</span><h2>독점 선언</h2></div></div><div className="claim-controls"><select value={claimPlayerId} onChange={(e) => setClaimPlayerId(e.target.value)}><option value="">선언 플레이어</option>{[playerA, playerB].filter(Boolean).map((player) => <option value={player!.id} key={player!.id}>{player!.name}</option>)}</select><select value={claimType} onChange={(e) => setClaimType(e.target.value as ResourceType)}>{state.settings.deckRules.map((rule) => <option key={rule.type} value={rule.type}>{rule.label} {rule.count}장{rule.type === 'bomb' ? ' · 역독점' : ''}</option>)}</select><button disabled={!claimPlayerId} onClick={requestClaim}>교사에게 선언</button></div></section>}

    {pendingPlayer && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="player-confirm-title"><div className="confirm-modal"><span className="label">PLAYER CHECK</span><h2 id="player-confirm-title">{pendingPlayer.name} 본인이 맞나요?</h2><p>공정한 게임을 위해 다른 플레이어의 이름을 선택해서는 안 됩니다. 반드시 본인 이름인지 확인해 주세요.</p><div><button onClick={() => setPendingPlayer(null)}>취소</button><button className="primary" onClick={confirmPlayer}>확인하고 들어가기</button></div></div></div>}
    {testReport && <span className="sr-only">최근 진단: {testReport.received}/{testReport.requested} 수신</span>}
  </main>
}
