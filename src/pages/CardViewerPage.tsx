import { useEffect, useRef, useState } from 'react'
import Peer, { type DataConnection } from 'peerjs'
import { images, resourceIcon } from '../assets'
import { createId, hostPeerId } from '../network/ids'
import type { Card, CardViewerMessage, GamePhase, WireMessage } from '../types'

type PlayerItem = { id: string; name: string }
type VisibleCard = Pick<Card, 'type' | 'label'>
type CardView = { playerId: string; playerName: string; cards: VisibleCard[]; version: number }

export function CardViewerPage() {
  const room = new URLSearchParams(location.search).get('room') ?? ''
  const channelRef = useRef<BroadcastChannel | null>(null)
  const connectionRef = useRef<DataConnection | null>(null)
  const selectedPlayerRef = useRef<string | null>(null)
  const [players, setPlayers] = useState<PlayerItem[]>([])
  const [phase, setPhase] = useState<GamePhase>('setup')
  const [pending, setPending] = useState<PlayerItem | null>(null)
  const [view, setView] = useState<CardView | null>(null)
  const [cardsVisible, setCardsVisible] = useState(true)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const acceptMessage = (message: CardViewerMessage | WireMessage) => {
      if (message.type === 'PLAYER_LIST') { setPlayers(message.players); setPhase(message.phase); setConnected(true) }
      if (message.type === 'PLAYER_CARDS') { setView({ playerId: message.playerId, playerName: message.playerName, cards: message.cards, version: message.version }); setConnected(true) }
      if (message.type === 'CARD_VIEWER_PLAYER_LIST') { setPlayers(message.players); setPhase(message.phase); setConnected(true) }
      if (message.type === 'CARD_VIEWER_CARDS') { setView({ playerId: message.playerId, playerName: message.playerName, cards: message.cards, version: message.version }); setConnected(true) }
    }

    const channel = new BroadcastChannel(`exclusive-cards-${room}`)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<CardViewerMessage>) => acceptMessage(event.data)
    channel.postMessage({ type: 'VIEWER_READY' } satisfies CardViewerMessage)

    const viewerId = createId('card-viewer')
    const peer = new Peer(viewerId, { debug: 1 })
    let reconnectTimer: number | undefined
    const connect = () => {
      if (peer.destroyed || connectionRef.current?.open) return
      const connection = peer.connect(hostPeerId(room), { reliable: true })
      connectionRef.current = connection
      connection.on('open', () => {
        setConnected(true)
        connection.send({ type: 'CARD_VIEWER_HELLO', viewerId } satisfies WireMessage)
        connection.send(selectedPlayerRef.current ? { type: 'CARD_VIEWER_CARDS_REQUEST', playerId: selectedPlayerRef.current } satisfies WireMessage : { type: 'CARD_VIEWER_LIST_REQUEST' } satisfies WireMessage)
      })
      connection.on('data', (raw) => acceptMessage(raw as WireMessage))
      connection.on('close', () => { setConnected(false); reconnectTimer = window.setTimeout(connect, 1500) })
      connection.on('error', () => setConnected(false))
    }
    peer.on('open', connect)
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect() })
    const refreshTimer = window.setInterval(() => {
      channel.postMessage({ type: 'VIEWER_READY' } satisfies CardViewerMessage)
      if (!connectionRef.current?.open) connect()
    }, 3000)
    return () => {
      window.clearInterval(refreshTimer)
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      channel.postMessage({ type: 'VIEWER_CLEAR' } satisfies CardViewerMessage)
      channel.close()
      connectionRef.current?.close()
      peer.destroy()
    }
  }, [room])

  const confirmPlayer = () => {
    if (!pending) return
    selectedPlayerRef.current = pending.id
    setCardsVisible(true)
    channelRef.current?.postMessage({ type: 'PLAYER_REQUEST', playerId: pending.id } satisfies CardViewerMessage)
    if (connectionRef.current?.open) connectionRef.current.send({ type: 'CARD_VIEWER_CARDS_REQUEST', playerId: pending.id } satisfies WireMessage)
    setPending(null)
  }

  return <main className="card-viewer-page">
    <header><div><p className="eyebrow">PRIVATE CARD CHECK · ROOM {room}</p><h1>내 카드 확인</h1></div><span className={connected ? 'viewer-online' : 'viewer-waiting'}>{connected ? '● 운영 페이지 연결됨' : '○ 운영 페이지 연결 대기'}</span></header>
    {!view ? <section className="card-player-select panel">
      <span className="label">PLAYER SELECT</span><h2>본인의 이름을 선택하세요</h2><p>꼭 본인 플레이어 목록을 선택해주세요. 즐거운 게임을 위해 부정행위는 하지 않습니다.</p>
      <div className="card-player-grid">{players.map((player) => <button key={player.id} onClick={() => setPending(player)}>{player.name}</button>)}</div>
      {!players.length && <div className="viewer-empty">교사 운영 페이지에서 카드 명단을 불러오고 있습니다.</div>}
      <small>현재 상태: {phase === 'setup' ? '게임 준비' : phase === 'active' ? '게임 진행 중' : '게임 종료'}</small>
    </section> : <section className="private-card-screen panel">
      <div className="private-card-heading"><div><span className="label">MY CARDS</span><h2>{view.playerName}님의 카드</h2><p>8장의 카드는 거래가 완료되면 자동으로 갱신됩니다.</p></div><button onClick={() => setCardsVisible((current) => !current)}>{cardsVisible ? '카드 가리기' : '카드 다시 보기'}</button></div>
      <div className={`private-card-grid ${cardsVisible ? '' : 'cards-hidden'}`}>{view.cards.map((card, index) => <article className={card.type === 'bomb' ? 'bomb' : ''} key={`${view.version}-${index}`}><img className="viewer-card-frame" src={cardsVisible ? card.type === 'bomb' ? images.cards.bomb : images.cards.resource : images.cards.back} alt="" />{cardsVisible && <><img className="viewer-card-resource" src={resourceIcon(card.type)} alt="" /><strong>{card.label}</strong></>}</article>)}</div>
      <p className="privacy-reminder">확인을 마쳤다면 반드시 <b>카드 가리기</b>를 눌러주세요.</p>
    </section>}
    {pending && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="private-warning-title" onClick={() => setPending(null)}><div className="card-warning-modal" onClick={(event) => event.stopPropagation()}><span className="label">PRIVATE INFORMATION</span><h2 id="private-warning-title">{pending.name}님이 맞나요?</h2><p>다른 친구의 카드를 열어보면 절대 안 됩니다.<br />본인의 이름이 맞을 때만 확인을 눌러주세요.</p><div><button onClick={() => setPending(null)}>다시 선택</button><button className="primary" onClick={confirmPlayer}>본인 확인 · 카드 보기</button></div></div></div>}
  </main>
}
