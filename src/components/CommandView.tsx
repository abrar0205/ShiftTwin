import { motion } from 'motion/react'
import { BASELINE_SCENARIO } from '../sim/plant'
import type { Scenario, SimResult } from '../sim/types'
import { AnimatedNumber, GlassPanel, StatusPill } from './ui'

const circumference = 2 * Math.PI * 118

function ReadinessGauge({ result, ghost, reducedMotion }: { result: SimResult; ghost?: SimResult | null; reducedMotion: boolean }) {
  const value = result.readiness
  const tone = value >= 90 ? 'ready' : value >= 75 ? 'watch' : 'risk'
  const arc = circumference * value / 100
  const bandStart = circumference * result.p10 / 100
  const bandLength = circumference * Math.max(0.5, result.p90 - result.p10) / 100
  const ghostArc = ghost ? circumference * ghost.readiness / 100 : 0

  return <div className={`readiness-core ${tone}`}>
    <svg className="gauge" viewBox="0 0 280 280" role="img" aria-label={`Operational resilience ${value.toFixed(1)} percent`}>
      <circle className="gauge-track" cx="140" cy="140" r="118" />
      <circle
        className="gauge-band"
        cx="140" cy="140" r="126"
        strokeDasharray={`${bandLength} ${circumference - bandLength}`}
        strokeDashoffset={-bandStart}
      />
      {ghost && <circle className="gauge-ghost" cx="140" cy="140" r="118" strokeDasharray={`${ghostArc} ${circumference - ghostArc}`} />}
      <motion.circle
        className="gauge-value"
        cx="140" cy="140" r="118"
        strokeDasharray={`${arc} ${circumference - arc}`}
        animate={{ opacity: 1 }}
        transition={{ duration: reducedMotion ? .15 : .8 }}
      />
    </svg>
    <div className="gauge-center">
      <div className="hero-number"><AnimatedNumber value={value} decimals={0} reducedMotion={reducedMotion} /></div>
      <span className="out-of">/100</span>
      <StatusPill value={value} />
    </div>
    <div className="confidence-label">p10–p90 batch readiness · {result.uncertaintyBand.p10.toFixed(1)}–{result.uncertaintyBand.p90.toFixed(1)} · {result.uncertaintyBand.batches} batches</div>
  </div>
}

function DriverTile({ label, value, unit, delta, status }: { label: string; value: string; unit?: string; delta?: string; status?: 'ready'|'watch'|'risk' }) {
  return <GlassPanel className="driver-tile">
    <span className="driver-label">{label}</span>
    <div className="driver-value">{value}<small>{unit}</small></div>
    {delta && <span className={`driver-delta ${status ?? ''}`}>{delta}</span>}
  </GlassPanel>
}

export function CommandView({ result, preview, scenario, reducedMotion }: { result: SimResult; preview: SimResult | null; scenario: Scenario; reducedMotion: boolean }) {
  const baselineAvailability = 100 - BASELINE_SCENARIO.absenceRate
  const availability = 100 - scenario.absenceRate
  const weakest = [...result.shiftResults].sort((a,b)=>a.coverageProbability-b.coverageProbability)[0]

  return <section id="command" className="command-section">
    <div className="command-copy">
      <span className="eyebrow">WORKFORCE RESILIENCE SIMULATOR</span>
      <h1>See workforce risk.<br/><em>Before the line feels it.</em></h1>
      <p>ShiftTwin turns qualification, shift and absence uncertainty into a living production twin—then verifies which intervention actually restores coverage.</p>
    </div>

    <div className="command-grid">
      <GlassPanel className="core-panel">
        <div className="panel-kicker">OPERATIONAL RESILIENCE</div>
        <ReadinessGauge result={result} ghost={preview} reducedMotion={reducedMotion} />
        <p className="core-caption">Probability every critical station is covered by a qualified person across {result.samples.toLocaleString()} simulated plant states.</p>
      </GlassPanel>

      <div className="driver-grid">
        <DriverTile label="People availability" value={availability.toFixed(1)} unit="%" delta={availability === baselineAvailability ? 'baseline' : `${availability-baselineAvailability > 0 ? '+' : ''}${(availability-baselineAvailability).toFixed(1)} pts`} status={availability > 92 ? 'ready':'watch'} />
        <DriverTile label="Station-shift coverage" value={result.stationShiftCoverage.toFixed(1)} unit="%" delta="5,000-trial basis" status={result.stationShiftCoverage > 97 ? 'ready':result.stationShiftCoverage > 90 ? 'watch':'risk'} />
        <DriverTile label="Expected shortfall" value={result.expectedShortfall.toFixed(2)} unit="" delta="person-shifts / day" status={result.expectedShortfall < .5 ? 'ready':result.expectedShortfall < 1.5 ? 'watch':'risk'} />
        <DriverTile label="Production demand" value={scenario.demandPct === 0 ? '0' : `+${scenario.demandPct}`} unit="%" delta={scenario.demandPct === 0 ? 'baseline':'scenario'} status={scenario.demandPct < 10 ? 'ready':scenario.demandPct < 20 ? 'watch':'risk'} />
      </div>
    </div>

    <div className="shift-strip">
      {result.shiftResults.map(s => {
        const tone = s.coverageProbability >= 90 ? 'ready' : s.coverageProbability >= 75 ? 'watch' : 'risk'
        return <GlassPanel key={s.shift} className={`shift-card ${weakest.shift === s.shift ? 'weakest':''}`}>
          <div><span>{s.shift} shift</span>{weakest.shift === s.shift && <small>weakest</small>}</div>
          <strong>{s.coverageProbability.toFixed(1)}%</strong>
          <div className="thin-bar"><i className={tone} style={{width:`${s.coverageProbability}%`}}/></div>
        </GlassPanel>
      })}
    </div>
  </section>
}
