import { Link } from 'react-router-dom'
import { RESOURCE_RULES } from '../game/rules'

export function RulesPage() {
  return <main className="info-page app-shell">
    <header className="simple-header"><Link to="/">← 메인</Link><div><p className="eyebrow">GAME GUIDE</p><h1>독점게임 설명</h1></div></header>
    <section className="rule-hero panel"><div><span className="rule-number">01</span><h2>목표</h2><p>거래를 통해 한 종류의 자원 카드를 모두 모으고, 거래소에서 독점을 선언하세요. 교사가 검증하면 즉시 승리합니다.</p></div><div><span className="rule-number">02</span><h2>거래</h2><p>두 팀이 거래소에서 각자 비공개로 카드를 선택합니다. 카드 종류는 달라도 되지만 반드시 같은 장수끼리 교환합니다.</p></div><div><span className="rule-number">03</span><h2>폭탄</h2><p>폭탄은 종료 점수를 깎는 위험 카드입니다. 단, 5장을 전부 모으면 폭탄 역독점으로 즉시 승리할 수 있습니다.</p></div></section>
    <section className="panel rule-section"><div className="section-heading"><div><span className="label">64 CARD DECK</span><h2>카드 구성과 독점 조건</h2></div></div><div className="rule-card-grid">{RESOURCE_RULES.map((rule) => <div className={`rule-card ${rule.type === 'bomb' ? 'bomb' : ''}`} key={rule.type}><b>{rule.label}</b><strong>{rule.count}</strong><span>{rule.type === 'bomb' ? '역독점' : '전량 독점'}</span></div>)}</div></section>
    <section className="panel rule-section"><h2>교실 운영 흐름</h2><ol className="flow-list"><li><b>준비</b><span>교사가 8개 팀 이름과 제한시간을 설정합니다.</span></li><li><b>협상</b><span>학생들은 자신이 원하는 카드 장수만 공개하며 교환 상대를 찾습니다.</span></li><li><b>거래</b><span>거래소 태블릿에서 두 팀을 인증하고 같은 장수의 카드를 맞교환합니다.</span></li><li><b>독점</b><span>독점 선언을 교사가 검증하면 즉시 종료됩니다. 시간 종료 시 진행률과 폭탄 감점으로 순위를 정합니다.</span></li></ol></section>
    <div className="center-actions"><Link className="action-link primary" to="/setup">설정 시작하기</Link></div>
  </main>
}
