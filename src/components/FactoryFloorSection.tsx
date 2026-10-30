import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { RepresentativeTrial, Shift, SimResult } from '../sim/types'
import { useTwinStore } from '../state/store'
import { bottleneckIndex } from '../factory/layout'
import { AnimatedNumber, GlassPanel, Icon, SectionHeading } from './ui'

const FactoryExperience=lazy(()=>import('../factory/FactoryExperience'))

function webglAvailable(){
  try{
    const canvas=document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext&&(canvas.getContext('webgl2')||canvas.getContext('webgl')))
  }catch{return false}
}

class SceneBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(_error:Error,_info:ErrorInfo){/* analytical fallback remains usable */}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}

function trialFor(result:SimResult,shift:Shift,mode:'typical'|'failure'){
  const set=result.trialSets[shift]
  return mode==='failure'&&set.failureTrial?set.failureTrial:set.typicalTrial
}

function FloorFallback({trial}:{trial:RepresentativeTrial}){
  return <GlassPanel className="factory-fallback">
    <div className="factory-fallback-head"><span>ANALYTICAL FALLBACK · TRIAL #{trial.trialIndex}</span><strong>{trial.lineRateJPH.toFixed(1)} JPH</strong></div>
    <div className="factory-fallback-line">{trial.stations.map((station,index)=><div className="fallback-cell" key={station.stationId}>
      <span className={station.status==='staffed'?'ready':station.status==='short'?'watch':'risk'}>{String(index+1).padStart(2,'0')}</span>
      <strong>{station.stationName}</strong><small>{station.assigned}/{station.required} assigned · {(station.throughputFactor*100).toFixed(0)}% throughput</small>
    </div>)}</div>
  </GlassPanel>
}

function waitUntilVisible(node:HTMLElement,ratio=.6){
  return new Promise<void>(resolve=>{
    if(typeof IntersectionObserver==='undefined'){resolve();return}
    const observer=new IntersectionObserver(entries=>{
      if((entries[0]?.intersectionRatio??0)>=ratio){observer.disconnect();resolve()}
    },{threshold:[ratio]})
    observer.observe(node)
    window.setTimeout(()=>{observer.disconnect();resolve()},1400)
  })
}

