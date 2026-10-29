import { useEffect, useRef, useState, type ReactNode } from 'react'

export type IconName = 'play' | 'spark' | 'method' | 'github' | 'arrow' | 'lock' | 'shield' | 'reset' | 'check' | 'alert' | 'clock' | 'training' | 'swap' | 'activity' | 'skip'

const PATHS: Record<IconName, ReactNode> = {
  play: <path d="m9 7 8 5-8 5V7Z" />,
  spark: <><path d="m12 3-1.8 4.2L6 9l4.2 1.8L12 15l1.8-4.2L18 9l-4.2-1.8L12 3Z"/><path d="m5 14-.8 2-2.2.9 2.2.9.8 2.2.9-2.2 2.1-.9-2.1-.9L5 14Z"/></>,
  method: <><path d="M4 19.5V6.4A2.4 2.4 0 0 1 6.4 4H20v14H6.5A2.5 2.5 0 0 0 4 20.5"/><path d="M8 8h8M8 12h6"/></>,
  github: <><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 2a13.4 13.4 0 0 0-7 0C4.8.1 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4"/><path d="M8 19c-3 .9-3-1.5-4-2"/></>,
  arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  training: <><path d="m3 10 9-5 9 5-9 5-9-5Z"/><path d="M7 13.2V17c3 2 7 2 10 0v-3.8"/></>,
  swap: <><path d="M7 7h11l-3-3M17 17H6l3 3"/></>,
  activity: <path d="M3 12h4l2-6 4 12 2-6h6"/>,
  skip: <><path d="m5 5 8 7-8 7V5Z"/><path d="M18 5v14"/></>,
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
}

export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass ${className}`}>{children}</div>
}

export function StatusPill({ value }: { value: number }) {
  const status = value >= 90 ? 'READY' : value >= 75 ? 'WATCH' : 'AT RISK'
  const tone = value >= 90 ? 'ready' : value >= 75 ? 'watch' : 'risk'
  return <span className={`status-pill ${tone}`}><span aria-hidden="true">{tone === 'ready' ? '●' : tone === 'watch' ? '◆' : '▲'}</span>{status}</span>
}

export function AnimatedNumber({ value, decimals = 0, reducedMotion = false, suffix = '' }: { value: number; decimals?: number; reducedMotion?: boolean; suffix?: string }) {
  const [display, setDisplay] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value)
      from.current = value
      return
    }
    const startValue = from.current
    const started = performance.now()
    const duration = 850
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      const v = startValue + (value - startValue) * eased
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reducedMotion])

  return <>{display.toFixed(decimals)}{suffix}</>
}

export function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return <div className="section-heading">
    <span>{eyebrow}</span>
    <h2>{title}</h2>
    {body && <p>{body}</p>}
  </div>
}

export const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—'
