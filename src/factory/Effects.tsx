import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

export function Effects(){
  const {scene,gl}=useThree()
  useEffect(()=>{
    scene.fog=new THREE.FogExp2('#070b0f',.026)
    gl.toneMapping=THREE.AgXToneMapping
    gl.toneMappingExposure=1.12
    return ()=>{ scene.fog=null }
  },[scene,gl])
  return null
}
