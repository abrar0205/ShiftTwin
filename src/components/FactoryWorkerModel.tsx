import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { carAtStation, type LineMotionState } from '../sim/factoryMotion'

const BASE=import.meta.env.BASE_URL
const WORKER_URL=`${BASE}models/worker.glb`
const MOVEMENT_URL=`${BASE}models/worker-movement.glb`
const GENERAL_URL=`${BASE}models/worker-general.glb`

function filteredClips(clips: THREE.AnimationClip[], root: THREE.Object3D) {
  const names=new Set<string>()
  root.traverse(node=>names.add(node.name))
  return clips.map(source=>{
    const clip=source.clone()
    clip.tracks=clip.tracks.filter(track=>names.has(track.name.split('.')[0]))
    return clip
  }).filter(clip=>clip.tracks.length>0)
}

function prepareWorker(source: THREE.Object3D, lapsed: boolean, accent: boolean) {
  const root=cloneSkeleton(source)
  const tint=new THREE.Color(accent ? '#9fe6ff' : lapsed ? '#737d85' : '#b8c3cc')
  root.traverse(object=>{
    const mesh=object as THREE.Mesh
    if(!mesh.isMesh) return
    mesh.castShadow=true
    mesh.receiveShadow=true
    const materials=Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned=materials.map(material=>{
      const next=material.clone()
      if(next instanceof THREE.MeshStandardMaterial){
        next.color.lerp(tint,accent ? .45 : lapsed ? .68 : .28)
        next.roughness=lapsed ? .72 : .48
        next.metalness=Math.min(.12,next.metalness)
        if(accent){
          next.emissive=new THREE.Color('#2c8eb8')
          next.emissiveIntensity=.22
        }
      }
      return next
    })
    mesh.material=Array.isArray(mesh.material) ? cloned : cloned[0]
  })
  return root
}

function useFactoryWorker(lapsed=false,accent=false){
  const model=useGLTF(WORKER_URL)
  const movement=useGLTF(MOVEMENT_URL)
  const general=useGLTF(GENERAL_URL)
  const root=useMemo(()=>prepareWorker(model.scene,lapsed,accent),[model.scene,lapsed,accent])
  const clips=useMemo(
    ()=>filteredClips([...movement.animations,...general.animations],root),
    [movement.animations,general.animations,root],
  )
  return {root,clips}
}

function useClipDirector(
  clips:THREE.AnimationClip[],
  rootRef:MutableRefObject<THREE.Group|null>,
  select:()=>string,
){
  const {actions}=useAnimations(clips,rootRef)
  const active=useRef('')

  useFrame(()=>{
    const name=select()
    if(name===active.current) return
    const next=actions[name]
    if(!next) return
    const previous=active.current ? actions[active.current] : undefined
    previous?.fadeOut(.18)
    next.reset().fadeIn(.18).play()
    active.current=name
  })

  useEffect(()=>()=>Object.values(actions).forEach(action=>action?.stop()),[actions])
}

function SafetyHelmet({accent=false,lapsed=false}:{accent?:boolean;lapsed?:boolean}){
  const color=accent?'#5cc8ff':lapsed?'#7d8388':'#d6a72d'
  return <group position={[0,2.14,0]}>
    <mesh scale={[1,.55,1]} castShadow>
      <sphereGeometry args={[.22,12,8]}/>
      <meshStandardMaterial color={color} roughness={.48} metalness={.08}/>
    </mesh>
    <mesh position={[0,-.075,.08]} scale={[1.35,.35,.65]} castShadow>
      <cylinderGeometry args={[.18,.2,.09,14]}/>
      <meshStandardMaterial color={color} roughness={.48} metalness={.08}/>
    </mesh>
  </group>
}

export function StationWorkerModel({
  position,
  rotationY,
  stationIndex,
  motionRef,
  lapsed=false,
}:{
  position:[number,number,number]
  rotationY:number
  stationIndex:number
  motionRef:MutableRefObject<LineMotionState>
  lapsed?:boolean
}){
  const group=useRef<THREE.Group>(null)
  const {root,clips}=useFactoryWorker(lapsed,false)
  useClipDirector(clips,group,()=>{
    if(lapsed) return 'Idle_B'
    const car=carAtStation(motionRef.current,stationIndex)
    return car && !car.moving ? 'Interact' : 'Idle_A'
  })

  return <group
    ref={group}
    position={[position[0],.075,position[2]]}
    rotation={[0,rotationY,0]}
    scale={.44}
  >
    <primitive object={root}/>
    <SafetyHelmet lapsed={lapsed}/>
  </group>
}

export function HealWorkerModel({
  groupRef,
  week,
}:{
  groupRef:MutableRefObject<THREE.Group|null>
  week:number | null
}){
  const {root,clips}=useFactoryWorker(false,true)
  useClipDirector(clips,groupRef,()=> 'Walking_A')

  return <group ref={groupRef} scale={.44} visible={false}>
    <primitive object={root}/>
    <SafetyHelmet accent/>
    <mesh position={[0,.08,0]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[.36,.46,28]}/>
      <meshBasicMaterial color="#5cc8ff" transparent opacity={.65} depthWrite={false} toneMapped={false}/>
    </mesh>
    {week != null && <Html position={[0,2.75,0]} center distanceFactor={7} occlude={false}>
      <div className="heal-week-chip">WEEK {week}</div>
    </Html>}
  </group>
}

useGLTF.preload(WORKER_URL)
useGLTF.preload(MOVEMENT_URL)
useGLTF.preload(GENERAL_URL)
