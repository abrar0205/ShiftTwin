import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { generatePlant } from '../sim/plant'
import type { Shift, SimResult } from '../sim/types'
import { useTwinStore } from '../state/store'
import { GlassPanel, SectionHeading } from './ui'

const FactoryFloorScene = lazy(() => import('./FactoryFloorScene'))

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    )
  } catch {
    return false
  }
}

function statusForRisk(risk: number) {
  if (risk >= 20) return 'risk'
  if (risk >= 5) return 'watch'
  return 'ready'
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // WebGL and GPU failures should degrade to the analytical view.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function FloorFallback({ result, shift, seed }: { result: SimResult; shift: Shift; seed: number }) {
  const plant = useMemo(() => generatePlant(seed), [seed])
  const risks = useMemo(
    () => new Map(result.stationRisks.filter(r => r.shift === shift).map(r => [r.stationId, r])),
    [result, shift],
  )

  return <GlassPanel className="factory-fallback">
    <div className="factory-fallback-head">
      <span>2D FALLBACK</span>
      <strong>WebGL unavailable · analytical station view active</strong>
    </div>
    <div className="factory-fallback-line">
      {plant.stations.map((station, index) => {
        const risk = risks.get(station.id)
        const tone = statusForRisk(risk?.uncoveredProbability ?? 0)
        return <div className="fallback-cell" key={station.id}>
          <span className={tone}>{index + 1}</span>
          <strong>{station.name}</strong>
          <small>{tone === 'risk' ? 'constraint' : tone === 'watch' ? 'watch' : 'resilient'}</small>
        </div>
      })}
    </div>
  </GlassPanel>
}

export function FactoryFloorSection({ result, reducedMotion }: { result: SimResult; reducedMotion: boolean }) {
  const { seed } = useTwinStore()
  const container = useRef<HTMLDivElement>(null)
  const weakestShift = useMemo(
    () => [...result.shiftResults].sort((a,b) => a.coverageProbability - b.coverageProbability)[0]?.shift ?? 'Early',
    [result],
  )
  const [shift, setShift] = useState<Shift>(weakestShift)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [onscreen, setOnscreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')

  useEffect(() => setWebgl(webglAvailable()), [])

  useEffect(() => {
    const node = container.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => setOnscreen(entries[0]?.isIntersecting ?? true),
      { rootMargin: '180px 0px', threshold: 0.02 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const fallback = <FloorFallback result={result} shift={shift} seed={seed} />

  return <section id="floor" className="content-section factory-section" ref={container}>
    <div className="factory-heading-row">
      <SectionHeading
        eyebrow="THE FLOOR, RIGHT NOW"
        title="A factory view that earns every status light."
        body="Phase 1 establishes the spatial digital-twin shell. Andon state is already tied to simulated station risk; worker presence, line rate and queue motion remain intentionally static until representative-trial data is added."
      />
      <div className="shift-selector" role="group" aria-label="Factory lighting shift">
        {(['Early','Late','Night'] as Shift[]).map(value =>
          <button
            type="button"
            key={value}
            className={shift === value ? 'active' : ''}
            aria-pressed={shift === value}
            onClick={() => setShift(value)}
          >{value}</button>
        )}
      </div>
    </div>

    <div className="factory-shell">
      <div className="factory-shell-hud">
        <span>SHIFT</span><strong>{shift}</strong>
        <i/>
        <span>PLANT SEED</span><strong>{seed}</strong>
        <i/>
        <span>VIEW</span><strong>{reducedMotion ? 'STATIC' : onscreen && tabVisible ? 'ACTIVE' : 'PAUSED'}</strong>
      </div>

      {webgl === false ? fallback : webgl === null ? <div className="factory-loading">
        <span>CHECKING GRAPHICS CAPABILITY</span><i/>
      </div> : <SceneBoundary fallback={fallback}>
        <Suspense fallback={<div className="factory-loading"><span>LOADING LIVING FACTORY</span><i/></div>}>
          <FactoryFloorScene
            result={result}
            shift={shift}
            seed={seed}
            active={onscreen && tabVisible}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </SceneBoundary>}
    </div>

    <div className="factory-caption">
      <span><b className="ready"/> green · resilient</span>
      <span><b className="watch"/> amber · watch</span>
      <span><b className="risk"/> red · constraint</span>
      <p>Phase 1 status mapping uses station uncover probability from the simulation. No decorative car or worker motion is enabled yet.</p>
    </div>
  </section>
}
