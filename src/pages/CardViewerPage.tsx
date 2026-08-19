import { useEffect, useMemo, useRef, useState } from 'react'
import { resourceIcon } from '../assets'
import type { Card, CardViewerMessage, GamePhase } from '../types'

type PlayerItem = { id: string; name: string }
type VisibleCard = Pick<Card, 'type' | 'label'>
type CardView = { playerId: string; playerName: string; cards: VisibleCard[]; version: number }

export function CardViewerPage() {
  const room = new URLSearchParams(location.search).get('room') ?? ''
  const channelRef = useRef<BroadcastChannel | null>(null)
  const [players, setPlayers] = useState<PlayerItem[]>([])
  const [phase, setPhase] = useState<GamePhase>('setup')
  const [pending, setPending] = useState<PlayerItem | null>(null)
  const [view, setView] = useState<CardView | null>(null)
  const [connected, setConnected] = useState(false)
  const cardGroups = useMemo(() => {
    if (!view) return []
    const groups = new Map<string, { card: VisibleCard; count: number }>()
    view.cards.forEach((card) => { const current = groups.get(card.type); groups.set(card.type, { card, count: (current?.count ?? 0) + 1 }) })
    return [...groups.values()].sort((a, b) => b.count - a.count || a.card.label.localeCompare(b.card.label, 'ko'))
  }, [view])

  useEffect(() => {
    const channel = new BroadcastChannel(`exclusive-cards-${room}`)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<CardViewerMessage>) => {
      if (event.data.type === 'PLAYER_LIST') { setPlayers(event.data.players); setPhase(event.data.phase); setConnected(true) }
      if (event.data.type === 'PLAYER_CARDS') setView({ playerId: event.data.playerId, playerName: event.data.playerName, cards: event.data.cards, version: event.data.version })
    }
    channel.postMessage({ type: 'VIEWER_READY' } satisfies CardViewerMessage)
    const retry = window.setInterval(() => channel.postMessage({ type: 'VIEWER_READY' } satisfies CardViewerMessage), 2500)
    return () => { window.clearInterval(retry); channel.postMessage({ type: 'VIEWER_CLEAR' } satisfies CardViewerMessage); channel.close() }
  }, [room])

  const confirmPlayer = () => {
    if (!pending) return
    setView(null)
    channelRef.current?.postMessage({ type: 'PLAYER_REQUEST', playerId: pending.id } satisfies CardViewerMessage)
    setPending(null)
  }
  const hideCards = () => { setView(null); channelRef.current?.postMessage({ type: 'VIEWER_CLEAR' } satisfies CardViewerMessage) }

  return <main className="card-viewer-page">
    <header><div><p className="eyebrow">PRIVATE CARD CHECK · ROOM {room}</p><h1>내 카드 확인</h1></div><span className={connected ? 'viewer-online' : 'viewer-waiting'}>{connected ? '● 운영 페이지 연결됨' : '○ 운영 페이지 연결 대기'}</span></header>
    {!view ? <section className="card-player-select panel">
      <span className="label">PLAYER SELECT</span><h2>본인의 이름을 선택하세요</h2><p>카드는 본인만 확인할 수 있습니다. 친구가 화면을 보지 않도록 차례대로 이용하세요.</p>
      <div className="card-player-grid">{players.map((player) => <button key={player.id} onClick={() => setPending(player)}>{player.name}</button>)}</div>
      {!players.length && <div className="viewer-empty">교사 운영 페이지에서 카드 명단을 불러오고 있습니다.</div>}
      <small>현재 상태: {phase === 'setup' ? '게임 준비' : phase === 'active' ? '게임 진행 중' : '게임 종료'}</small>
    </section> : <section className="private-card-screen panel">
      <div className="private-card-heading"><div><span className="label">MY CARDS</span><h2>{view.playerName}님의 카드</h2><p>총 {view.cards.length}장 · 거래가 완료되면 자동으로 갱신됩니다.</p></div><button onClick={hideCards}>카드 가리기</button></div>
      <div className="private-card-grid">{cardGroups.map(({ card, count }) => <article className={card.type === 'bomb' ? 'bomb' : ''} key={card.type}><img src={resourceIcon(card.type)} alt="" /><strong>{card.label}</strong><b>{count}장</b></article>)}</div>
      <p className="privacy-reminder">확인을 마쳤다면 반드시 <b>카드 가리기</b>를 눌러주세요.</p>
    </section>}
    {pending && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="private-warning-title" onClick={() => setPending(null)}><div className="card-warning-modal" onClick={(event) => event.stopPropagation()}><span className="label">PRIVATE INFORMATION</span><h2 id="private-warning-title">{pending.name}님이 맞나요?</h2><p>다른 친구의 카드를 열어보면 절대 안 됩니다.<br />본인의 이름이 맞을 때만 확인을 눌러주세요.</p><div><button onClick={() => setPending(null)}>다시 선택</button><button className="primary" onClick={confirmPlayer}>본인 확인 · 카드 보기</button></div></div></div>}
  </main>
}
