import type { GameState } from '../types'

export function TeamGrid({ state, compact = false }: { state: GameState; compact?: boolean }) {
  return (
    <div className={`team-grid ${compact ? 'compact' : ''}`}>
      {state.teams.map((team) => (
        <article className={`team-card ${state.lockedTeamIds.includes(team.id) ? 'locked' : ''}`} key={team.id}>
          <header><strong>{team.name}</strong><span>v{team.version}</span></header>
          <div className="card-chips">{team.cards.map((card) => <span key={card.id}>{card.label}</span>)}</div>
          {state.lockedTeamIds.includes(team.id) && <div className="lock-label">거래 중</div>}
        </article>
      ))}
    </div>
  )
}
