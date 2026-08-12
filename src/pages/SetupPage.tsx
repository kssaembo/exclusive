import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { DEFAULT_SETUP } from '../game/initialState'
import { getDeckRules } from '../game/rules'
import type { GameSetup } from '../types'

const parseNames = (value: string) => value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)

export function SetupPage() {
  const navigate = useNavigate()
  const saved = sessionStorage.getItem('exclusive-game-setup')
  const initial: GameSetup = saved ? { ...DEFAULT_SETUP, ...JSON.parse(saved) } : DEFAULT_SETUP
  const [nameText, setNameText] = useState(initial.playerNames.join('\n'))
  const [duration, setDuration] = useState(initial.durationMinutes)
  const names = useMemo(() => parseNames(nameText), [nameText])
  const rules = useMemo(() => getDeckRules(Math.max(6, Math.min(15, names.length))), [names.length])
  const bombCount = rules.find((rule) => rule.type === 'bomb')?.count ?? 0
  const valid = names.length >= 6 && names.length <= 15

  const start = () => {
    if (!valid) return
    const setup: GameSetup = { playerNames: names, durationMinutes: Math.max(1, Math.min(90, duration)) }
    sessionStorage.setItem('exclusive-game-setup', JSON.stringify(setup))
    sessionStorage.removeItem('exclusive-room-code')
    navigate('/host?fresh=1')
  }

  return <main className="setup-page app-shell">
    <header className="simple-header"><Link to="/">← 메인</Link><div><p className="eyebrow">PRE-GAME SETUP</p><h1>게임 사전 설정</h1></div></header>
    <div className="setup-layout">
      <section className="panel">
        <div className="section-heading"><div><span className="label">6–15 PLAYERS</span><h2>플레이어 등록</h2></div><span className={valid ? 'muted' : 'count-error'}>{names.length}명 등록</span></div>
        <textarea className="player-textarea" value={nameText} maxLength={360} onChange={(event) => setNameText(event.target.value)} placeholder={'플레이어 이름을 한 줄에 한 명씩 입력하세요.\n예)\n김하늘\n이바다\n박푸름'} />
        <p className="hint">Enter로 이름을 구분합니다. 6명 이상 15명 이하로 등록하세요. 각 플레이어는 8장씩 받습니다.</p>
        {!valid && <p className="form-error">현재 {names.length}명입니다. 플레이어를 6~15명 등록해야 시작할 수 있습니다.</p>}
      </section>
      <aside className="panel settings-panel">
        <span className="label">GAME OPTIONS</span><h2>진행 설정</h2>
        <label>제한시간 <div><input type="number" min="1" max="90" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /><span>분</span></div></label>
        <div className="setup-summary current-rules"><b>현재 게임 규칙</b>
          <ul>
            <li><span>플레이어</span><strong>{valid ? names.length : '6~15'}명 · 1인당 8장</strong></li>
            <li><span>카드 구성</span><strong>{valid ? names.length * 8 : '인원별 자동 조정'}장 · 자원 {valid ? names.length : '6~15'}종</strong></li>
            <li><span>제한시간</span><strong>{Math.max(1, Math.min(90, duration || 1))}분</strong></li>
            <li><span>종료 점수</span><strong>자원 완성률 0~100점</strong></li>
            <li><span>폭탄 규칙</span><strong>{bombCount}장 · 1장당 -15점</strong></li>
            <li><span>즉시 승리</span><strong>자원 전량 또는 폭탄 전량 독점</strong></li>
          </ul>
          <p>동점은 자원 완성률, 폭탄이 적은 순서로 결정합니다. 카드 종류·장수와 폭탄 수는 등록 인원에 맞춰 자동 구성됩니다.</p>
        </div>
        <button className="primary large full" disabled={!valid} onClick={start}>운영 페이지 만들기</button>
      </aside>
    </div>
  </main>
}
