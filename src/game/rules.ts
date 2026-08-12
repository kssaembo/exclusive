import type { Card, ResourceType } from '../types'

export const RESOURCE_RULES: ReadonlyArray<{ type: ResourceType; label: string; count: number }> = [
  { type: 'coal', label: '석탄', count: 8 }, { type: 'iron', label: '철', count: 8 },
  { type: 'wood', label: '나무', count: 8 }, { type: 'water', label: '물', count: 7 },
  { type: 'oil', label: '석유', count: 7 }, { type: 'gold', label: '금', count: 7 },
  { type: 'rice', label: '쌀', count: 7 }, { type: 'diamond', label: '다이아', count: 7 },
  { type: 'bomb', label: '폭탄', count: 5 },
]

export const MONOPOLY_TYPES = RESOURCE_RULES.filter((rule) => rule.type !== 'bomb') as ReadonlyArray<{
  type: Exclude<ResourceType, 'bomb'>; label: string; count: number
}>

export function createDeck(): Card[] {
  let serial = 1
  return RESOURCE_RULES.flatMap((rule) => Array.from({ length: rule.count }, () => ({
    id: `CARD-${String(serial++).padStart(4, '0')}`, type: rule.type, label: rule.label,
  })))
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}
