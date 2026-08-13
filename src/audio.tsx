import { useEffect, useRef, useState } from 'react'

export const audioFiles = {
  lobby: '/assets/audio/bgm-lobby.mp3',
  market: '/assets/audio/bgm-market.mp3',
  results: '/assets/audio/bgm-results.mp3',
  cardSelect: '/assets/audio/sfx-card-select.wav',
  error: '/assets/audio/sfx-error.wav',
  firework: '/assets/audio/sfx-firework.wav',
  monopoly: '/assets/audio/sfx-monopoly-alert.wav',
  playerConfirm: '/assets/audio/sfx-player-confirm.wav',
  resultsReveal: '/assets/audio/sfx-results-reveal.wav',
  tradeSuccess: '/assets/audio/sfx-trade-success.wav',
} as const

const effectPool = new Map<string, HTMLAudioElement>()

export function playEffect(src: string, volume = .65) {
  const base = effectPool.get(src) ?? new Audio(src)
  effectPool.set(src, base)
  const audio = base.paused ? base : base.cloneNode(true) as HTMLAudioElement
  audio.volume = volume
  audio.currentTime = 0
  void audio.play().catch(() => undefined)
}

export function BackgroundAudio({ src, volume = .28, label = 'BGM' }: { src: string | null; volume?: number; label?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [level, setLevel] = useState(() => {
    const saved = Number(localStorage.getItem('exclusive-bgm-volume'))
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : volume
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause(); setPlaying(false)
    if (!src) return
    audio.src = src; audio.loop = true; audio.volume = level
    const start = () => void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    start()
    const resumeAfterAutoplayBlock = () => { if (audio.paused) start() }
    window.addEventListener('pointerdown', resumeAfterAutoplayBlock, { once: true })
    return () => { window.removeEventListener('pointerdown', resumeAfterAutoplayBlock); audio.pause() }
  }, [src])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = level
    localStorage.setItem('exclusive-bgm-volume', String(level))
  }, [level])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio || !src) return
    if (audio.paused) void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else { audio.pause(); setPlaying(false) }
  }

  return <div className={`audio-controls ${playing ? 'on' : ''}`}>
    <audio ref={audioRef} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    <button className="audio-play-toggle" onClick={toggle} disabled={!src} aria-label={`${label} ${playing ? '일시정지' : '재생'}`}>
      <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span><b>{playing ? '일시정지' : '재생'}</b>
    </button>
    <strong>{label}</strong>
    <label className="audio-volume"><span aria-hidden="true">🔊</span><span className="sr-only">음량</span><input type="range" min="0" max="1" step="0.05" value={level} onChange={(event) => setLevel(Number(event.target.value))} /></label>
  </div>
}
