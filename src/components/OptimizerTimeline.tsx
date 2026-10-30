import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useTwinStore } from '../state/store'
import type { Intervention } from '../sim/types'
import { AnimatedNumber, GlassPanel, Icon, SectionHeading } from './ui'

function OptionCard({ option }: { option: Intervention }) {
  const gain=option.readinessAfter-option.readinessBefore
  const tone=gain>=12?'ready':gain>=5?'watch':'neutral'
  const gainLabel=`${gain >= 0 ? '+' : '−'}${Math.abs(gain).toFixed(1)} pts`
  return <GlassPanel className={`option-card ${option.id==='overtime'?'capped':''}`}>
    {option.capped && <div className="cap-ribbon"><Icon name="lock" size={12}/> bounded contingency</div>}
    <div className="option-icon"><Icon name={option.id==='training'?'training':option.id==='rebalance'?'swap':'clock'} /></div>
    <span className="option-kicker">{option.title}</span>
    <h3>{option.description}</h3>
    <div className="option-score"><b>{option.readinessBefore.toFixed(0)}</b><Icon name="arrow" size={15}/><strong>{option.readinessAfter.toFixed(0)}</strong><span className={tone}>{gainLabel}</span></div>
    <ul>{option.actions.map(a=><li key={a}>{a}</li>)}</ul>
    <div className="option-foot"><span>verified at week {option.evaluationWeek}</span><strong>{option.leadWeeks===0?'immediate':`${option.leadWeeks} weeks lead`}</strong></div>
    {option.valuePerSlot != null && <div className="resilience-value"><span>RESILIENCE VALUE / TRAINING SLOT</span><strong>+{option.valuePerSlot.toFixed(1)} pts</strong></div>}
  </GlassPanel>
}

export function OptimizerPanel() {
  const { plan, optimize, optimizing, applyPlan, appliedPlan, applyingPlan, result }=useTwinStore()
  if (!result) return null

  return <section id="optimizer" className="content-section">
    <SectionHeading eyebrow="RESPONSE OPTIMIZER" title="Don't prescribe an action. Test it." body="Candidate interventions modify the same synthetic qualification model and are re-simulated under common random numbers." />

    {!plan && <GlassPanel className="optimizer-launch">
      <div>
        <span className="optimizer-kicker">CURRENT SCENARIO</span>
        <strong>{result.readiness.toFixed(1)}%</strong>
        <p>Find the highest-value response while protecting donor-shift coverage.</p>
      </div>
      <motion.button className="optimize-button" onClick={()=>void optimize()} disabled={optimizing} whileTap={{scale:.985}}>
        <Icon name="spark"/>
        {optimizing ? 'Evaluating interventions…' : 'Find best response'}
        {optimizing && <i/>}
      </motion.button>
    </GlassPanel>}

    {optimizing && <div className="optimizer-progress"><i/><span>Re-running candidate qualification and shift configurations…</span></div>}

    {plan && <>
      <div className="options-grid">{plan.options.map((o,i)=><motion.div key={o.id} initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} transition={{delay:i*.1}}><OptionCard option={o}/></motion.div>)}</div>

      <GlassPanel className="recommended-plan">
        <div className="recommended-copy">
          <span>RECOMMENDED · VERIFIED WEEK {plan.recommended.evaluationWeek} · {plan.evaluated} CANDIDATE EVALUATIONS</span>
          <h3>{plan.recommended.description}</h3>
          <p>{plan.recommended.actions.join(' · ')}</p>
        </div>
        <div className="recommended-score">
          <span>verified resilience</span>
          <div><b>{plan.recommended.readinessBefore.toFixed(0)}</b><Icon name="arrow"/><strong>{plan.recommended.readinessAfter.toFixed(0)}</strong></div>
        </div>
        <button className="apply-button" onClick={()=>void applyPlan()} disabled={appliedPlan || applyingPlan}>
          <Icon name={appliedPlan?'check':'play'} size={16}/>
          {appliedPlan ? 'Plan applied' : applyingPlan ? 'Healing line…' : 'Apply plan'}
        </button>
      </GlassPanel>

      {appliedPlan && <div className="compare-strip">
        <div><span>SCENARIO</span><strong>{plan.recommended.readinessBefore.toFixed(1)}%</strong><i style={{width:`${plan.recommended.readinessBefore}%`}}/></div>
        <div><span>PLAN STATE · WEEK {plan.recommended.leadWeeks}</span><strong>{plan.recommended.readinessAfter.toFixed(1)}%</strong><i className="healed" style={{width:`${plan.recommended.readinessAfter}%`}}/></div>
      </div>}
    </>}
  </section>
}

