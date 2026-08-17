import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { resourceIcon } from '../assets'
import { audioFiles, playEffect } from '../audio'
import { gameConnections, introSlides, productionConditions, type IntroSlide } from '../intro/introSlides'
import type { ResourceType } from '../types'

type AnswerState = Record<number, string>
type LearningIntroProps = { onComplete: () => void; replay?: boolean; className?: string }
const STORAGE_KEY = 'exclusive-learning-intro-progress-v1'
const missionResources: ResourceType[] = ['coal', 'iron', 'wood', 'water', 'oil', 'gold', 'rice', 'diamond']

function readProgress(replay: boolean) {
  if (replay) return { current: 0, answers: {} as AnswerState }
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as { current?: number; answers?: AnswerState }
    return { current: Math.max(0, Math.min(7, parsed.current ?? 0)), answers: parsed.answers ?? {} }
  } catch { return { current: 0, answers: {} as AnswerState } }
}

function MultipleChoiceQuiz({ slide, answer, onAnswer, onReset }: { slide: IntroSlide; answer?: string; onAnswer: (value: string) => void; onReset: () => void }) {
  const answered = !!answer
  const correct = answer === slide.correctAnswer
  return <div className="intro-quiz">
    <p className="intro-question">{slide.prompt}</p>
    <div className={`intro-choices ${slide.kind === 'ox' ? 'ox' : ''}`}>
      {slide.choices?.map((choice) => {
        const isSelected = answer === choice.id
        const isCorrect = answered && choice.id === slide.correctAnswer
        const isWrong = answered && isSelected && !isCorrect
        return <button key={choice.id} data-click-sound="off" disabled={answered} onClick={() => onAnswer(choice.id)} className={`${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}>
          <b>{choice.id}</b><span>{choice.text}</span>{isCorrect && slide.kind !== 'ox' && <i aria-label="정답">✓</i>}{isWrong && <i aria-label="오답">×</i>}
        </button>
      })}
    </div>
    {answered && <div className={`intro-feedback ${correct ? 'correct' : 'wrong'}`} role="status"><b>{correct ? slide.kind === 'ox' ? '정답' : '✓ 정답' : '× 다시 확인'}</b><p>{correct ? slide.correctFeedback : slide.incorrectFeedback}</p><button onClick={onReset}>↻ 다시 풀기</button></div>}
  </div>
}

function IntroSlideContent({ slide, answer, onAnswer, onReset }: { slide: IntroSlide; answer?: string; onAnswer: (value: string) => void; onReset: () => void }) {
  if (slide.kind === 'mission') return <div className="intro-mission">
    <div className="resource-orbit" aria-hidden="true"><div className="globe">↔</div>{missionResources.map((type, index) => <img key={type} src={resourceIcon(type)} alt="" style={{ '--orbit-index': index } as CSSProperties} />)}</div>
    <p>오늘 여러분은 하나의 나라가 되어<br />필요한 자원을 얻기 위해 다른 나라와 거래합니다.</p>
    <strong>수업에서 배운 무역의 원리를 게임에서 직접 확인해 봅시다.</strong>
  </div>

  if (slide.kind === 'multiple-choice' || slide.kind === 'ox') return <MultipleChoiceQuiz slide={slide} answer={answer} onAnswer={onAnswer} onReset={onReset} />

  if (slide.kind === 'conditions') return <div className="intro-conditions">
    <p>나라마다 가지고 있는 조건이 다르기 때문에<br /><b>잘 생산할 수 있는 물건과 서비스</b>도 달라집니다.</p>
    <div>{productionConditions.map(([icon, title, detail]) => <article key={title}><i>{icon}</i><h3>{title}</h3><span>{detail}</span></article>)}</div>
    <strong>생산 조건의 차이 <i>→</i> 잘 생산하는 물건과 서비스의 차이</strong>
  </div>

  if (slide.kind === 'trade') return <div className="intro-trade-example">
    <div className="country-card green"><span>가 나라</span><h3>나무가 풍부한 나라</h3><ul><li>목재를 잘 생산함</li><li>철이 부족함</li></ul><img src={resourceIcon('wood')} alt="목재" /></div>
    <div className="trade-arrows"><b>목재 →</b><span>무역</span><b>← 철</b></div>
    <div className="country-card steel"><span>나 나라</span><h3>철광석이 풍부한 나라</h3><ul><li>철을 잘 생산함</li><li>나무가 부족함</li></ul><img src={resourceIcon('iron')} alt="철" /></div>
    <p>각 나라가 생산한 물건이나 서비스를<br />다른 나라와 주고받는 것을 <b>무역</b>이라고 합니다.</p>
    <div className="trade-terms"><span><b>수출</b> 우리나라의 물건이나 서비스를 다른 나라에 파는 것</span><span><b>수입</b> 다른 나라의 물건이나 서비스를 사 오는 것</span></div>
    <strong>무역을 통해 두 나라는 서로 부족한 것을 얻을 수 있습니다.</strong>
  </div>

  if (slide.kind === 'connection') return <div className="intro-scenario">
    <div className="scenario-summary"><span><img src={resourceIcon('wood')} alt="" /><b>초록 나라</b>숲이 많아 목재가 풍부하지만 철이 부족합니다.</span><i>↔</i><span><img src={resourceIcon('iron')} alt="" /><b>강철 나라</b>철광석과 금속 가공 기술이 뛰어나지만 목재가 부족합니다.</span></div>
    <MultipleChoiceQuiz slide={slide} answer={answer} onAnswer={onAnswer} onReset={onReset} />
    {answer === slide.correctAnswer && <strong className="scenario-emphasis">무역은 서로의 차이를 이용해 필요한 것을 얻는 경제 활동입니다.</strong>}
  </div>

  if (slide.kind === 'game-link') return <div className="intro-game-link">
    <div className="connection-table" role="table" aria-label="사회 시간과 독점게임 연결"><div role="row"><b role="columnheader">사회 시간에 배운 내용</b><b role="columnheader">독점게임에서 경험할 내용</b></div>{gameConnections.map(([lesson, game]) => <div role="row" key={lesson}><span role="cell">{lesson}</span><i aria-hidden="true">→</i><span role="cell">{game}</span></div>)}</div>
    <strong>나에게는 남는 자원이<br />다른 플레이어에게는 꼭 필요한 자원일 수 있습니다.</strong>
    <p className="intro-caution">게임의 ‘독점’은 재미와 경쟁을 위한 승리 조건입니다.<br />현실의 무역에서는 서로 동의한 거래와 상호 이익이 중요합니다.</p>
  </div>

  return <div className="intro-finale"><h3>자원을 독점하라!</h3><p>부족한 것은 거래하고<br /><b>필요한 자원을 확보하라!</b></p><p>끊임없이 대화하고<br />어떤 자원들이 어떻게 분배되어 있는지<br /><b>고민하고 확인하라!</b></p><strong>이제... 자원을 독점할 시간이다.</strong></div>
}

export function LearningIntro({ onComplete, replay = false, className = '' }: LearningIntroProps) {
  const initial = useMemo(() => readProgress(replay), [replay])
  const [current, setCurrent] = useState(initial.current)
  const [answers, setAnswers] = useState<AnswerState>(initial.answers)
  const [skipOpen, setSkipOpen] = useState(false)
  const [direction, setDirection] = useState<'next' | 'previous'>('next')
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const slide = introSlides[current]
  const answerRequired = slide.kind === 'multiple-choice' || slide.kind === 'ox' || slide.kind === 'connection'
  const canGoNext = !answerRequired || !!answers[slide.id]

  useEffect(() => {
    if (!replay) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ current, answers }))
  }, [current, answers, replay])

  const go = useCallback((next: number) => {
    const target = Math.max(0, Math.min(introSlides.length - 1, next))
    if (target > current && !canGoNext) return
    if (target !== current) playEffect(audioFiles.introNavigate, .34)
    setDirection(target >= current ? 'next' : 'previous'); setCurrent(target)
  }, [current, canGoNext])

  const finish = useCallback(() => {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    if (!replay) { sessionStorage.setItem('exclusive-learning-intro-completed', 'true'); sessionStorage.removeItem(STORAGE_KEY) }
    onComplete()
  }, [onComplete, replay])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (skipOpen) return
      if (event.key === 'ArrowLeft') go(current - 1)
      if ((event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        if (current === 7) finish(); else go(current + 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [current, finish, go, skipOpen])

  return <section className={`learning-intro ${className}`} aria-label="국가 간 무역 학습 인트로">
    <header><div><span>더 지니어스 한 학급 놀이</span><i>×</i><b>독점게임</b></div><div><strong>{current + 1} / {introSlides.length}</strong><button onClick={() => setSkipOpen(true)}>인트로 건너뛰기</button></div></header>
    <main key={slide.id} className={`intro-slide slide-${slide.id} move-${direction}`}>
      {slide.kicker && <p className="intro-kicker">{slide.kicker}</p>}
      <h1>{slide.title}</h1>
    <IntroSlideContent slide={slide} answer={answers[slide.id]} onAnswer={(value) => {
      if (answers[slide.id]) return
      playEffect(value === slide.correctAnswer ? audioFiles.introCorrect : audioFiles.introWrong, value === slide.correctAnswer ? .58 : .48)
      setAnswers((currentAnswers) => ({ ...currentAnswers, [slide.id]: value }))
    }} onReset={() => setAnswers((currentAnswers) => { const next = { ...currentAnswers }; delete next[slide.id]; return next })} />
    </main>
    <footer><button data-click-sound="off" className="intro-nav previous" disabled={current === 0} onClick={() => go(current - 1)}>← 이전</button><div className="intro-progress" aria-label={`전체 8장 중 ${current + 1}장`}>{introSlides.map((item, index) => <button data-click-sound="off" key={item.id} aria-label={`${item.id}번 슬라이드`} className={index === current ? 'active' : index < current ? 'visited' : ''} onClick={() => go(index)} />)}</div>{current === 7 ? <button className="intro-start-game" disabled={starting} onClick={finish}>{replay ? '운영 화면으로 돌아가기' : '독점게임 시작'}</button> : <button data-click-sound="off" className="intro-nav next" disabled={!canGoNext} onClick={() => go(current + 1)}>{current === 0 ? '미션 확인' : '다음'} →</button>}</footer>
    {skipOpen && <div className="modal-backdrop intro-skip-backdrop" role="dialog" aria-modal="true" aria-labelledby="skip-intro-title"><div className="skip-intro-dialog"><span>LEARNING INTRO</span><h2 id="skip-intro-title">학습 인트로를 건너뛰고<br />바로 게임을 시작할까요?</h2><p>수업에서 배운 무역의 원리를 3~4분 동안 간단히 복습할 수 있습니다.</p><div><button onClick={() => setSkipOpen(false)}>계속 보기</button><button className="primary" onClick={finish}>바로 게임 시작</button></div></div></div>}
  </section>
}
