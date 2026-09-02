import type { ResourceType } from './types'

const imageRoot = '/assets/images'

export const images = {
  backgrounds: {
    home: `${imageRoot}/backgrounds/bg-home.webp`,
    setup: `${imageRoot}/backgrounds/bg-setup.webp`,
    host: `${imageRoot}/backgrounds/bg-host.webp`,
    station: `${imageRoot}/backgrounds/bg-station.webp`,
    board: `${imageRoot}/backgrounds/bg-board.webp`,
    results: `${imageRoot}/backgrounds/bg-results.webp`,
  },
  cards: {
    resource: `${imageRoot}/cards/card-frame-resource.png`,
    bomb: `${imageRoot}/cards/card-frame-bomb.png`,
    back: `${imageRoot}/cards/card-back.png`,
  },
  ui: {
    rank: `${imageRoot}/ui/badge-rank-default.png`,
    station: `${imageRoot}/ui/badge-station.png`,
    qrFrame: `${imageRoot}/ui/frame-room-qr.png`,
    resultsPanel: `${imageRoot}/ui/panel-results.png`,
    monopoly: `${imageRoot}/ui/symbol-monopoly.png`,
  },
} as const

export const resourceIcon = (type: ResourceType) => `${imageRoot}/resources/resource-${type}.png`
