import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { BASELINE_SCENARIO } from '../sim/plant'
import { useTwinStore } from '../state/store'
import { GlassPanel, Icon, SectionHeading } from './ui'

const presets = [
  { label: 'Baseline', values: { ...BASELINE_SCENARIO } },
  { label: 'Flu season', values: { ...BASELINE_SCENARIO, absenceRate: 12 } },
  { label: 'Ramp-up +15%', values: { ...BASELINE_SCENARIO, absenceRate: 7, demandPct: 15, trainingCoverage: 94 } },
  { label: 'Holiday week', values: { ...BASELINE_SCENARIO, absenceRate: 10, demandPct: 10, trainingCoverage: 90, certHorizon: 1 } },
  { label: 'Cert expiry wave', values: { ...BASELINE_SCENARIO, absenceRate: 7, demandPct: 5, certHorizon: 4, renewalRate: 25 } },
]

function Slider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v:number)=>void }) {
  const pct = (value-min)/(max-min)*100
  return <label className="scenario-slider">
    <div className="slider-head"><span>{label}</span><output>{value}{suffix}</output></div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e=>onChange(Number(e.target.value))}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{'--value':`${pct}%`} as React.CSSProperties}
    />
    <div className="slider-scale"><span>{min}{suffix}</span><span>{max}{suffix}</span></div>
  </label>
}

export function ScenarioStudio() {
  const { scenario, setScenario, runPreview, runScenario, running, reset } = useTwinStore()
  const timer = useRef<number | null>(null)

  const update = (patch: Partial<typeof scenario>) => {
    setScenario(patch)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void runPreview(), 120)
  }

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return <section id="scenario" className="content-section">
    <SectionHeading eyebrow="SCENARIO STUDIO" title="Change the conditions. Watch the constraint emerge." body="Drag a control for a 300-trial ghost preview, then run the full 5,000-trial simulation." />

    <GlassPanel className="scenario-panel">
      <div className="preset-row">
        <span>PRESETS</span>
        <div>{presets.map(p=><button key={p.label} onClick={()=>{ setScenario(p.values); window.setTimeout(()=>void runPreview(),40) }}>{p.label}</button>)}</div>
      </div>

      <div className="slider-grid">
        <Slider label="Absence rate" value={scenario.absenceRate} min={2} max={20} step={1} suffix="%" onChange={v=>update({absenceRate:v})} />
        <Slider label="Production demand" value={scenario.demandPct} min={0} max={30} step={1} suffix="%" onChange={v=>update({demandPct:v})} />
        <Slider label="Training coverage" value={scenario.trainingCoverage} min={60} max={100} step={1} suffix="%" onChange={v=>update({trainingCoverage:v})} />
        <Slider label="Certification horizon" value={scenario.certHorizon} min={0} max={8} step={1} suffix=" wk" onChange={v=>update({certHorizon:v})} />
        <Slider label="Certification renewal rate" value={scenario.renewalRate} min={40} max={100} step={5} suffix="%" onChange={v=>update({renewalRate:v})} />
      </div>

      <div className="scenario-actions">
        <button className="quiet-button" onClick={()=>void reset()}><Icon name="reset"/> Reset</button>
        <motion.button className="run-button" onClick={()=>void runScenario()} disabled={running} whileTap={{scale:.985}}>
          <span>{running ? 'SIMULATING…' : 'RUN SCENARIO'}</span>
          {!running && <Icon name="play" size={16}/>}
          {running && <i className="button-progress"/>}
        </motion.button>
      </div>
    </GlassPanel>
  </section>
}
