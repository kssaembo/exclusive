import { useEffect, useMemo, useState } from 'react'
import type { BoardSnapshot } from '../types'
import { RESOURCE_RULES } from '../game/rules'

const channelName = (room: string) => `exclusive-board-${room}`
const formatTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export function BoardPage() {
  const room = new URLSearchParams(location.search).get('room') ?? ''
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(() => { const raw = localStorage.getItem(channelName(room)); return raw ? JSON.parse(raw) : null })
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const channel = new BroadcastChannel(channelName(room)); channel.onmessage = (event) => setSnapshot(event.data as BoardSnapshot)
    const storage = (event: StorageEvent) => { if (event.key === channelName(room) && event.newValue) setSnapshot(JSON.parse(event.newValue)) }
    window.addEventListener('storage', storage); const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => { channel.close(); window.removeEventListener('storage', storage); window.clearInterval(timer) }
  }, [room])
  const remaining = useMemo(() => {
    if (!snapshot?.state.startedAt) return snapshot ? snapshot.state.settings.durationMinutes * 60000 : 0
    if (snapshot.state.phase === 'ended') return Math.max(0, (snapshot.state.startedAt + snapshot.state.settings.durationMinutes * 60000) - (snapshot.state.endedAt ?? now))
    return Math.max(0, snapshot.state.startedAt + snapshot.state.settings.durationMinutes * 60000 - now)
  }, [snapshot, now])
  const winner = snapshot?.state.players.find((p) => p.id === snapshot.state.winnerPlayerId)
  const winnerResource = RESOURCE_RULES.find((r) => r.type === snapshot?.state.winnerResourceType)
  if (!snapshot) return <main className="board-page board-wait"><p className="eyebrow">PUBLIC DISPLAY · ROOM {room}</p><h1>교사 운영 화면을 기다리는 중</h1><p>이 창은 학생 공개용 전광판입니다.</p></main>
  return <main className={`board-page ${snapshot.state.phase}`}>
    <header><div><p className="eyebrow">PUBLIC DISPLAY · ROOM {room}</p><h1>독점게임</h1></div><div className={`market-status ${snapshot.state.phase}`}><i />{snapshot.state.phase === 'setup' ? '시장 개장 대기' : snapshot.state.phase === 'active' ? '시장 거래 중' : '시장 폐장'}</div></header>
    {snapshot.state.phase === 'ended' && winner ? <section className="winner-display"><p>WINNER</p><h2>{winner.name}</h2><strong>{winnerResource ? `${winnerResource.label} 독점` : snapshot.state.endReason === 'timeout' ? '시간 종료 1위' : '게임 종료'}</strong></section> : <section className="clock-display"><span>남은 시간</span><strong>{formatTime(remaining)}</strong><div className="clock-line"><i style={{ width: `${Math.max(0, Math.min(100, remaining / (snapshot.state.settings.durationMinutes * 60000) * 100))}%` }} /></div></section>}
    <section className="board-stations"><div><span>거래소 이용 현황</span><strong>{snapshot.connectedStations}/{snapshot.stationCapacity}</strong></div>{Array.from({ length: snapshot.stationCapacity }, (_, index) => <div className={`station-beacon ${index < snapshot.connectedStations ? 'available' : ''}`} key={index}><i /><span>거래소 {index + 1}</span><b>{index < snapshot.connectedStations ? '이용 가능' : '연결 대기'}</b></div>)}</section>
    <footer><span>거래 내용과 보유 카드는 공개되지 않습니다.</span><b>완료 거래 {snapshot.state.tradeCount}건</b></footer>
  </main>
}
