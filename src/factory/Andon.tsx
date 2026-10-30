import { palette } from './materials'

export function Andon({position,status,focus=false}:{position:[number,number,number];status:'staffed'|'short'|'uncovered';focus?:boolean}){
  const color=status==='staffed'?palette.ready:status==='short'?palette.watch:palette.risk
  return <group position={[position[0]+1.45,2.3,position[2]-1.15]}>
    <mesh castShadow>
      <cylinderGeometry args={[.09,.09,2,12]}/>
      <meshStandardMaterial color="#222b32" metalness={.65} roughness={.38}/>
    </mesh>
    <mesh position={[0,1.05,0]}>
      <boxGeometry args={[.42,.25,.42]}/>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={focus?3.2:1.8}/>
    </mesh>
    {focus&&<pointLight position={[0,1.05,0]} color={color} intensity={10} distance={3.5}/>}
  </group>
}
