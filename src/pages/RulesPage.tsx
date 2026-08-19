import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RESOURCE_RULES } from '../game/rules'
import { resourceIcon } from '../assets'

const slideMeta = [
  ['게임 규칙', '목표·거래·폭탄·카드 구성'],
  ['교실 운영 흐름', '준비'],
  ['교실 운영 흐름', '거래소 세팅'],
  ['교실 운영 흐름', '게임 시작'],
  ['교실 운영 흐름', '게임 종료'],
  ['', '더 자세히 알아보기'],
] as const

function GuideSteps({ children }: { children: ReactNode }) {
  return <ol className="rule-steps">{children}</ol>
}

export function RulesPage() {
  const [slide, setSlide] = useState(0)
  const go = (next: number) => setSlide(Math.max(0, Math.min(slideMeta.length - 1, next)))

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') go(slide - 1)
      if (event.key === 'ArrowRight') go(slide + 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [slide])

  return <main className="info-page app-shell rules-guide-page">
    <header className="simple-header rules-guide-header"><Link to="/">← 메인</Link><div><p className="eyebrow">GAME GUIDE</p><h1>독점게임 설명</h1></div><strong>{slide + 1} / {slideMeta.length}</strong></header>
    <section className="rules-slide-shell panel">
      {slideMeta[slide][0] && <div className="rules-slide-heading"><span>{slideMeta[slide][0]}</span><h2>{slideMeta[slide][1]}</h2></div>}

      {slide === 0 && <div className="rules-overview-slide">
        <section className="rule-hero"><div><span className="rule-number">01</span><h2>목표</h2><p>거래를 통해 한 종류의 자원 카드를 모두 모으세요. 거래 직후 자동으로 독점을 판정하며 성공하면 즉시 게임이 종료됩니다.</p></div><div><span className="rule-number">02</span><h2>거래</h2><p>두 플레이어가 거래소에서 각자 비공개로 카드를 선택합니다. 카드 종류는 달라도 되지만 반드시 같은 장수끼리 교환합니다.</p></div><div><span className="rule-number">03</span><h2>폭탄</h2><p>폭탄은 종료 시 1장당 15점을 감점합니다. 단, 해당 게임의 폭탄을 전부 모으면 역독점으로 즉시 승리합니다.</p></div></section>
        <section className="rule-section"><div className="section-heading"><div><span className="label">8 PLAYER EXAMPLE</span><h2>8인 기준 카드 구성</h2></div><span className="muted">6~15명은 같은 비율로 자동 조정</span></div><div className="rule-card-grid">{RESOURCE_RULES.map((rule) => <div className={`rule-card ${rule.type === 'bomb' ? 'bomb' : ''}`} key={rule.type}><img src={resourceIcon(rule.type)} alt="" /><b>{rule.label}</b><strong>{rule.count}</strong><span>{rule.type === 'bomb' ? '역독점' : '전량 독점'}</span></div>)}</div></section>
      </div>}

      {slide === 1 && <GuideSteps>
        <li><b>게임 시작하기 버튼을 클릭하세요.</b><p>메인화면에서 게임 시작하기를 선택하면 학습 인트로가 시작됩니다.</p></li>
        <li><b>인트로에서 학습 내용을 복습하세요.</b><p>수업 시간에 배운 국가 간 무역 내용을 간단히 확인합니다. 인트로는 건너뛸 수 있습니다.</p></li>
        <li className="rule-step-wide"><b>게임 사전 설정을 진행하세요.</b><ul><li><strong>플레이어 등록</strong> 6~15명까지 가능합니다. 계속 계산하고 추론하며 다른 친구들의 거래를 확인해야 하므로 학급에서는 2인 1조 활동을 추천합니다.</li><li><strong>제한시간</strong> 기본값은 60분입니다. 실제 거래와 학생 간 협의 시간이 필요하므로 60분 내외를 추천하며, 학급 플레이어 수에 맞게 조절하세요.</li><li><strong>종료와 점수</strong> 시간 안에 독점이 이루어지지 않으면 최고 자원 완성률에서 폭탄 1장당 15점을 감점하여 순위를 정합니다. 높은 점수를 얻으려면 폭탄이 없어야 합니다.</li><li><strong>현재 게임 규칙</strong> 설정 화면에 표시되는 카드 구성과 승리 조건을 확인하세요.</li></ul></li>
      </GuideSteps>}

      {slide === 2 && <GuideSteps>
        <li><b>학생 전광판을 TV에 띄워 주세요.</b><p>운영 페이지 상단의 <strong>학생 전광판 열기</strong>를 클릭합니다. 학생들은 타이머, 자원별 전체 카드 수, 거래소 이용 현황을 확인할 수 있습니다.</p></li>
        <li><b>학생 카드 확인 페이지를 안내해 주세요.</b><p>타이머 하단의 <strong>학생 카드 확인 페이지 열기</strong>를 눌러 학생들에게 안내해 주세요. 학생들은 이 링크로 들어가 자신의 카드 현황을 실시간으로 확인할 수 있습니다.</p></li>
        <li className="rule-step-wide"><b>학급 안에 자원 거래소를 설치하세요.</b><p><strong>거래소 주소 복사</strong> 또는 <strong>QR코드</strong>로 접속합니다. 크롬북·노트북은 주소 복사, 태블릿은 QR 스캔을 이용하면 편리합니다.</p><ul><li>거래소는 최대 3개까지 설치할 수 있습니다.</li><li>학생 간 자원이 비공개로 거래되도록 앞문·뒷문 앞 등 독립된 공간에 책상을 배치하는 것을 추천합니다.</li><li>가능하면 1인 1역으로 거래소 담당 학생을 배치해 기기 전달과 순서를 관리하도록 합니다.</li></ul></li>
      </GuideSteps>}

      {slide === 3 && <GuideSteps>
        <li><b>게임 시작 버튼을 클릭하세요.</b><p>타이머가 시작됩니다. 플레이어들은 끊임없이 대화하고 다른 친구들의 거래를 추론하여 자원을 독점해야 합니다.</p></li>
        <li><b>희망하는 학생은 거래소에서 1:1로 거래합니다.</b><p>한 대의 기기를 순차적으로 사용합니다. 자원 선택 화면을 상대방이나 다른 학생이 보지 않도록 사전에 지도해 주세요.</p></li>
        <li><b>서로 같은 장수의 자원을 교환합니다.</b><p>한 번에 거래할 수 있는 자원 수에는 제한이 없지만, 양쪽 플레이어가 반드시 같은 장수를 동시에 교환해야 합니다.</p></li>
        <li><b>교사 화면에서 자원 현황을 확인하세요.</b><p>거래 후 보유 자원은 교사 운영 페이지에 실시간으로 반영됩니다. 학생들에게 정보가 보이지 않도록 주의하세요.</p></li>
      </GuideSteps>}

      {slide === 4 && <GuideSteps>
        <li><b>독점 직전 알림을 확인하세요.</b><p>특정 자원이 모두 모이기 1~2장 전이면 교사 운영 페이지의 플레이어 카드가 초록색으로 강조됩니다.</p></li>
        <li><b>특정 자원이 독점되면 모든 거래가 종료됩니다.</b><p>타이머가 멈추고 거래소와 전광판에도 게임 종료 상태가 전달됩니다.</p></li>
        <li><b>자원을 독점한 플레이어가 우승합니다.</b><p>독점 발생 시 해당 플레이어는 점수와 관계없이 1위로 고정됩니다.</p></li>
        <li><b>결과와 게임 로그를 확인하세요.</b><p>결과 공개를 누른 뒤 결과 로그 복사하기를 선택하여 한셀이나 한글 문서에 붙여넣을 수 있습니다.</p></li>
        <li><b>독점 없이 종료되면 승점제로 순위를 정합니다.</b><p>가장 많이 모은 자원의 완성률을 반올림한 점수에서 폭탄 1장당 15점을 감점합니다.</p></li>
      </GuideSteps>}

      {slide === 5 && <div className="rules-video-note"><span aria-hidden="true">▶</span><p>자세한 게임 방법은 유튜브에서<br /><b>‘지니어스 게임 독점게임 규칙’</b>으로 검색해 보세요.</p><small>실제 지니어스 게임의 규칙 영상을 학생들에게 보여 준 뒤 게임을 진행해도 좋습니다.</small><Link className="action-link primary" to="/intro">학습 인트로 시작</Link></div>}
    </section>
    <nav className="rules-slide-navigation" aria-label="게임 설명 슬라이드 이동"><button disabled={slide === 0} onClick={() => go(slide - 1)}>← 이전</button><div>{slideMeta.map((_, index) => <button key={index} className={index === slide ? 'active' : ''} aria-label={`${index + 1}번 설명`} onClick={() => go(index)} />)}</div>{slide < slideMeta.length - 1 ? <button className="primary" onClick={() => go(slide + 1)}>다음 →</button> : <Link className="rules-nav-link" to="/">메인화면</Link>}</nav>
  </main>
}
