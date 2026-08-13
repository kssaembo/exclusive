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
  if (localStorage.getItem('exclusive-audio-enabled') === 'false') return
  const base = effectPool.get(src) ?? new Audio(src)
  effectPool.set(src, base)
  const audio = base.paused ? base : base.cloneNode(true) as HTMLAudioElement
  audio.volume = volume
  audio.currentTime = 0
  void audio.play().catch(() => undefined)
}

export function BackgroundAudio({ src, volume = .28, label = '배경음악' }: { src: string | null; volume?: number; label?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(() => localStorage.getItem('exclusive-audio-enabled') !== 'false')
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause(); setPlaying(false)
    if (!src || !enabled) return
    audio.src = src; audio.loop = true; audio.volume = volume
    const start = () => void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    start()
    window.addEventListener('pointerdown', start, { once: true })
    return () => { window.removeEventListener('pointerdown', start); audio.pause() }
  }, [src, enabled, volume])

  const toggle = () => {
    const next = !enabled
    setEnabled(next); localStorage.setItem('exclusive-audio-enabled', String(next))
  }

  return <><audio ref={audioRef} preload="auto" /><button className={`audio-toggle ${enabled ? 'on' : ''}`} onClick={toggle} aria-label={`${label} ${enabled ? '끄기' : '켜기'}`}>{enabled ? playing ? '🔊' : '♪' : '🔇'} <span>{enabled ? label : '음향 꺼짐'}</span></button></>
}
