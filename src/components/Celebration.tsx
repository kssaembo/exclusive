import type { CSSProperties } from 'react'

export function Celebration() {
  return <div className="celebration-stage" aria-hidden="true">
    <div className="celebration-rays" />
    <div className="firework-show">
      {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--i': index, '--column': index % 6, '--row': index % 3 } as CSSProperties} />)}
    </div>
    <div className="celebration-confetti">
      {Array.from({ length: 48 }, (_, index) => <i key={index} style={{ '--i': index, '--x': (index * 37) % 100, '--drift': (index % 9) - 4, '--speed': index % 5, '--delay': index % 12 } as CSSProperties} />)}
    </div>
    <div className="celebration-sweep" />
  </div>
}
