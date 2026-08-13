export type IntroChoice = { id: string; text: string }

export type IntroSlide = {
  id: number
  kind: 'mission' | 'multiple-choice' | 'conditions' | 'trade' | 'ox' | 'connection' | 'game-link' | 'finale'
  kicker?: string
  title: string
  prompt?: string
  choices?: IntroChoice[]
  correctAnswer?: string
  correctFeedback?: string
  incorrectFeedback?: string
}

export const introSlides: IntroSlide[] = [
  {
    id: 1,
    kind: 'mission',
    kicker: '6학년 사회 × 독점게임',
    title: '국가 간 무역은 왜 발생할까요?',
  },
  {
    id: 2,
    kind: 'multiple-choice',
    title: '왜 다른 나라에서 열대 과일을 수입할까요?',
    prompt: '우리나라가 열대 과일을 다른 나라에서 수입하는 가장 알맞은 까닭은 무엇일까요?',
    choices: [
      { id: '1', text: '우리나라에서는 모든 열대 과일의 생산이 금지되어 있기 때문이다.' },
      { id: '2', text: '나라마다 기후와 자연환경이 달라 생산하기 좋은 물건이 다르기 때문이다.' },
      { id: '3', text: '다른 나라에서 만든 물건은 언제나 더 싸기 때문이다.' },
      { id: '4', text: '우리나라에는 농업 기술이 없기 때문이다.' },
    ],
    correctAnswer: '2',
    correctFeedback: '맞았습니다! 나라마다 기후와 자연환경이 다르기 때문에 잘 생산할 수 있는 물건도 달라집니다.',
    incorrectFeedback: '다시 생각해 봅시다. 열대 과일은 따뜻한 기후에서 잘 자랍니다. 나라마다 생산에 유리한 자연환경이 다릅니다.',
  },
  {
    id: 3,
    kind: 'conditions',
    title: '모든 나라의 조건은 같지 않습니다',
  },
  {
    id: 4,
    kind: 'trade',
    title: '부족한 것은 얻고, 잘 생산한 것은 나눕니다',
  },
  {
    id: 5,
    kind: 'ox',
    title: '모든 물건을 직접 생산하는 것이 항상 유리할까요?',
    prompt: '모든 나라는 필요한 물건을 다른 나라와 거래하지 않고 모두 직접 생산하는 것이 언제나 더 유리하다.',
    choices: [{ id: 'O', text: 'O' }, { id: 'X', text: 'X' }],
    correctAnswer: 'X',
    correctFeedback: '정답입니다! 모든 나라가 모든 물건을 똑같이 잘 생산할 수는 없습니다. 자신에게 유리한 물건을 생산하고 다른 나라와 교환하면 필요한 것을 더 효과적으로 얻을 수 있습니다.',
    incorrectFeedback: '나라마다 자연환경, 자원, 노동력, 자본, 기술 수준이 다릅니다. 필요한 모든 물건을 한 나라에서 생산하는 것이 항상 유리한 것은 아닙니다.',
  },
  {
    id: 6,
    kind: 'connection',
    title: '두 나라는 어떻게 거래하면 좋을까요?',
    prompt: '두 나라 모두에게 도움이 될 가능성이 가장 높은 거래는 무엇일까요?',
    choices: [
      { id: '1', text: '초록 나라가 목재를 주고 강철 나라에서 철을 받는다.' },
      { id: '2', text: '초록 나라가 부족한 철을 강철 나라에 준다.' },
      { id: '3', text: '두 나라 모두 상대 나라와 절대 거래하지 않는다.' },
      { id: '4', text: '강철 나라가 필요하지 않은 철을 모두 버린다.' },
    ],
    correctAnswer: '1',
    correctFeedback: '맞았습니다! 서로 잘 생산할 수 있는 물건을 교환하면 부족한 자원을 얻고 경제적 이익을 얻을 수 있습니다.',
    incorrectFeedback: '두 나라가 풍부하게 생산하는 자원과 부족한 자원을 다시 비교해 보세요. 서로의 장점을 활용하는 거래가 필요합니다.',
  },
  {
    id: 7,
    kind: 'game-link',
    title: '이제 여러분이 하나의 나라가 됩니다',
  },
  {
    id: 8,
    kind: 'finale',
    title: '자원을 독점하라!',
  },
]

export const productionConditions = [
  ['☀', '자연환경·기후', '농작물이 자라는 기후와 지형이 달라요.'],
  ['◆', '천연자원', '석유, 철광석, 석탄 등의 양이 달라요.'],
  ['♟', '노동력', '일할 수 있는 사람과 숙련 정도가 달라요.'],
  ['₩', '자본', '생산 시설과 투자할 수 있는 자금이 달라요.'],
  ['⚙', '기술 수준', '물건을 만들고 가공하는 기술이 달라요.'],
] as const

export const gameConnections = [
  ['나라마다 생산 조건과 자원이 다름', '플레이어마다 처음 가진 자원 카드가 다름'],
  ['모든 자원을 혼자 마련하기 어려움', '원하는 자원을 처음부터 모두 가질 수 없음'],
  ['부족한 물건을 다른 나라에서 수입함', '다른 플레이어와 부족한 카드를 교환함'],
  ['잘 생산한 물건을 다른 나라에 수출함', '여유 있는 카드를 거래 조건으로 제시함'],
  ['무역으로 필요한 것을 얻음', '거래를 통해 자원 세트와 목표를 완성함'],
] as const
