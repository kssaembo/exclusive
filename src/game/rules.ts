import type { Card, Player, PlayerRanking, ResourceType } from '../types'

export const RESOURCE_RULES: ReadonlyArray<{ type: ResourceType; label: string; count: number }> = [
  { type: 'coal', label: '석탄', count: 8 }, { type: 'iron', label: '철', count: 8 }, { type: 'wood', label: '나무', count: 8 },
  { type: 'water', label: '물', count: 7 }, { type: 'oil', label: '석유', count: 7 }, { type: 'gold', label: '금', count: 7 },
  { type: 'rice', label: '쌀', count: 7 }, { type: 'diamond', label: '다이아몬드', count: 7 }, { type: 'bomb', label: '폭탄', count: 5 },
]
export const MONOPOLY_TYPES = RESOURCE_RULES.filter((rule) => rule.type !== 'bomb')
export const MONOPOLY_RULES = RESOURCE_RULES
export function createDeck(): Card[] {
  let serial = 1
  return RESOURCE_RULES.flatMap((rule) => Array.from({ length: rule.count }, () => ({ id: `CARD-${String(serial++).padStart(4, '0')}`, type: rule.type, label: rule.label })))
}
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) { const target = Math.floor(random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]] }
  return result
}
export function buildRankings(players: Player[], bombPenalty: number): PlayerRanking[] {
  const rows = players.map((player) => {
    const counts = new Map<ResourceType, number>(); player.cards.forEach((card) => counts.set(card.type, (counts.get(card.type) ?? 0) + 1))
    const best = MONOPOLY_TYPES.map((rule) => ({ ...rule, owned: counts.get(rule.type) ?? 0 })).sort((a, b) => (b.owned / b.count) - (a.owned / a.count) || b.owned - a.owned)[0]
    const bombCount = counts.get('bomb') ?? 0; const completionRate = best.owned / best.count
    return { playerId: player.id, targetType: best.type, targetLabel: best.label, targetCount: best.owned, requiredCount: best.count, completionRate, bombCount, score: Math.round(completionRate * 100) - bombCount * bombPenalty }
  }).sort((a, b) => b.score - a.score || b.completionRate - a.completionRate || a.bombCount - b.bombCount)
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}
