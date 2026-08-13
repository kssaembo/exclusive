import type { GameState, PublicGameState, ResourceType } from '../types'
import { resourceIcon } from '../assets'

export function TeamGrid({ state, revealCards = false }: { state: GameState | PublicGameState; revealCards?: boolean }) {
  if ('lockedPlayerIds' in state) {
    return <div className="team-grid">{state.players.map((player) => {
      const locked = state.lockedPlayerIds.includes(player.id)
      const counts = new Map<ResourceType, number>()
      player.cards.forEach((card) => counts.set(card.type, (counts.get(card.type) ?? 0) + 1))
      const remaining = Math.min(...state.settings.deckRules.map((rule) => rule.count - (counts.get(rule.type) ?? 0)))
      const monopoly = state.winnerPlayerId === player.id && state.endReason === 'monopoly'
      const nearMonopoly = !monopoly && remaining > 0 && remaining <= 2
      return <article className={`team-card ${locked ? 'locked' : ''} ${nearMonopoly ? 'near-monopoly' : ''} ${monopoly ? 'monopoly' : ''}`} key={player.id}>
        <header><strong>{player.name}</strong><span>v{player.version} · {player.cards.length}장</span></header>
        {revealCards && <div className="card-chips">{player.cards.map((card) => <span title={card.label} key={card.id}><img src={resourceIcon(card.type)} alt="" />{card.label}</span>)}</div>}
        {nearMonopoly && <div className="near-label">독점까지 {remaining}장</div>}
        {monopoly && <div className="monopoly-label">독점</div>}
        {locked && <div className="lock-label">거래 중</div>}
      </article>
    })}</div>
  }
  return <div className="team-grid">{state.players.map((player) => <article className={`team-card ${player.locked ? 'locked' : ''}`} key={player.id}>
    <header><strong>{player.name}</strong><span>v{player.version} · {player.cardCount}장</span></header>
    <div className="muted">비공개 카드</div>
    {player.locked && <div className="lock-label">거래 중</div>}
  </article>)}</div>
}
