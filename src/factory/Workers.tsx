import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { palette } from './materials'

function Worker({position,accent=false,walking=false}:{position:[number,number,number];accent?:boolean;walking?:boolean}){
  const g=useRef<THREE.Group>(null)
  useFrame(({clock})=>{
    if(!g.current) return
    const t=clock.elapsedTime
    g.current.rotation.y=Math.sin(t*.8+position[0])*.08
    if(walking) g.current.position.z=position[2]+Math.sin(t*.7)*1.4
  })
  const body=accent?palette.accent:'#a8b6c0'
  return <group ref={g} position={position} scale={.72}>
    <mesh castShadow position={[0,1.2,0]}><cylinderGeometry args={[.23,.27,.95,12]}/><meshStandardMaterial color={body} roughness={.55}/></mesh>
    <mesh castShadow position={[0,1.95,0]}><sphereGeometry args={[.28,16,12]}/><meshStandardMaterial color="#c8b8a7" roughness={.7}/></mesh>
    <mesh castShadow position={[0,2.2,0]} scale={[1,.45,1]}><sphereGeometry args={[.31,16,8]}/><meshStandardMaterial color={accent?palette.accent:'#d5aa2d'} roughness={.4}/></mesh>
    {[-.14,.14].map((x,i)=><mesh key={i} castShadow position={[x,.4,0]}><cylinderGeometry args={[.09,.1,.72,10]}/><meshStandardMaterial color="#596772"/></mesh>)}
  </group>
}

export function StationWorkers({positions,focusIndex,heal}:{positions:[number,number,number][];focusIndex:number;heal:boolean}){
  return <group>
    {positions.map((p,i)=><Worker key={i} position={[p[0]+(i%2 ? .8 : -.8),0,p[2]+.9]} accent={i===focusIndex&&heal}/>)}
    {heal&&<Worker position={[positions[focusIndex][0]-2.6,0,positions[focusIndex][2]-2]} accent walking/>}
  </group>
}
