import { Html } from '@react-three/drei'
import type { TrialStationState } from '../sim/types'
import { stationPosition } from './layout'

export function Labels({stations,focusIndex}:{stations:TrialStationState[];focusIndex:number}){
  return <group>{stations.map((station,i)=>{
    const p=stationPosition(i)
    return <Html key={station.stationId} position={[p[0],2.75,p[2]]} center distanceFactor={9} occlude={false}>
      <div className={`factory-node-label ${station.status} ${i===focusIndex?'focus':''}`}>
        <b>{String(i+1).padStart(2,'0')}</b>
        <span>{station.stationName}</span>
        <small>{station.assigned}/{station.required} · {(station.throughputFactor*100).toFixed(0)}%</small>
      </div>
    </Html>
  })}</group>
}
