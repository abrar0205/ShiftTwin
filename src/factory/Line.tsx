import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RepresentativeTrial } from '../sim/types'
import { stationPosition } from './layout'
import { palette } from './materials'
import { Andon } from './Andon'

function Car({index,speed,queue}:{index:number;speed:number;queue:number}){
  const ref=useRef<THREE.Group>(null)
  const lane=index%2
  useFrame(({clock})=>{
    if(!ref.current) return
    const span=19
    const raw=((clock.elapsedTime*Math.max(.14,speed)*1.7+index*2.65)%span)-span/2
    const hold=Math.max(-2.2,Math.min(2.2,raw))
    ref.current.position.x=queue>0 && raw>1 ? 1-Math.min(queue,4)*.32 : raw
    ref.current.position.z=lane?1.15:-1.15
  })
  return <group ref={ref} position={[0,.36,0]} scale={.68}>
    <mesh castShadow><boxGeometry args={[2.15,.48,1.02]}/><meshPhysicalMaterial color={palette.car} metalness={.42} roughness={.27} clearcoat={.75}/></mesh>
    <mesh castShadow position={[.05,.39,0]}><boxGeometry args={[1.18,.38,.86]}/><meshPhysicalMaterial color="#557083" metalness={.2} roughness={.15} transmission={.08}/></mesh>
    {[-.7,.7].flatMap(x=>[-.54,.54].map((z,j)=><mesh key={`${x}-${j}`} position={[x,-.2,z]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.19,.19,.12,14]}/><meshStandardMaterial color="#11161a" roughness={.8}/></mesh>))}
  </group>
}

export function Line({trial,focusIndex,healing}:{trial:RepresentativeTrial;focusIndex:number;healing:boolean}){
  const stations=trial.stations
  const speed=Math.max(.12,trial.lineRateJPH/Math.max(1,trial.targetLineRateJPH))
  const queue=stations[focusIndex]?.deficit??0
  const positions=useMemo(()=>stations.map((_,i)=>stationPosition(i)),[stations])

  return <group>
    {[-1.15,1.15].map(z=><mesh key={z} position={[0,.09,z]} receiveShadow>
      <boxGeometry args={[21,.16,.82]}/>
      <meshStandardMaterial color="#1a232a" metalness={.35} roughness={.48}/>
    </mesh>)}
    {Array.from({length:9},(_,i)=><Car key={i} index={i} speed={speed} queue={queue}/>)}
    {positions.map((p,i)=>{
      const state=stations[i]
      const tone=state.status==='staffed'?palette.ready:state.status==='short'?palette.watch:palette.risk
      return <group key={state.stationId} position={p}>
        <mesh receiveShadow>
          <boxGeometry args={[3.65,.18,3.45]}/>
          <meshStandardMaterial color={i===focusIndex?'#1b2933':'#161d23'} metalness={.18} roughness={.56}/>
        </mesh>
        <mesh position={[0,.105,0]} rotation={[-Math.PI/2,0,0]}>
          <ringGeometry args={[1.42,1.52,40]}/>
          <meshBasicMaterial color={tone} transparent opacity={i===focusIndex ? .9 : .18} toneMapped={false}/>
        </mesh>
        {i===focusIndex&&<pointLight position={[0,2.8,0]} color={healing?palette.ready:tone} intensity={healing?18:12} distance={5.2}/>}
        <Andon position={[0,0,0]} status={state.status} focus={i===focusIndex}/>
      </group>
    })}
  </group>
}
