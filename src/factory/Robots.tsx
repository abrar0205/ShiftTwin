import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { palette } from './materials'

function Robot({position,phase=0}:{position:[number,number,number];phase?:number}){
  const shoulder=useRef<THREE.Group>(null), elbow=useRef<THREE.Group>(null)
  useFrame(({clock})=>{
    const t=clock.elapsedTime*1.25+phase
    if(shoulder.current) shoulder.current.rotation.z=-.55+Math.sin(t)*.35
    if(elbow.current) elbow.current.rotation.z=.9+Math.sin(t+1.2)*.42
  })
  return <group position={position} scale={.72}>
    <mesh castShadow position={[0,.18,0]}><cylinderGeometry args={[.46,.58,.36,18]}/><meshStandardMaterial color={palette.steel} metalness={.78} roughness={.3}/></mesh>
    <group ref={shoulder} position={[0,.5,0]}>
      <mesh castShadow position={[0,.7,0]}><boxGeometry args={[.34,1.45,.38]}/><meshStandardMaterial color="#d8a72d" metalness={.42} roughness={.36}/></mesh>
      <group ref={elbow} position={[0,1.35,0]}>
        <mesh castShadow position={[0,.62,0]}><boxGeometry args={[.3,1.25,.34]}/><meshStandardMaterial color="#d8a72d" metalness={.42} roughness={.36}/></mesh>
        <mesh position={[0,1.28,0]}><sphereGeometry args={[.17,12,8]}/><meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={1.8}/></mesh>
      </group>
    </group>
  </group>
}

export function Robots({positions}:{positions:[number,number,number][]}){
  return <group>{positions.slice(0,4).map((p,i)=><Robot key={i} position={[p[0]+1.15,.15,p[2]-1.2]} phase={i*.7}/>)}</group>
}
