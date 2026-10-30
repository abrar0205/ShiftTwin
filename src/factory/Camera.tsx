import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { stationPosition } from './layout'
import { HEAL_SEQUENCE, RUN_SEQUENCE, SHOTS, type ShotName } from './shots'

function requestedShot():ShotName|null{
  if(typeof window==='undefined') return null
  const value=new URLSearchParams(window.location.search).get('shot')
  return value && value in SHOTS ? value as ShotName : null
}

export function FactoryCamera({focusIndex,mode,reducedMotion}:{focusIndex:number;mode:'idle'|'run'|'heal';reducedMotion:boolean}){
  const controls=useRef<any>(null)
  const {camera,size}=useThree()
  const timers=useRef<number[]>([])
  const focus=stationPosition(focusIndex)

  const go=(name:ShotName,smooth=true)=>{
    const shot=SHOTS[name]
    const portrait=size.height>size.width
    const scale=portrait?1.42:1
    const target=name==='establishing'||name==='craneIn'||name==='pullBack'?[0,.5,0] as [number,number,number]:focus
    const ox=shot.offset[0]*(portrait?1.18:1)
    const oy=shot.offset[1]*scale
    const oz=shot.offset[2]*scale
    if(camera instanceof THREE.PerspectiveCamera){
      camera.fov=portrait ? Math.max(shot.fov,36) : shot.fov
      camera.updateProjectionMatrix()
    }
    void controls.current?.setLookAt(
      target[0]+ox,target[1]+oy,target[2]+oz,
      target[0]+shot.targetOffset[0],target[1]+shot.targetOffset[1],target[2]+shot.targetOffset[2],
      smooth&&!reducedMotion,
    )
  }

  useEffect(()=>{
    const direct=requestedShot()
    if(direct){ go(direct,false); return }
    try{
      if(!sessionStorage.getItem('shifttwin-crane')){
        sessionStorage.setItem('shifttwin-crane','1')
        go('craneIn',false)
        const id=window.setTimeout(()=>go('establishing',true),220)
        timers.current.push(id)
      }else go('establishing',false)
    }catch{ go('establishing',false) }
    return ()=>timers.current.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{
    timers.current.forEach(clearTimeout); timers.current=[]
    controls.current && (controls.current.enabled=mode==='idle')
    if(requestedShot()){ controls.current && (controls.current.enabled=false); return }
    if(mode==='idle'){ go('establishing',true); return }
    const sequence=mode==='run'?RUN_SEQUENCE:HEAL_SEQUENCE
    let elapsed=0
    sequence.forEach((name,index)=>{
      const id=window.setTimeout(()=>go(name,index!==0||!reducedMotion),reducedMotion?index*160:elapsed)
      timers.current.push(id)
      elapsed+=reducedMotion?160:SHOTS[name].duration*1000
    })
    return ()=>timers.current.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,focusIndex,reducedMotion,size.width,size.height])

  return <CameraControls ref={controls} makeDefault smoothTime={.72} draggingSmoothTime={.18} dollyToCursor={false} minDistance={5} maxDistance={34}/>
}
