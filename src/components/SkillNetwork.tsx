import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { generatePlant } from '../sim/plant'
import type { Shift, SimResult, StationRisk } from '../sim/types'
import { GlassPanel, SectionHeading } from './ui'

const plant = generatePlant(20261029)
const shifts: Shift[] = ['Early', 'Late', 'Night']
const shiftX: Record<Shift, number> = { Early: 735, Late: 865, Night: 995 }

function tone(risk: number) {
  return risk >= 20 ? 'risk' : risk >= 5 ? 'watch' : 'ready'
}

export function SkillNetwork({ result, reducedMotion }: { result: SimResult; reducedMotion: boolean }) {
  const [hover, setHover] = useState<StationRisk | null>(null)
  const risks = useMemo(() => new Map(result.stationRisks.map(r => [`${r.shift}|${r.stationId}`, r])), [result])
  const rank = useMemo(() => {
    const map = new Map<string, number>()
    result.stationRisks.slice().sort((a,b)=>b.uncoveredProbability-a.uncoveredProbability).forEach((r,i)=>map.set(`${r.shift}|${r.stationId}`,i))
    return map
  }, [result])

  const areaY = new Map<string, number>()
  plant.areas.forEach(area => {
    const rows = plant.stations.map((s,i)=>({s,y:72+i*43})).filter(x=>x.s.areaId===area.id)
    areaY.set(area.id, rows.reduce((sum,x)=>sum+x.y,0)/rows.length)
  })

  return <section id="network" className="content-section network-section">
    <SectionHeading eyebrow="CONSTRAINT PROPAGATION" title="See where resilience breaks." body="Each station/shift node is colored by the probability that qualified coverage fails under the selected scenario." />

    <GlassPanel className="network-panel">
      <div className="network-legend">
        <span><i className="ready"/> resilient</span>
        <span><i className="watch"/> watch</span>
        <span><i className="risk"/> constraint</span>
        <span className="legend-note">hover a node for evidence</span>
      </div>

      <div className="network-desktop">
        <svg viewBox="0 0 1120 610" role="img" aria-label="Qualification network by area, station and shift">
          <defs>
            <linearGradient id="pulse" x1="0" x2="1">
              <stop offset="0" stopColor="transparent"/>
              <stop offset=".5" stopColor="var(--accent)"/>
              <stop offset="1" stopColor="transparent"/>
            </linearGradient>
          </defs>

          <motion.path
            d="M30 28 H1090"
            stroke="url(#pulse)"
            strokeWidth="1.4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [.1,.85,.1] }}
            transition={{ duration: reducedMotion ? .15 : 1.4, ease: 'easeInOut' }}
          />

          <text x="52" y="48" className="network-col-label">AREA</text>
          <text x="275" y="48" className="network-col-label">CRITICAL STATION</text>
          {shifts.map(s=><text key={s} x={shiftX[s]} y="48" textAnchor="middle" className="network-col-label">{s.toUpperCase()}</text>)}

          {plant.areas.map(area => {
            const y=areaY.get(area.id)!
            return <g key={area.id}>
              <circle cx="88" cy={y} r="9" className="area-node"/>
              <text x="108" y={y+4} className="area-label">{area.name}</text>
            </g>
          })}

          {plant.stations.map((station,i) => {
            const y=72+i*43
            const ay=areaY.get(station.areaId)!
            return <g key={station.id}>
              <path d={`M182 ${ay} C220 ${ay},220 ${y},262 ${y}`} className="network-link"/>
              <circle cx="280" cy={y} r="5" className="station-dot"/>
              <text x="295" y={y+4} className="station-label">{station.name}</text>

              {shifts.map(shift => {
                const risk=risks.get(`${shift}|${station.id}`)!
                const x=shiftX[shift]
                const cls=tone(risk.uncoveredProbability)
                const delay=Math.min(.65,(rank.get(`${shift}|${station.id}`)??0)*.018)
                return <g key={shift}>
                  <path d={`M472 ${y} C560 ${y},620 ${y},${x-18} ${y}`} className={`network-link ${cls}`}/>
                  <motion.g
                    initial={reducedMotion ? false : {opacity:.25,scale:.82}}
                    animate={{opacity:1,scale:1}}
                    transition={{delay:reducedMotion?0:delay,duration:reducedMotion?.12:.38}}
                    style={{transformOrigin:`${x}px ${y}px`}}
                    onMouseEnter={()=>setHover(risk)}
                    onMouseLeave={()=>setHover(null)}
                    onFocus={()=>setHover(risk)}
                    onBlur={()=>setHover(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${station.name}, ${shift} shift, ${risk.uncoveredProbability.toFixed(1)} percent probability uncovered`}
                  >
                    <circle cx={x} cy={y} r={risk===result.worst?10:8} className={`risk-node ${cls} ${risk===result.worst?'worst':''}`}/>
                    <text x={x+16} y={y+4} className="risk-value">{risk.uncoveredProbability<0.05?'0':risk.uncoveredProbability.toFixed(0)}%</text>
                  </motion.g>
                </g>
              })}
            </g>
          })}
        </svg>

        {hover && <div className="network-tooltip">
          <span>{hover.stationName} · {hover.shift}</span>
          <strong>{hover.uncoveredProbability.toFixed(1)}% probability uncovered</strong>
          <div><b>{hover.required}</b> required · <b>{hover.qualifiedPool}</b> qualified pool</div>
          <small>{hover.failureShare.toFixed(1)}% of plant-level failures are first attributed here.</small>
        </div>}
      </div>

      <div className="network-mobile">
        {plant.areas.map(area => <div className="mobile-area" key={area.id}>
          <strong>{area.name}</strong>
          {plant.stations.filter(s=>s.areaId===area.id).map(station=><div className="mobile-station" key={station.id}>
            <span>{station.name}</span>
            <div>{shifts.map(shift=>{
              const r=risks.get(`${shift}|${station.id}`)!
              return <span className={tone(r.uncoveredProbability)} key={shift}>{shift[0]} {r.uncoveredProbability.toFixed(0)}%</span>
            })}</div>
          </div>)}
        </div>)}
      </div>
    </GlassPanel>
  </section>
}
