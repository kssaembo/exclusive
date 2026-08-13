import { Link } from 'react-router-dom'
import { RESOURCE_RULES } from '../game/rules'
import { resourceIcon } from '../assets'
import { audioFiles, BackgroundAudio } from '../audio'

export function RulesPage() {
  return <main className="info-page app-shell">
    <BackgroundAudio src={audioFiles.lobby} label="로비 음악" />
    <header className="simple-header"><Link to="/">← 메인</Link><div><p className="eyebrow">GAME GUIDE</p><h1>독점게임 설명</h1></div></header>
    <section className="rule-hero panel"><div><span className="rule-number">01</span><h2>목표</h2><p>거래를 통해 한 종류의 자원 카드를 모두 모으세요. 거래 직후 자동으로 독점을 판정하며 성공하면 즉시 게임이 종료됩니다.</p></div><div><span className="rule-number">02</span><h2>거래</h2><p>두 플레이어가 거래소에서 각자 비공개로 카드를 선택합니다. 카드 종류는 달라도 되지만 반드시 같은 장수끼리 교환합니다.</p></div><div><span className="rule-number">03</span><h2>폭탄</h2><p>폭탄은 종료 시 1장당 15점을 감점합니다. 단, 해당 게임의 폭탄을 전부 모으면 역독점으로 즉시 승리합니다.</p></div></section>
    <section className="panel rule-section"><div className="section-heading"><div><span className="label">8 PLAYER EXAMPLE</span><h2>8인 기준 카드 구성</h2></div><span className="muted">6~15명은 같은 비율로 자동 조정</span></div><div className="rule-card-grid">{RESOURCE_RULES.map((rule) => <div className={`rule-card ${rule.type === 'bomb' ? 'bomb' : ''}`} key={rule.type}><img src={resourceIcon(rule.type)} alt="" /><b>{rule.label}</b><strong>{rule.count}</strong><span>{rule.type === 'bomb' ? '역독점' : '전량 독점'}</span></div>)}</div></section>
    <section className="panel rule-section"><h2>교실 운영 흐름</h2><ol className="flow-list"><li><b>준비</b><span>교사가 6~15명의 이름과 제한시간을 설정합니다. 각자 8장을 받습니다.</span></li><li><b>협상</b><span>학생들은 원하는 카드 장수만 공개하며 교환 상대를 찾습니다.</span></li><li><b>거래</b><span>거래소에서 본인 이름을 선택하고 같은 장수의 카드를 맞교환합니다.</span></li><li><b>독점</b><span>거래 직후 독점이 자동 판정되며 즉시 종료됩니다. 교사가 결과 공개를 누르면 점수와 순위가 공개됩니다.</span></li></ol></section>
    <div className="center-actions"><Link className="action-link primary" to="/setup">설정 시작하기</Link></div>
  </main>
}
