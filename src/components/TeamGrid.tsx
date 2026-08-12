import type { GameState, PublicGameState } from '../types'

export function TeamGrid({ state, revealCards = false }: { state: GameState | PublicGameState; revealCards?: boolean }) {
  if ('settings' in state) {
    return <div className="team-grid">{state.players.map((player) => {
      const locked = state.lockedPlayerIds.includes(player.id)
      return <article className={`team-card ${locked ? 'locked' : ''}`} key={player.id}>
        <header><strong>{player.name}</strong><span>v{player.version} · {player.cards.length}장</span></header>
        <div className="credential">인증코드 <b>{player.accessCode}</b></div>
        {revealCards && <div className="card-chips">{player.cards.map((card) => <span title={card.id} key={card.id}>{card.label}</span>)}</div>}
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
