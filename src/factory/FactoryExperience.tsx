import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import type { RepresentativeTrial, Shift } from '../sim/types'
import { bottleneckIndex, stationPosition } from './layout'
import { Hall } from './Hall'
import { Lighting } from './Lighting'
import { Line } from './Line'
import { Robots } from './Robots'
import { StationWorkers } from './Workers'
import { Labels } from './Labels'
import { FactoryCamera } from './Camera'
import { Effects } from './Effects'

export default function FactoryExperience({
  trial,mode,reducedMotion,shift,
}:{
  trial:RepresentativeTrial
  mode:'idle'|'run'|'heal'
  reducedMotion:boolean
  shift:Shift
}){
  const focusIndex=bottleneckIndex(trial.stations)
  const positions=trial.stations.map((_,i)=>stationPosition(i))
  return <Canvas
    className="factory-canvas"
    shadows
    dpr={[1,1.75]}
    camera={{position:[13,10,16],fov:34,near:.1,far:80}}
    gl={{antialias:true,powerPreference:'high-performance'}}
  >
    <Effects/>
    <Lighting night={shift==='Night'}/>
    <Hall/>
    <Line trial={trial} focusIndex={focusIndex} healing={mode==='heal'}/>
    <Robots positions={positions}/>
    <StationWorkers positions={positions} focusIndex={focusIndex} heal={mode==='heal'}/>
    <Labels stations={trial.stations} focusIndex={focusIndex}/>
    <FactoryCamera focusIndex={focusIndex} mode={mode} reducedMotion={reducedMotion}/>
    <AdaptiveDpr pixelated={false}/>
    <Preload all/>
  </Canvas>
}
