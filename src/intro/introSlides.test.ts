import { describe, expect, it } from 'vitest'
import { gameConnections, introSlides, productionConditions } from './introSlides'

describe('국가 간 무역 학습 인트로', () => {
  it('8장의 슬라이드를 순서대로 제공한다', () => {
    expect(introSlides).toHaveLength(8)
    expect(introSlides.map((slide) => slide.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('객관식과 OX 문제의 정답을 정확하게 정의한다', () => {
    expect(introSlides.find((slide) => slide.id === 2)?.correctAnswer).toBe('2')
    expect(introSlides.find((slide) => slide.id === 5)?.correctAnswer).toBe('X')
    expect(introSlides.find((slide) => slide.id === 6)?.correctAnswer).toBe('1')
  })

  it('모든 문제에 정답·오답 피드백과 유효한 선택지가 있다', () => {
    const quizzes = introSlides.filter((slide) => slide.correctAnswer)
    expect(quizzes).toHaveLength(3)
    for (const quiz of quizzes) {
      expect(quiz.choices?.some((choice) => choice.id === quiz.correctAnswer)).toBe(true)
      expect(quiz.correctFeedback?.length).toBeGreaterThan(20)
      expect(quiz.incorrectFeedback?.length).toBeGreaterThan(20)
    }
  })

  it('생산 조건 5가지와 게임 연결 사례 5가지를 포함한다', () => {
    expect(productionConditions.map((item) => item[1])).toEqual(['자연환경·기후', '천연자원', '노동력', '자본', '기술 수준'])
    expect(gameConnections).toHaveLength(5)
  })
})
