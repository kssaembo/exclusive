import type { GameState } from '../types'

const TEAM_NAMES = ['빨강팀', '주황팀', '노랑팀', '초록팀', '파랑팀', '남색팀', '보라팀', '흰색팀']

export function createInitialState(): GameState {
  return {
    version: 1,
    teams: TEAM_NAMES.map((name, teamIndex) => ({
      id: `team-${teamIndex + 1}`,
      name,
      version: 1,
      cards: Array.from({ length: 4 }, (_, cardIndex) => ({
        id: `card-${teamIndex + 1}-${cardIndex + 1}`,
        label: `${String.fromCharCode(65 + teamIndex)}${cardIndex + 1}`,
      })),
    })),
    lockedTeamIds: [],
    updatedAt: Date.now(),
  }
}
