import type { Card, DeckRule, Player, PlayerRanking, ResourceType } from '../types'

export const RESOURCE_CATALOG: ReadonlyArray<{ type: Exclude<ResourceType, 'bomb'>; label: string }> = [
  { type: 'coal', label: '석탄' }, { type: 'iron', label: '철' }, { type: 'wood', label: '나무' },
  { type: 'water', label: '물' }, { type: 'oil', label: '석유' }, { type: 'gold', label: '금' },
  { type: 'rice', label: '쌀' }, { type: 'diamond', label: '다이아몬드' }, { type: 'copper', label: '구리' },
  { type: 'silver', label: '은' }, { type: 'wheat', label: '밀' }, { type: 'corn', label: '옥수수' },
  { type: 'gas', label: '천연가스' }, { type: 'ruby', label: '루비' }, { type: 'sapphire', label: '사파이어' },
]

export function getDeckRules(playerCount: number): DeckRule[] {
  const count = Math.max(6, Math.min(15, Math.round(playerCount)))
  const bombCount = Math.round(count * 5 / 8)
  const eightCardResources = count - bombCount
  const resources: DeckRule[] = RESOURCE_CATALOG.slice(0, count).map((resource, index) => ({ ...resource, count: index < eightCardResources ? 8 : 7 }))
  return [...resources, { type: 'bomb', label: '폭탄', count: bombCount }]
}

export const RESOURCE_RULES = getDeckRules(8)
export const MONOPOLY_RULES = RESOURCE_RULES
export function createDeck(rules: readonly DeckRule[] = RESOURCE_RULES): Card[] {
  let serial = 1
  return rules.flatMap((rule) => Array.from({ length: rule.count }, () => ({ id: `CARD-${String(serial++).padStart(4, '0')}`, type: rule.type, label: rule.label })))
}
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) { const target = Math.floor(random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]] }
  return result
}
export function buildRankings(players: Player[], bombPenalty: number, deckRules: readonly DeckRule[] = RESOURCE_RULES): PlayerRanking[] {
  const monopolyTypes = deckRules.filter((rule) => rule.type !== 'bomb')
  const rows = players.map((player) => {
    const counts = new Map<ResourceType, number>(); player.cards.forEach((card) => counts.set(card.type, (counts.get(card.type) ?? 0) + 1))
    const best = monopolyTypes.map((rule) => ({ ...rule, owned: counts.get(rule.type) ?? 0 })).sort((a, b) => (b.owned / b.count) - (a.owned / a.count) || b.owned - a.owned)[0]
    const bombCount = counts.get('bomb') ?? 0; const completionRate = best.owned / best.count
    return { playerId: player.id, targetType: best.type, targetLabel: best.label, targetCount: best.owned, requiredCount: best.count, completionRate, bombCount, score: Math.round(completionRate * 100) - bombCount * bombPenalty }
  }).sort((a, b) => b.score - a.score || b.completionRate - a.completionRate || a.bombCount - b.bombCount)
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}
