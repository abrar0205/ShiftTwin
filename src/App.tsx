import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AnalysisPanels } from './components/AnalysisPanels'
import { BackgroundGrid } from './components/BackgroundGrid'
import { CommandView } from './components/CommandView'
import { MethodPrivacy } from './components/MethodPrivacy'
import { OptimizerPanel, Timeline } from './components/OptimizerTimeline'
import { ScenarioStudio } from './components/ScenarioStudio'
import { SkillNetwork } from './components/SkillNetwork'
import { Icon } from './components/ui'
import { useTwinStore } from './state/store'

const REPO='https://github.com/abrar0205/ShiftTwin'

function Intro({ onDone, reducedMotion }: { onDone:()=>void; reducedMotion:boolean }) {
  useEffect(()=>{
    if (reducedMotion) { onDone(); return }
    const id=window.setTimeout(onDone,2800)
    const key=(e:KeyboardEvent)=>{ if(e.key==='Escape') onDone() }
    addEventListener('keydown',key)
    return ()=>{ clearTimeout(id); removeEventListener('keydown',key) }
  },[onDone,reducedMotion])

  if (reducedMotion) return null
  return <motion.div className="intro" initial={{opacity:1}} exit={{opacity:0}} transition={{duration:.35}} onClick={onDone}>
    <div className="intro-stage">
      <motion.div className="intro-line" initial={{scaleX:0}} animate={{scaleX:1}} transition={{duration:.6,ease:[.16,1,.3,1]}}/>
      <svg viewBox="0 0 700 240" aria-hidden="true">
        {[0,1,2].map(a=>[0,1,2,3].map(s=>{
          const y=48+a*72+s*12
          return <motion.path key={`${a}-${s}`} d={`M80 ${70+a*72} C210 ${70+a*72},260 ${y},360 ${y} S520 ${y},620 ${y}`} className="intro-path" initial={{pathLength:0,opacity:0}} animate={{pathLength:1,opacity:.65}} transition={{delay:.45+a*.08+s*.025,duration:.8}}/>
        }))}
        {[0,1,2].map(a=><motion.circle key={a} cx="80" cy={70+a*72} r="7" className="intro-node" initial={{opacity:0,scale:.2}} animate={{opacity:1,scale:1}} transition={{delay:1.15+a*.08}}/>)}
        {[0,1,2,3,4,5,6,7,8,9,10,11].map((n)=><motion.circle key={n} cx={360} cy={48+Math.floor(n/4)*72+(n%4)*12} r="5" className="intro-node" initial={{opacity:0,scale:.2}} animate={{opacity:1,scale:1}} transition={{delay:1.05+n*.035}}/>)}
      </svg>
      <motion.div className="intro-copy" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:1.65,duration:.6}}>
        <span>SHIFT TWIN</span>
        <strong>Simulate workforce changes before they become production constraints.</strong>
      </motion.div>
      <button className="intro-skip" onClick={onDone}><Icon name="skip" size={14}/> Skip</button>
    </div>
  </motion.div>
}

function Loading() {
  return <div className="loading-screen">
    <div className="loading-mark">ST</div>
    <span>CALIBRATING SYNTHETIC PLANT</span>
    <div className="loading-bar"><i/></div>
    <p>Generating qualification matrix · running 5,000 baseline trials</p>
  </div>
}

export default function App() {
  const { initialize, result, baseline, previewResult, scenario, reducedMotion, setReducedMotion, error }=useTwinStore()
  const [intro,setIntro]=useState(false)

  useEffect(()=>{
    void initialize()
    try {
      const seen=localStorage.getItem('shifttwin-intro-seen')
      if (!seen && !reducedMotion) setIntro(true)
    } catch {
      if (!reducedMotion) setIntro(true)
    }
  },[initialize,reducedMotion])

  const closeIntro=()=>{
    setIntro(false)
    try { localStorage.setItem('shifttwin-intro-seen','1') } catch { /* storage may be unavailable */ }
  }

  const risk=result?.worst.uncoveredProbability ?? 0
  const sections=useMemo(()=>[
    ['command','Command'],['scenario','Scenario'],['network','Network'],['analysis','Explain'],['optimizer','Optimize'],['timeline','Outlook']
  ],[])

  return <div className="app">
    <BackgroundGrid risk={risk} reducedMotion={reducedMotion}/>
    <AnimatePresence>{intro && <Intro onDone={closeIntro} reducedMotion={reducedMotion}/>}</AnimatePresence>

    <header className="topbar">
      <a className="wordmark" href="#command"><span>SHIFT</span>TWIN</a>
      <nav className="section-dots" aria-label="Page sections">
        {sections.map(([id,label])=><a key={id} href={`#${id}`}><i/><span>{label}</span></a>)}
      </nav>
      <div className="top-actions">
        <a href="#method" className="method-link">Method</a>
        <label className="motion-toggle"><input type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/><span/>Reduce motion</label>
        <a href={REPO} className="github-link" target="_blank" rel="noreferrer" aria-label="GitHub repository"><Icon name="github" size={17}/></a>
      </div>
    </header>

    <main>
      {!result || !baseline ? <Loading/> : <>
        <CommandView result={result} preview={previewResult} scenario={scenario} reducedMotion={reducedMotion}/>
        <ScenarioStudio/>
        <SkillNetwork result={result} reducedMotion={reducedMotion}/>
        <AnalysisPanels baseline={baseline} result={result}/>
        <OptimizerPanel/>
        <Timeline/>
        <MethodPrivacy/>
      </>}
      {error && <div className="error-banner"><Icon name="alert" size={15}/><span>{error}</span></div>}
    </main>

    <footer>
      <div><strong>ShiftTwin</strong><span>Workforce Resilience Simulator</span></div>
      <a href={REPO} target="_blank" rel="noreferrer"><Icon name="github" size={14}/> Source</a>
      <p>Synthetic data. Independent portfolio project. Not affiliated with any employer.</p>
    </footer>
  </div>
}
