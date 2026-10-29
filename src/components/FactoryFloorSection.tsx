import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { generatePlant } from '../sim/plant'
import type { Shift, SimResult, TrialStationState } from '../sim/types'
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

function toneForStation(station: TrialStationState) {
  return station.status === 'staffed' ? 'ready' : station.status === 'short' ? 'watch' : 'risk'
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
  const trial = result.representativeTrials[shift]
  const stationState = useMemo(() => new Map(trial.stations.map(s => [s.stationId, s])), [trial])

  return <GlassPanel className="factory-fallback">
    <div className="factory-fallback-head">
      <span>2D FALLBACK · TRIAL #{trial.trialIndex}</span>
      <strong>{trial.lineRateJPH.toFixed(1)} JPH · {trial.carsLostPerShift.toFixed(1)} cars lost / shift</strong>
    </div>
    <div className="factory-fallback-line">
      {plant.stations.map((station, index) => {
        const state = stationState.get(station.id)!
        const tone = toneForStation(state)
        return <div className="fallback-cell" key={station.id}>
          <span className={tone}>{index + 1}</span>
          <strong>{station.name}</strong>
          <small>{state.assigned}/{state.required} assigned · {(state.throughputFactor*100).toFixed(0)}% throughput</small>
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
  useEffect(() => setShift(weakestShift), [weakestShift, result])

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

  const trial = result.representativeTrials[shift]
  const fallback = <FloorFallback result={result} shift={shift} seed={seed} />

  return <section id="floor" className="content-section factory-section" ref={container}>
    <div className="factory-heading-row">
      <SectionHeading
        eyebrow="THE FLOOR, RIGHT NOW"
        title="One real simulated shift, rendered as a factory."
        body="This view uses a representative Monte Carlo trial closest to the median staffing shortfall. Worker positions, andons and throughput are model outputs—not decorative states."
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
      <div className="factory-shell-hud factory-operating-hud">
        <div><span>LINE RATE</span><strong>{trial.lineRateJPH.toFixed(1)} JPH</strong><small>target {trial.targetLineRateJPH.toFixed(1)}</small></div>
        <i/>
        <div><span>CARS LOST</span><strong>{trial.carsLostPerShift.toFixed(1)}</strong><small>{trial.shiftHours}h shift</small></div>
        <i/>
        <div><span>SHIFT</span><strong>{shift}</strong><small>{trial.fullCoverage ? 'full coverage' : `${trial.shortfall} positions short`}</small></div>
        <i/>
        <div><span>REPRESENTATIVE TRIAL</span><strong>#{trial.trialIndex}</strong><small>of {trial.sampleCount.toLocaleString()}</small></div>
        <i/>
        <div className="hud-compact"><span>VIEW</span><strong>{reducedMotion ? 'STATIC' : onscreen && tabVisible ? 'ACTIVE' : 'PAUSED'}</strong></div>
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
      <span><b className="ready"/> fully staffed</span>
      <span><b className="watch"/> short by 1</span>
      <span><b className="risk"/> short by 2+</span>
      <p>Simplified bottleneck model: line rate = demand-adjusted target JPH × the weakest station throughput factor. Cars remain static until Phase 3 queue dynamics.</p>
    </div>
  </section>
}
