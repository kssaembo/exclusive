import { Link } from 'react-router-dom'
import { audioFiles, BackgroundAudio } from '../audio'

export function HomePage() {
  return <main className="landing-page">
    <BackgroundAudio src={audioFiles.lobby} label="로비 음악" />
    <div className="landing-mark" aria-hidden="true">64</div>
    <section className="landing-content">
      <p className="eyebrow">더 지니어스 한 학급 놀이</p>
      <h1>독점게임</h1>
      <p className="landing-copy">단 하나의 독점.<br />협상하고 교환하며 가장 먼저 시장을 지배하세요.</p>
      <div className="landing-actions">
        <Link className="action-link primary" to="/setup"><span>PLAY</span>게임 시작하기</Link>
        <Link className="action-link guide" to="/rules"><span>GUIDE</span>게임 설명</Link>
      </div>
    </section>
  </main>
}
