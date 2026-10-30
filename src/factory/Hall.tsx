import * as THREE from 'three'
import { FLOOR } from './layout'
import { palette } from './materials'

export function Hall(){
  const trusses=Array.from({length:7},(_,i)=>-FLOOR.depth/2+i*(FLOOR.depth/6))
  const columns=[-FLOOR.width/2+1.1,FLOOR.width/2-1.1]
  return <group>
    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,0,0]}>
      <planeGeometry args={[FLOOR.width,FLOOR.depth]}/>
      <meshStandardMaterial color={palette.floor} roughness={.56} metalness={.12}/>
    </mesh>
    <gridHelper args={[24,24,palette.floorLine,palette.floorLine]} position={[0,.012,0]}/>
    {trusses.map((z,i)=><group key={i}>
      <mesh position={[0,FLOOR.height,z]} castShadow>
        <boxGeometry args={[FLOOR.width-.6,.16,.16]}/>
        <meshStandardMaterial color={palette.steel} metalness={.75} roughness={.3}/>
      </mesh>
      {columns.map((x,j)=><mesh key={j} position={[x,FLOOR.height/2,z]} castShadow>
        <boxGeometry args={[.18,FLOOR.height,.18]}/>
        <meshStandardMaterial color={palette.steelDark} metalness={.75} roughness={.34}/>
      </mesh>)}
    </group>)}
    {[-FLOOR.depth/2,FLOOR.depth/2].map((z,side)=><group key={side}>
      {Array.from({length:8},(_,i)=><mesh key={i} position={[-10.5+i*3,3.7,z+(side?-.03:.03)]}>
        <planeGeometry args={[2.45,4.7]}/>
        <meshPhysicalMaterial color={palette.glass} transparent opacity={.16} roughness={.18} transmission={.12} side={THREE.DoubleSide}/>
      </mesh>)}
    </group>)}
    <mesh position={[0,6.9,0]} rotation={[Math.PI/2,0,0]}>
      <planeGeometry args={[FLOOR.width,FLOOR.depth]}/>
      <meshStandardMaterial color="#080c10" roughness={.8} side={THREE.DoubleSide}/>
    </mesh>
  </group>
}