export function Timeline() {
  const { timeline, scenario, plan, appliedPlan, reducedMotion }=useTwinStore()
  const [week,setWeek]=useState(0)
  const [playing,setPlaying]=useState(false)

  useEffect(()=>{
    if (!playing) return
    const id=window.setInterval(()=>setWeek(w=>{
      if (w>=8) { setPlaying(false); return 8 }
      return w+1
    }), reducedMotion?700:450)
    return ()=>clearInterval(id)
  },[playing,reducedMotion])

  const point=timeline.find(p=>p.week===week) ?? timeline[0]
  const width=960,height=260,left=54,right=28,top=26,bottom=42
  const x=(w:number)=>left+(w/8)*(width-left-right)
  const y=(v:number)=>top+(100-v)/100*(height-top-bottom)
  const line=timeline.map(p=>`${x(p.week)},${y(p.readiness)}`).join(' ')
  const band=useMemo(()=>{
    if(!timeline.length) return ''
    const upper=timeline.map(p=>`${x(p.week)},${y(p.p90)}`).join(' ')
    const lower=[...timeline].reverse().map(p=>`${x(p.week)},${y(p.p10)}`).join(' ')
    return `${upper} ${lower}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[timeline])

  return <section id="timeline" className="content-section">
    <SectionHeading eyebrow="8-WEEK OUTLOOK" title="Resilience is a trajectory, not a snapshot." body="Scrub through certification expiry and training completion to see when a capability gap appears—or heals." />

    <GlassPanel className="timeline-panel">
      <div className="timeline-top">
        <div><span>WEEK {week}</span><strong><AnimatedNumber value={point?.readiness??0} decimals={1} suffix="%" reducedMotion={reducedMotion}/></strong></div>
        <button className="quiet-button" onClick={()=>{ if(week>=8)setWeek(0); setPlaying(v=>!v) }}><Icon name={playing?'skip':'play'} size={15}/>{playing?'Pause':'Play outlook'}</button>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="timeline-chart" role="img" aria-label="Eight week resilience outlook">
        <rect x={left} y={y(90)} width={width-left-right} height={y(0)-y(90)} className="gap-zone"/>
        <line x1={left} x2={width-right} y1={y(90)} y2={y(90)} className="threshold"/>
        <text x={width-right} y={y(90)-7} textAnchor="end" className="threshold-label">90% resilience threshold</text>
        <polygon points={band} className="timeline-band"/>
        <polyline points={line} className="timeline-line" fill="none"/>
        {timeline.map(p=><g key={p.week}><circle cx={x(p.week)} cy={y(p.readiness)} r={p.week===week?6:3.5} className={p.week===week?'timeline-dot active':'timeline-dot'}/><text x={x(p.week)} y={height-14} textAnchor="middle">W{p.week}</text></g>)}
        {scenario.certHorizon>0 && <g><path d={`M${x(Math.min(8,scenario.certHorizon))} ${top} v${height-top-bottom}`} className="event-line"/><text x={x(Math.min(8,scenario.certHorizon))+6} y={top+12} className="event-label">cert horizon</text></g>}
        {appliedPlan && plan && <g><path d={`M${x(plan.recommended.leadWeeks)} ${top} v${height-top-bottom}`} className="training-line"/><text x={x(plan.recommended.leadWeeks)+6} y={top+28} className="training-label">training ready</text></g>}
      </svg>

      <input className="timeline-scrubber" type="range" min="0" max="8" step="1" value={week} onChange={e=>setWeek(Number(e.target.value))} aria-label="Timeline week" aria-valuenow={week}/>
    </GlassPanel>
  </section>
}
