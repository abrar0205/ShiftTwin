import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { generatePlant } from '../sim/plant'
import type { RepresentativeTrial, Shift, SimResult, TrialStationState } from '../sim/types'
import { useTwinStore } from '../state/store'
import { AnimatedNumber, GlassPanel, Icon, SectionHeading } from './ui'

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

function trialForMode(result: SimResult | null, shift: Shift, mode: 'typical' | 'failure') {
  if (!result) return null
  const set = result.trialSets[shift]
  if (mode === 'failure' && set.failureTrial) return set.failureTrial
  return set.typicalTrial
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

function FloorFallback({ trial, seed }: { trial: RepresentativeTrial; seed: number }) {
  const plant = useMemo(() => generatePlant(seed), [seed])
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
  const {
    seed,
    previousResult,
    runId,
    healId,
    sequenceSkipId,
    skipSequence,
    plan,
    applyingPlan,
    completePlanApply,
  } = useTwinStore()

  const container = useRef<HTMLDivElement>(null)
  const lastRunHandled = useRef(0)
  const lastHealHandled = useRef(0)
  const lastSkipHandled = useRef(sequenceSkipId)
  const runTimers = useRef<number[]>([])
  const healTimers = useRef<number[]>([])

  const weakestShift = useMemo(
    () => [...result.shiftResults].sort((a,b) => a.coverageProbability - b.coverageProbability)[0]?.shift ?? 'Early',
    [result],
  )
  const [shift, setShift] = useState<Shift>(weakestShift)
  const initialTrialSet = result.trialSets[weakestShift]
  const [trialMode, setTrialMode] = useState<'typical' | 'failure'>(
    initialTrialSet.failureRate >= 5 && initialTrialSet.failureTrial ? 'failure' : 'typical',
  )
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [onscreen, setOnscreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const [sequenceMode, setSequenceMode] = useState<'idle' | 'run' | 'heal'>('idle')

  useEffect(() => setWebgl(webglAvailable()), [])
  useEffect(() => setShift(weakestShift), [weakestShift, result])
  useEffect(() => {
    const next = result.trialSets[shift]
    setTrialMode(next.failureRate >= 5 && next.failureTrial ? 'failure' : 'typical')
  }, [shift, result])

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

  const trialSet = result.trialSets[shift]
  const trial = trialMode === 'failure' && trialSet.failureTrial ? trialSet.failureTrial : trialSet.typicalTrial
  const previousTrial = trialForMode(previousResult, shift, trialMode)
  const planResult = plan?.recommended.result ?? null
  const healTrial = planResult ? planResult.trialSets[shift].typicalTrial : null

  const [hudTrial, setHudTrial] = useState<RepresentativeTrial>(trial)

  useEffect(() => {
    if (sequenceMode === 'idle') setHudTrial(trial)
  }, [trial, sequenceMode])

  const clearTimers = (timers: React.MutableRefObject<number[]>) => {
    timers.current.forEach(id => window.clearTimeout(id))
    timers.current = []
  }

  useEffect(() => () => {
    clearTimers(runTimers)
    clearTimers(healTimers)
  }, [])

  useEffect(() => {
    if (!runId || runId === lastRunHandled.current) return
    lastRunHandled.current = runId
    clearTimers(runTimers)

    if (reducedMotion) {
      setHudTrial(trial)
      setSequenceMode('idle')
      return
    }

    setHudTrial(previousTrial ?? trial)
    setSequenceMode('run')
    runTimers.current.push(window.setTimeout(() => setHudTrial(trial), 1550))
    runTimers.current.push(window.setTimeout(() => setSequenceMode('idle'), 3550))
  // Trial values are intentionally captured at the moment this runId is handled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  useEffect(() => {
    if (!healId || healId === lastHealHandled.current || !applyingPlan || !healTrial) return
    lastHealHandled.current = healId
    clearTimers(healTimers)

    if (reducedMotion) {
      setHudTrial(healTrial)
      completePlanApply()
      setSequenceMode('idle')
      return
    }

    // Never play the recovery off-screen: the optimizer lives below the factory.
    // Wait for a real on-screen intersection rather than guessing a scroll duration.
    const startHeal = () => {
      setHudTrial(trial)
      setSequenceMode('heal')
      healTimers.current.push(window.setTimeout(() => setHudTrial(healTrial), 1350))
      healTimers.current.push(window.setTimeout(() => {
        completePlanApply()
        setSequenceMode('idle')
      }, 3350))
    }
    const floor = container.current
    if (!floor || typeof IntersectionObserver === 'undefined') {
      floor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      startHeal()
      return
    }
    const observer = new IntersectionObserver(entries => {
      if ((entries[0]?.intersectionRatio ?? 0) < 0.6) return
      observer.disconnect()
      startHeal()
    }, { threshold: [0, 0.6, 1] })
    observer.observe(floor)
    floor.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // A skip cancels the pending reveal as well as the active animation.
    healTimers.current.push(window.setTimeout(() => observer.disconnect(), 12000))
  // Sequence inputs are captured when healId changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healId])

  useEffect(() => {
    if (sequenceSkipId === lastSkipHandled.current) return
    lastSkipHandled.current = sequenceSkipId
    if (sequenceMode === 'idle') return

    clearTimers(runTimers)
    clearTimers(healTimers)

    if (sequenceMode === 'heal' && healTrial) {
      setHudTrial(healTrial)
      completePlanApply()
    } else {
      setHudTrial(trial)
    }
    setSequenceMode('idle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceSkipId])

  useEffect(() => {
    if (sequenceMode === 'idle') return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skipSequence()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [sequenceMode, skipSequence])

  const isNight = shift === 'Night'
  const failurePct = trialSet.failureRate
  const typicalLabel = isNight ? 'Typical night' : `Typical ${shift.toLowerCase()} shift`
  const failureLabel = trialSet.failureTrial
    ? isNight
      ? `A failing night (happens on ${failurePct.toFixed(0)}% of nights)`
      : `A failing ${shift.toLowerCase()} shift (happens on ${failurePct.toFixed(0)}%)`
    : `No failures in ${result.samples.toLocaleString()} trials`

  const shortfallText = hudTrial.fullCoverage
    ? 'full coverage'
    : `${hudTrial.shortfall} ${hudTrial.shortfall === 1 ? 'position' : 'positions'} short`

  const fallback = <FloorFallback trial={hudTrial} seed={seed} />

  return <section id="floor" className="content-section factory-section" ref={container}>
    <div className="factory-heading-row">
      <SectionHeading
        eyebrow="THE FLOOR, RIGHT NOW"
        title="See the constraint. Then watch the response."
        body="One real Monte Carlo staffing state drives the floor. Run a scenario to reveal the bottleneck; apply the verified plan to watch the line recover."
      />
      <div className="factory-control-stack">
        <div className="shift-selector" role="group" aria-label="Factory lighting shift">
          {(['Early','Late','Night'] as Shift[]).map(value =>
            <button
              type="button"
              key={value}
              className={shift === value ? 'active' : ''}
              aria-pressed={shift === value}
              onClick={() => setShift(value)}
              disabled={sequenceMode !== 'idle'}
            >{value}</button>
          )}
        </div>
        <div className="trial-selector" role="group" aria-label="Representative trial view">
          <button
            type="button"
            className={trialMode === 'typical' ? 'active' : ''}
            aria-pressed={trialMode === 'typical'}
            onClick={() => setTrialMode('typical')}
            disabled={sequenceMode !== 'idle'}
          >{typicalLabel}</button>
          <button
            type="button"
            className={trialMode === 'failure' ? 'active' : ''}
            aria-pressed={trialMode === 'failure'}
            disabled={!trialSet.failureTrial || sequenceMode !== 'idle'}
            title={!trialSet.failureTrial ? `No failures in ${result.samples.toLocaleString()} trials` : undefined}
            onClick={() => setTrialMode('failure')}
          >{failureLabel}</button>
        </div>
      </div>
    </div>

    <div
      className={`factory-shell ${sequenceMode !== 'idle' ? 'sequence-active' : ''}`}
      onClick={() => { if (sequenceMode !== 'idle') skipSequence() }}
    >
      <div className="factory-shell-hud factory-operating-hud">
        <div><span>LINE RATE</span><strong><AnimatedNumber value={hudTrial.lineRateJPH} decimals={1} reducedMotion={reducedMotion}/> JPH</strong><small>target {hudTrial.targetLineRateJPH.toFixed(1)}</small></div>
        <i/>
        <div><span>CARS LOST</span><strong><AnimatedNumber value={hudTrial.carsLostPerShift} decimals={1} reducedMotion={reducedMotion}/></strong><small>{hudTrial.shiftHours}h shift</small></div>
        <i/>
        <div><span>SHIFT</span><strong>{shift}</strong><small>{shortfallText}</small></div>
        <i/>
        <div><span>REPRESENTATIVE TRIAL</span><strong>#{hudTrial.trialIndex}</strong><small>of {hudTrial.sampleCount.toLocaleString()}</small></div>
        <i/>
        <div><span>DISPLAYED</span><strong>{trialMode === 'failure' ? 'FAILING' : 'TYPICAL'}</strong><small>{failurePct.toFixed(1)}% shift failure rate</small></div>
        <i/>
        <div className="hud-compact"><span>VIEW</span><strong>{reducedMotion ? 'STATIC' : onscreen && tabVisible ? 'ACTIVE' : 'PAUSED'}</strong></div>
      </div>

      <AnimatePresence>
        {sequenceMode !== 'idle' && <motion.div
          className="factory-sequence-status"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <span>{sequenceMode === 'run' ? 'SCENARIO PROPAGATING' : 'PLAN HEAL IN PROGRESS'}</span>
          <button type="button" onClick={event => { event.stopPropagation(); skipSequence() }}>
            <Icon name="skip" size={13}/> Skip · Esc
          </button>
        </motion.div>}
      </AnimatePresence>

      {webgl === false ? fallback : webgl === null ? <div className="factory-loading">
        <span>CHECKING GRAPHICS CAPABILITY</span><i/>
      </div> : <SceneBoundary fallback={fallback}>
        <Suspense fallback={<div className="factory-loading"><span>LOADING LIVING FACTORY</span><i/></div>}>
          <FactoryFloorScene
            result={result}
            trial={trial}
            previousTrial={previousTrial}
            healTrial={healTrial}
            failureRate={failurePct}
            healWeek={plan?.recommended.evaluationWeek ?? null}
            runId={runId}
            healId={healId}
            skipId={sequenceSkipId}
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
      <p>18× visual time compression. Queueing and starvation emerge from station throughput; the camera and callout explain the selected trial without changing its model state.</p>
    </div>
  </section>
}
