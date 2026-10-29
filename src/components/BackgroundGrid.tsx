import { useEffect, useRef } from 'react'

export function BackgroundGrid({ risk = 0, reducedMotion = false }: { risk?: number; reducedMotion?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let hidden = document.hidden
    let offset = 0

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.floor(innerWidth * dpr)
      canvas.height = Math.floor(innerHeight * dpr)
      canvas.style.width = `${innerWidth}px`
      canvas.style.height = `${innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const onVisibility = () => { hidden = document.hidden }

    const draw = () => {
      if (!hidden) {
        ctx.clearRect(0, 0, innerWidth, innerHeight)
        const gap = 38
        const drift = reducedMotion ? 0 : offset
        for (let y = -gap; y < innerHeight + gap; y += gap) {
          for (let x = -gap; x < innerWidth + gap; x += gap) {
            const px = x + drift
            const py = y + drift * 0.35
            const rightBias = Math.max(0, (px - innerWidth * 0.58) / Math.max(1, innerWidth * 0.42))
            const riskGlow = Math.min(1, risk / 35) * rightBias
            ctx.fillStyle = riskGlow > .2 ? `rgba(255,93,93,${0.025 + riskGlow * .035})` : 'rgba(180,198,214,.035)'
            ctx.beginPath()
            ctx.arc(px, py, riskGlow > .3 ? 1.25 : .85, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        if (!reducedMotion) offset = (offset + 0.025) % gap
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [risk, reducedMotion])

  return <canvas ref={ref} className="background-grid" aria-hidden="true" />
}
