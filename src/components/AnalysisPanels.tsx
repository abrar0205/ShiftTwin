import { motion } from 'motion/react'
import type { SimResult } from '../sim/types'
import { GlassPanel, Icon, SectionHeading } from './ui'

function Histogram({ result }: { result: SimResult }) {
  const bins = result.histogram
  const max = Math.max(1, ...bins.map(b=>b.count))
  const width=560, height=185, left=30, bottom=28
  const barW=Math.max(8,(width-left-12)/Math.max(1,bins.length)-5)

  return <svg viewBox={`0 0 ${width} ${height}`} className="histogram" role="img" aria-label="Monte Carlo distribution of uncovered stations">
    <line x1={left} x2={width-8} y1={height-bottom} y2={height-bottom} className="axis"/>
    {bins.map((b,i)=>{
      const h=(b.count/max)*(height-bottom-20)
      const x=left+i*((width-left-12)/Math.max(1,bins.length))
      return <motion.g key={b.uncovered} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*.02}}>
        <rect x={x} y={height-bottom-h} width={barW} height={h} rx="2" className={b.uncovered===0?'hist-good':'hist-risk'}/>
        <text x={x+barW/2} y={height-10} textAnchor="middle">{b.uncovered}</text>
      </motion.g>
    })}
    <text x={left} y="14" className="chart-label">TRIAL COUNT</text>
    <text x={width-10} y={height-10} textAnchor="end" className="axis-title">stations uncovered</text>
  </svg>
}

function Waterfall({ baseline, result }: { baseline: SimResult; result: SimResult }) {
  const width=590, height=220, top=24, bottom=38
  const innerH=height-top-bottom
  const y=(v:number)=>top+(100-Math.max(0,Math.min(100,v)))/100*innerH
  const steps = result.attribution.length ? result.attribution : [
    {key:'absence' as const,label:'Absence',delta:0},
    {key:'demand' as const,label:'Demand',delta:0},
    {key:'training' as const,label:'Training',delta:0},
    {key:'certification' as const,label:'Cert expiry',delta:0},
  ]
  const labels=['Baseline',...steps.map(s=>s.label),'Scenario']
  const x=(i:number)=>46+i*88
  let cursor=baseline.readiness
  const bars=steps.map(step=>{
    const from=cursor
    const to=cursor+step.delta
    cursor=to
    return {from,to,delta:step.delta,label:step.label}
  })

  return <svg viewBox={`0 0 ${width} ${height}`} className="waterfall" role="img" aria-label="Shapley attribution waterfall">
    {[50,75,90,100].map(v=><g key={v}><line x1="30" x2={width-10} y1={y(v)} y2={y(v)} className="gridline"/><text x="26" y={y(v)+3} textAnchor="end">{v}</text></g>)}
    <rect x={x(0)-18} y={y(baseline.readiness)} width="36" height={y(0)-y(baseline.readiness)} rx="3" className="water-base"/>
    {bars.map((b,i)=>{
      const yy=Math.min(y(b.from),y(b.to))
      const hh=Math.max(2,Math.abs(y(b.from)-y(b.to)))
      return <g key={b.label}>
        <line x1={x(i)+18} x2={x(i+1)-18} y1={y(b.from)} y2={y(b.from)} className="water-connector"/>
        <rect x={x(i+1)-18} y={yy} width="36" height={hh} rx="3" className={b.delta<=0?'water-down':'water-up'}/>
        <text x={x(i+1)} y={yy-6} textAnchor="middle" className={b.delta<=0?'water-text-down':'water-text-up'}>{b.delta>0?'+':''}{b.delta.toFixed(1)}</text>
      </g>
    })}
    <line x1={x(steps.length)+18} x2={x(steps.length+1)-18} y1={y(cursor)} y2={y(cursor)} className="water-connector"/>
    <rect x={x(steps.length+1)-18} y={y(result.readiness)} width="36" height={y(0)-y(result.readiness)} rx="3" className="water-final"/>
    {labels.map((label,i)=><text key={label} x={x(i)} y={height-12} textAnchor="middle" className="axis-title">{label}</text>)}
  </svg>
}

export function AnalysisPanels({ baseline, result }: { baseline: SimResult; result: SimResult }) {
  const w=result.worst
  return <section id="analysis" className="content-section">
    <SectionHeading eyebrow="CONSTRAINT REVEAL" title="The headline number is only useful if you can explain it." body="ShiftTwin shows the recurring bottleneck, the uncertainty distribution, and a sensitivity view of what changed." />

    <div className="credibility-strip">
      <GlassPanel><span>EXPECTED SHORTFALL</span><strong>{result.expectedShortfall.toFixed(2)}</strong><small>person-shifts / day</small></GlassPanel>
      <GlassPanel><span>STATION-SHIFT COVERAGE</span><strong>{result.stationShiftCoverage.toFixed(1)}%</strong><small>complete coverage</small></GlassPanel>
      <GlassPanel className="uncertainty-card"><span>BATCH UNCERTAINTY</span><strong>{result.uncertaintyBand.p10.toFixed(1)}–{result.uncertaintyBand.p90.toFixed(1)}%</strong><small>p10–p90 across {result.uncertaintyBand.batches} batches</small><div className="uncertainty-track"><i style={{left:`${result.uncertaintyBand.p10}%`,width:`${Math.max(.5,result.uncertaintyBand.p90-result.uncertaintyBand.p10)}%`}}/><b style={{left:`${result.readiness}%`}}/></div></GlassPanel>
    </div>

    <GlassPanel className="constraint-card">
      <div className="constraint-icon"><Icon name={w.uncoveredProbability>=20?'alert':'activity'} size={21}/></div>
      <div className="constraint-main">
        <span>CONSTRAINT DETECTED</span>
        <h3>{w.stationName} · {w.shift} shift</h3>
        <p>{w.uncoveredProbability.toFixed(1)}% of trials leave this station under-covered. It is the first attributed bottleneck in {w.failureShare.toFixed(1)}% of plant-level failures.</p>
      </div>
      <div className="constraint-stats">
        <div><span>qualified pool</span><strong>{w.qualifiedPool}</strong></div>
        <div><span>required</span><strong>{w.required}</strong></div>
      </div>
    </GlassPanel>

    <div className="analysis-grid">
      <GlassPanel className="analysis-panel">
        <div className="analysis-head"><span>MONTE CARLO DISTRIBUTION</span><strong>{result.samples.toLocaleString()} trials</strong></div>
        <Histogram result={result}/>
        <p>Each bar counts simulated plant states by how many critical station/shift combinations could not be fully covered.</p>
      </GlassPanel>

      <GlassPanel className="analysis-panel">
        <div className="analysis-head"><span>WHY READINESS MOVED</span><strong>Shapley · order-independent</strong></div>
        <Waterfall baseline={baseline} result={result}/>
        <p>Exact four-driver Shapley values average each driver across every ordering, using common random numbers. They explain the model delta; they are not causal estimates.</p>
      </GlassPanel>
    </div>
  </section>
}
