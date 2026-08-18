import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardSnapshot } from '../types'
import { Celebration } from '../components/Celebration'
import { images, resourceIcon } from '../assets'
import { audioFiles, BackgroundAudio, playEffect } from '../audio'

const channelName = (room: string) => `exclusive-board-${room}`
const formatTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export function BoardPage() {
  const room = new URLSearchParams(location.search).get('room') ?? ''
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(() => { const raw = localStorage.getItem(channelName(room)); return raw ? JSON.parse(raw) : null })
  const [now, setNow] = useState(Date.now())
  const previousMode = useRef('')
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
  const monopolyAlarm = !!snapshot && snapshot.state.phase === 'ended' && snapshot.state.endReason === 'monopoly' && !snapshot.state.resultsRevealed
  const revealed = !!snapshot && snapshot.state.phase === 'ended' && snapshot.state.resultsRevealed
  const audioMode = monopolyAlarm ? 'monopoly' : revealed ? 'results' : snapshot?.state.phase === 'active' ? 'market' : 'waiting'
  useEffect(() => {
    if (previousMode.current === audioMode) return
    previousMode.current = audioMode
    if (audioMode === 'monopoly') playEffect(audioFiles.monopoly, .72)
    if (audioMode === 'results') { playEffect(audioFiles.resultsReveal, .75); window.setTimeout(() => playEffect(audioFiles.firework, .55), 900) }
  }, [audioMode])
  if (!snapshot) return <main className="board-page board-wait"><p className="eyebrow">PUBLIC DISPLAY · ROOM {room}</p><h1>교사 운영 화면을 기다리는 중</h1><p>이 창은 학생 공개용 전광판입니다.</p></main>

  const winner = snapshot.state.players.find((player) => player.id === snapshot.state.winnerPlayerId)
  const winnerResource = snapshot.state.settings.deckRules.find((rule) => rule.type === snapshot.state.winnerResourceType)
  const stations = snapshot.stations ?? []
  const connectedCount = stations.filter((station) => station.connection === 'connected').length

  return <main className={`board-page ${snapshot.state.phase} ${monopolyAlarm ? 'monopoly-alarm' : ''} ${revealed ? 'results-revealed celebration' : ''}`}>
    <BackgroundAudio src={audioMode === 'results' ? audioFiles.results : audioMode === 'monopoly' ? null : audioFiles.market} label="BGM" />
    {revealed && <Celebration />}
    <header><div><p className="eyebrow">PUBLIC DISPLAY · ROOM {room}</p><h1>독점게임</h1></div><div className={`market-status ${snapshot.state.phase}`}><i />{snapshot.state.phase === 'setup' ? '시장 개장 대기' : snapshot.state.phase === 'active' ? '시장 거래 중' : '시장 폐장'}</div></header>

    {monopolyAlarm ? <section className="monopoly-alert"><img src={images.ui.monopoly} alt="" /><span>ALERT</span><h2>독점</h2><p>독점이 이루어졌습니다. 거래를 중지해 주세요.</p></section>
      : revealed && winner ? <section className="winner-display decorated-results"><p className="board-final-label">FINAL RESULT</p><h2>{winner.name}</h2><strong>{winnerResource ? `${winnerResource.label} 독점` : '최종 1위'}</strong><div className="score-formula-guide">점수 = 최고 자원 완성률(반올림) − 폭탄 수 × 15점</div><div className="board-ranking">{snapshot.state.rankings?.map((rank) => <div key={rank.playerId}>{rank.rank <= 3 ? <b className={`top-rank rank-${rank.rank}`}>{rank.rank}위</b> : <span className="rank-emblem"><img src={images.ui.rank} alt="" /><b>{rank.rank}</b></span>}<span>{snapshot.state.players.find((player) => player.id === rank.playerId)?.name}</span><small><img src={resourceIcon(rank.targetType)} alt="" />{Math.round(rank.completionRate * 100)} − ({rank.bombCount}×15)</small><strong>{rank.score}점</strong></div>)}</div></section>
      : <section className="board-game-overview"><div className="clock-display"><span>남은 시간</span><strong>{formatTime(remaining)}</strong><div className="clock-line"><i style={{ width: `${Math.max(0, Math.min(100, remaining / (snapshot.state.settings.durationMinutes * 60000) * 100))}%` }} /></div></div><div className="board-resource-panel"><div><span>RESOURCE LIST</span><h2>전체 자원 카드</h2></div><div className="board-resource-grid">{snapshot.state.settings.deckRules.map((rule) => <article className={rule.type === 'bomb' ? 'bomb' : ''} key={rule.type}><img src={resourceIcon(rule.type)} alt="" /><span>{rule.label}</span><strong>{rule.count}장</strong></article>)}</div></div></section>}

    <section className="board-stations"><div><span>거래소 이용 현황</span><strong>{connectedCount}/{snapshot.stationCapacity}</strong></div>{Array.from({ length: snapshot.stationCapacity }, (_, index) => { const station = stations.find((item) => item.slot === index + 1); const className = station?.connection === 'connected' ? station.busy ? 'busy' : 'available' : ''; return <div className={`station-beacon ${className}`} key={index}><i /><span>{index + 1}번 거래소</span><b>{station?.connection !== 'connected' ? '연결 대기' : station.busy ? '이용 중' : '이용 가능'}</b></div> })}</section>
    <footer><span>거래 내용과 보유 카드는 공개되지 않습니다.</span><b>완료 거래 {snapshot.state.tradeCount}건</b></footer>
  </main>
}
