import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { DEFAULT_SETUP } from '../game/initialState'
import type { GameSetup } from '../types'

export function SetupPage() {
  const navigate = useNavigate()
  const saved = sessionStorage.getItem('exclusive-game-setup')
  const initial: GameSetup = saved ? { ...DEFAULT_SETUP, ...JSON.parse(saved) } : DEFAULT_SETUP
  const [names, setNames] = useState(initial.playerNames)
  const [duration, setDuration] = useState(initial.durationMinutes)
  const [bombPenalty, setBombPenalty] = useState(initial.bombPenalty)
  const [reverse, setReverse] = useState(initial.bombReverseMonopoly)
  const start = () => {
    const setup: GameSetup = { playerNames: names.map((name, i) => name.trim() || `플레이어 ${i + 1}`), durationMinutes: Math.max(1, Math.min(90, duration)), bombPenalty: Math.max(0, Math.min(50, bombPenalty)), bombReverseMonopoly: reverse }
    sessionStorage.setItem('exclusive-game-setup', JSON.stringify(setup)); sessionStorage.removeItem('exclusive-room-code'); navigate('/host?fresh=1')
  }
  return <main className="setup-page app-shell">
    <header className="simple-header"><Link to="/">← 메인</Link><div><p className="eyebrow">PRE-GAME SETUP</p><h1>게임 사전 설정</h1></div></header>
    <div className="setup-layout">
      <section className="panel"><div className="section-heading"><div><span className="label">8 PLAYERS / TEAMS</span><h2>플레이어 이름 등록</h2></div><span className="muted">64장 ÷ 8명 = 8장</span></div><div className="name-grid">{names.map((name, index) => <label key={index}><span>{String(index + 1).padStart(2, '0')}</span><input value={name} maxLength={16} onChange={(event) => setNames((current) => current.map((item, i) => i === index ? event.target.value : item))} /></label>)}</div><p className="hint">모든 자원 카드가 게임 안에 존재해야 독점이 가능하므로 8명(또는 8팀)으로 고정됩니다.</p></section>
      <aside className="panel settings-panel"><span className="label">GAME OPTIONS</span><h2>진행 설정</h2><label>제한시간 <div><input type="number" min="1" max="90" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /><span>분</span></div></label><label>폭탄 1장 감점 <div><input type="number" min="0" max="50" value={bombPenalty} onChange={(e) => setBombPenalty(Number(e.target.value))} /><span>점</span></div></label><label className="toggle-row"><input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} /><span><b>폭탄 역독점 허용</b><small>폭탄 5장을 모으면 즉시 승리</small></span></label><div className="setup-summary"><b>추천 교실 규칙</b><p>20분 · 폭탄 -15점 · 폭탄 역독점 사용</p></div><button className="primary large full" onClick={start}>운영 페이지 만들기</button></aside>
    </div>
  </main>
}
