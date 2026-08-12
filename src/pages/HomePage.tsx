import { Link } from 'react-router-dom'

export function HomePage() {
  return <main className="landing-page">
    <div className="landing-mark" aria-hidden="true">64</div>
    <section className="landing-content">
      <p className="eyebrow">CLASSROOM GENIUS GAME</p>
      <h1>독점게임</h1>
      <p className="landing-copy">8개의 팀, 64장의 카드, 단 하나의 독점.<br />협상하고 교환하며 가장 먼저 시장을 지배하세요.</p>
      <div className="landing-actions">
        <Link className="action-link primary" to="/setup">게임 시작하기</Link>
        <Link className="action-link" to="/rules">게임 설명</Link>
      </div>
      <p className="landing-note">교사용 운영 화면과 학생 공개 전광판이 분리되어 실행됩니다.</p>
    </section>
  </main>
}
