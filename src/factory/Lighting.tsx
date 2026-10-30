import { palette } from './materials'

export function Lighting({night}:{night:boolean}){
  return <>
    <ambientLight intensity={night?.35:.55}/>
    <hemisphereLight args={[night?'#6682a8':'#b7d3df','#15191d',night?.45:.72]}/>
    <directionalLight position={[8,12,5]} intensity={night?1.05:1.75} castShadow shadow-mapSize={[1536,1536]} shadow-camera-far={35}/>
    <pointLight position={[-8,5,-3]} color={palette.accent} intensity={night?24:13} distance={16}/>
    <pointLight position={[8,4.5,4]} color={night?'#5d72ff':'#ffe0b8'} intensity={night?18:10} distance={15}/>
  </>
}