export function FactoryFloorSection({result,reducedMotion}:{result:SimResult;reducedMotion:boolean}){
  const {previousResult,runId,healId,sequenceSkipId,skipSequence,plan,applyingPlan,completePlanApply}=useTwinStore()
  const sectionRef=useRef<HTMLElement>(null)
  const lastRun=useRef(runId), lastHeal=useRef(healId), lastSkip=useRef(sequenceSkipId)
  const timers=useRef<number[]>([])
  const weakest=useMemo(()=>[...result.shiftResults].sort((a,b)=>a.coverageProbability-b.coverageProbability)[0]?.shift??'Early',[result])
  const [shift,setShift]=useState<Shift>(weakest)
  const [trialMode,setTrialMode]=useState<'typical'|'failure'>(()=>result.trialSets[weakest].failureRate>=5&&result.trialSets[weakest].failureTrial?'failure':'typical')
  const [mode,setMode]=useState<'idle'|'run'|'heal'>('idle')
  const [hudTrial,setHudTrial]=useState(()=>trialFor(result,weakest,trialMode))
  const [webgl,setWebgl]=useState<boolean|null>(null)

  const trialSet=result.trialSets[shift]
  const trial=trialFor(result,shift,trialMode)
  const previousTrial=previousResult?trialFor(previousResult,shift,trialMode):trial
  const healResult=plan?.recommended.result??null
  const healTrial=healResult?trialFor(healResult,shift,'typical'):null
  const focusIndex=bottleneckIndex(hudTrial.stations)
  const focus=hudTrial.stations[focusIndex]

  const clear=()=>{timers.current.forEach(clearTimeout);timers.current=[]}
  useEffect(()=>{setWebgl(webglAvailable());return clear},[])
  useEffect(()=>{setShift(weakest)},[weakest])
  useEffect(()=>{
    const set=result.trialSets[shift]
    setTrialMode(set.failureRate>=5&&set.failureTrial?'failure':'typical')
  },[result,shift])
  useEffect(()=>{if(mode==='idle')setHudTrial(trial)},[trial,mode])

  useEffect(()=>{
    if(!runId||runId===lastRun.current)return
    lastRun.current=runId;clear()
    if(reducedMotion){setHudTrial(trial);setMode('idle');return}
    setHudTrial(previousTrial);setMode('run')
    sectionRef.current?.scrollIntoView({behavior:'smooth',block:'center'})
    timers.current.push(window.setTimeout(()=>setHudTrial(trial),1250))
    timers.current.push(window.setTimeout(()=>setMode('idle'),3900))
  // sequence captures the result associated with runId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[runId])

  useEffect(()=>{
    if(!healId||healId===lastHeal.current||!applyingPlan||!healTrial)return
    lastHeal.current=healId;clear()
    const play=async()=>{
      const node=sectionRef.current
      if(node){
        node.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'})
        await waitUntilVisible(node,.6)
      }
      if(reducedMotion){setHudTrial(healTrial);completePlanApply();setMode('idle');return}
      setMode('heal')
      timers.current.push(window.setTimeout(()=>setHudTrial(healTrial),1350))
      timers.current.push(window.setTimeout(()=>{completePlanApply();setMode('idle')},3550))
    }
    void play()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[healId])

  useEffect(()=>{
    if(sequenceSkipId===lastSkip.current)return
    lastSkip.current=sequenceSkipId
    if(mode==='idle')return
    clear()
    if(mode==='heal'&&healTrial){setHudTrial(healTrial);completePlanApply()}else setHudTrial(trial)
    setMode('idle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sequenceSkipId])

  useEffect(()=>{
    if(mode==='idle')return
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')skipSequence()}
    addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)
  },[mode,skipSequence])

  const fallback=<FloorFallback trial={hudTrial}/>
  const failureLabel=trialSet.failureTrial?`Failing ${shift.toLowerCase()} · ${trialSet.failureRate.toFixed(0)}%`:`No failures in ${result.samples.toLocaleString()}`

  return <section id="floor" className="content-section factory-section" ref={sectionRef}>
    <div className="factory-heading-row">
      <SectionHeading eyebrow="LIVE DIGITAL TWIN" title="See the constraint move through the line." body="A representative Monte Carlo state drives every station, queue and recovery beat. The camera follows the model rather than a scripted fake failure."/>
      <div className="factory-control-stack">
        <div className="shift-selector">{(['Early','Late','Night'] as Shift[]).map(value=><button key={value} className={shift===value?'active':''} onClick={()=>setShift(value)} disabled={mode!=='idle'}>{value}</button>)}</div>
        <div className="trial-selector">
          <button className={trialMode==='typical'?'active':''} onClick={()=>setTrialMode('typical')} disabled={mode!=='idle'}>Typical {shift.toLowerCase()}</button>
          <button className={trialMode==='failure'?'active':''} onClick={()=>setTrialMode('failure')} disabled={!trialSet.failureTrial||mode!=='idle'}>{failureLabel}</button>
        </div>
      </div>
    </div>

    <div className={`factory-shell cinematic-factory ${mode!=='idle'?'sequence-active':''}`}>
      <div className="factory-shell-hud factory-operating-hud cinematic-hud">
        <div><span>LINE RATE</span><strong><AnimatedNumber value={hudTrial.lineRateJPH} decimals={1} reducedMotion={reducedMotion}/> JPH</strong><small>target {hudTrial.targetLineRateJPH.toFixed(1)}</small></div>
        <i/><div><span>SHORTFALL</span><strong>{result.expectedShortfall.toFixed(2)}</strong><small>person-shifts / day</small></div>
        <i/><div><span>COVERAGE</span><strong>{result.stationShiftCoverage.toFixed(1)}%</strong><small>station-shifts</small></div>
        <i/><div><span>SHIFT</span><strong>{shift}</strong><small>trial #{hudTrial.trialIndex}</small></div>
      </div>

      {mode!=='idle'&&<div className="letterbox" aria-hidden="true"><i/><i/></div>}
      <AnimatePresence>{mode!=='idle'&&<motion.div className="factory-sequence-status" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
        <span>{mode==='run'?'CONSTRAINT PROPAGATING':'RECOVERY IN PROGRESS'}</span>
        <strong>{mode==='run'?`JPH ${previousTrial.lineRateJPH.toFixed(0)} → ${trial.lineRateJPH.toFixed(0)}`:`JPH ${trial.lineRateJPH.toFixed(0)} → ${healTrial?.lineRateJPH.toFixed(0)??'—'}`}</strong>
        <button onClick={skipSequence}><Icon name="skip" size={13}/> Skip · Esc</button>
      </motion.div>}</AnimatePresence>}

      {webgl===false?fallback:webgl===null?<div className="factory-loading"><span>INITIALIZING DIGITAL TWIN</span><i/></div>:<SceneBoundary fallback={fallback}><Suspense fallback={<div className="factory-loading"><span>LOADING FACTORY</span><i/></div>}><FactoryExperience trial={hudTrial} mode={mode} reducedMotion={reducedMotion} shift={shift}/></Suspense></SceneBoundary>}

      <div className={`factory-story-callout ${mode==='idle'?'quiet':''}`}>
        <span>{focus.status==='staffed'?'SYSTEM FOCUS':'BOTTLENECK'}</span>
        <strong>{focus.stationName}</strong>
        <p>{focus.assigned}/{focus.required} qualified · {(focus.throughputFactor*100).toFixed(0)}% station throughput</p>
        <small>{mode==='heal'?'Targeted capacity is entering the constrained station.':`${trialSet.failureRate.toFixed(1)}% simulated shift failure rate`}</small>
        <i aria-hidden="true"/>
      </div>
    </div>
    <div className="factory-caption"><span><b className="ready"/>covered</span><span><b className="watch"/>short</span><span><b className="risk"/>uncovered</span><p>All displayed headline metrics use {result.samples.toLocaleString()} trials · synthetic data</p></div>
  </section>
