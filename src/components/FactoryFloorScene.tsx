import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementRef, type MutableRefObject } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, MeshReflectorMaterial, OrbitControls, PerformanceMonitor, useGLTF } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { generatePlant } from '../sim/plant'
import { HealWorkerModel, StationWorkerModel } from './FactoryWorkerModel'
import {
  advanceLineMotion,
  CAR_MOVE_SECONDS,
  carAtStation,
  carMoveProgress,
  createLineMotion,
  easeInOutCubic,
  queueCompression,
  stationIsStarved,
  type LineMotionState,
} from '../sim/factoryMotion'
import type { RepresentativeTrial, Shift, SimResult, Station, TrialStationState } from '../sim/types'

const STATUS = {
  ready: { color: '#3ddc97', label: 'staffed' },
  watch: { color: '#f5b841', label: 'short by 1' },
  risk: { color: '#ff5d5d', label: 'short by 2+' },
} as const

const PAINTS = ['#4f555b','#d9d9d3','#1d3850','#a7adb1']
const BODY_IN_WHITE = '#c3c8cb'
const MOBILE_QUERY = '(max-width: 820px)'
const CAR_URL = `${import.meta.env.BASE_URL}models/sedan.glb`

type Tone = keyof typeof STATUS
type MotionRef = MutableRefObject<LineMotionState>
type SequenceKind = 'idle' | 'run' | 'heal'
interface SceneSequence {
  kind: SequenceKind
  active: boolean
  progress: number
  elapsed: number
}
type SequenceRef = MutableRefObject<SceneSequence>
type OrbitRef = MutableRefObject<ElementRef<typeof OrbitControls> | null>

const COLOR_CACHE = {
  background: {
    Early: new THREE.Color('#101a22'),
    Late: new THREE.Color('#20150d'),
    Night: new THREE.Color('#04070a'),
  },
  ambient: {
    Early: new THREE.Color('#b9dcf0'),
    Late: new THREE.Color('#d8b08b'),
    Night: new THREE.Color('#40576a'),
  },
  key: {
    Early: new THREE.Color('#d8efff'),
    Late: new THREE.Color('#ffd09a'),
    Night: new THREE.Color('#82acd0'),
  },
  fill: {
    Early: new THREE.Color('#8ec6e6'),
    Late: new THREE.Color('#d47d4f'),
    Night: new THREE.Color('#35536b'),
  },
  cell: {
    ready: new THREE.Color('#10161a'),
    watch: new THREE.Color('#171611'),
    risk: new THREE.Color('#171214'),
    starved: new THREE.Color('#080b0e'),
  },
} as const

function toneForStation(station: TrialStationState): Tone {
  return station.status === 'staffed' ? 'ready' : station.status === 'short' ? 'watch' : 'risk'
}

const lighting = {
  Early: { background: '#101a22', ambient: '#b9dcf0', key: '#d8efff', fill: '#8ec6e6', intensity: 3.3 },
  Late: { background: '#20150d', ambient: '#d8b08b', key: '#ffd09a', fill: '#d47d4f', intensity: 2.8 },
  Night: { background: '#04070a', ambient: '#40576a', key: '#82acd0', fill: '#35536b', intensity: 1.45 },
} as const

function boostedColor(hex: string, intensity: number) {
  return new THREE.Color(hex).multiplyScalar(intensity)
}

function LocalLightformer({
  intensity,
  color = '#ffffff',
  position,
  rotation,
  scale,
}: {
  intensity: number
  color?: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}) {
  return <mesh position={position} rotation={rotation} scale={scale}>
    <planeGeometry args={[1,1]}/>
    <meshBasicMaterial color={boostedColor(color,intensity)} side={THREE.DoubleSide} toneMapped={false}/>
  </mesh>
}

function LocalEnvironment() {
  const gl = useThree(state => state.gl)
  const mainScene = useThree(state => state.scene)
  const [environmentScene] = useState(() => {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#10151a')
    return scene
  })
  const [renderTarget] = useState(() => new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  }))
  const [cubeCamera] = useState(() => new THREE.CubeCamera(.1,100,renderTarget))

  useLayoutEffect(() => {
    cubeCamera.update(gl,environmentScene)
    const previous = mainScene.environment
    mainScene.environment = renderTarget.texture
    return () => {
      if (mainScene.environment === renderTarget.texture) mainScene.environment = previous
      renderTarget.dispose()
    }
  }, [cubeCamera,environmentScene,gl,mainScene,renderTarget])

  return createPortal(
    <>
      <LocalLightformer intensity={2.2} position={[0,9,0]} rotation={[Math.PI/2,0,0]} scale={[40,6,1]}/>
      <LocalLightformer intensity={0.8} position={[-20,4,0]} rotation={[0,Math.PI/2,0]} scale={[20,4,1]} color="#9cc9ff"/>
      <LocalLightformer intensity={0.6} position={[20,4,0]} rotation={[0,-Math.PI/2,0]} scale={[20,4,1]} color="#ffd2a1"/>
    </>,
    environmentScene,
  )
}

function MotionController({
  trial,
  previousTrial,
  healTrial,
  motionRef,
  sequenceRef,
  runId,
  healId,
  skipId,
  reducedMotion,
}: {
  trial: RepresentativeTrial
  previousTrial: RepresentativeTrial | null
  healTrial: RepresentativeTrial | null
  motionRef: MotionRef
  sequenceRef: SequenceRef
  runId: number
  healId: number
  skipId: number
  reducedMotion: boolean
}) {
  const lastRun = useRef(0)
  const lastHeal = useRef(0)
  const lastSkip = useRef(skipId)

  useEffect(() => {
    if (!runId || runId === lastRun.current) return
    lastRun.current = runId
    motionRef.current = createLineMotion(previousTrial ?? trial)
    sequenceRef.current = {
      kind: 'run',
      active: !reducedMotion,
      progress: reducedMotion ? 1 : 0,
      elapsed: reducedMotion ? 3.5 : 0,
    }
  }, [runId, motionRef, previousTrial, reducedMotion, sequenceRef, trial])

  useEffect(() => {
    if (!healId || healId === lastHeal.current) return
    lastHeal.current = healId
    sequenceRef.current = {
      kind: 'heal',
      active: !reducedMotion,
      progress: reducedMotion ? 1 : 0,
      elapsed: reducedMotion ? 3.3 : 0,
    }
  }, [healId, reducedMotion, sequenceRef])

  useEffect(() => {
    if (skipId === lastSkip.current) return
    lastSkip.current = skipId
    const current = sequenceRef.current
    if (!current.active) return
    current.progress = 1
    current.active = false
    current.elapsed = current.kind === 'heal' ? 3.3 : 3.5
  }, [sequenceRef, skipId])

  useEffect(() => {
    if (sequenceRef.current.active) return
    motionRef.current = createLineMotion(trial)
  }, [trial, motionRef, sequenceRef])

  useFrame((_state, delta) => {
    const seq = sequenceRef.current
    if (seq.active) {
      seq.elapsed += delta
      const duration = seq.kind === 'heal' ? 3.3 : 3.5
      seq.progress = Math.min(1, seq.elapsed / duration)
      if (seq.progress >= 1) seq.active = false
    }

    if (reducedMotion) return

    let activeTrial = trial
    if (seq.kind === 'run' && seq.progress < .30 && previousTrial) activeTrial = previousTrial
    if (seq.kind === 'heal' && seq.progress >= .52 && healTrial) activeTrial = healTrial
    advanceLineMotion(motionRef.current, activeTrial, delta)
  }, -100)

  return null
}

function ShiftLighting({
  shift,
  reducedMotion,
  focus,
  sequenceRef,
}: {
  shift: Shift
  reducedMotion: boolean
  focus: boolean
  sequenceRef: SequenceRef
}) {
  const ambient = useRef<THREE.AmbientLight>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const nightPools = useRef<Array<THREE.PointLight | null>>([])
  const { scene } = useThree()

  useEffect(() => {
    if (!scene.background) scene.background = COLOR_CACHE.background[shift].clone()
  }, [scene, shift])

  useFrame((_state, delta) => {
    const cfg = lighting[shift]
    const colors = {
      background: COLOR_CACHE.background[shift],
      ambient: COLOR_CACHE.ambient[shift],
      key: COLOR_CACHE.key[shift],
      fill: COLOR_CACHE.fill[shift],
    }
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-4.5 * delta)
    const seq = sequenceRef.current
    const healLift = seq.kind === 'heal'
      ? Math.max(0, Math.min(1, (seq.progress - .50) / .42))
      : 0
    const focusFactor = focus ? .65 + .35 * healLift : 1

    const bg = scene.background instanceof THREE.Color ? scene.background : COLOR_CACHE.background[shift].clone()
    bg.lerp(colors.background, alpha)
    scene.background = bg

    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.lerp(ambient.current.intensity, cfg.intensity * .58 * focusFactor, alpha)
      ambient.current.color.lerp(colors.ambient, alpha)
    }
    if (key.current) {
      key.current.intensity = THREE.MathUtils.lerp(key.current.intensity, cfg.intensity * focusFactor, alpha)
      key.current.color.lerp(colors.key, alpha)
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.lerp(fill.current.intensity, cfg.intensity * .46 * focusFactor, alpha)
      fill.current.color.lerp(colors.fill, alpha)
    }

    const targetPool = shift === 'Night' ? .95 : .08
    for (const pool of nightPools.current) {
      if (pool) pool.intensity = THREE.MathUtils.lerp(pool.intensity,targetPool * focusFactor,alpha)
    }
  })

  return <>
    <ambientLight ref={ambient} intensity={1.4} color={lighting[shift].ambient}/>
    <directionalLight
      ref={key}
      position={shift === 'Late' ? [16,9,10] : [8,16,10]}
      intensity={3}
      color={lighting[shift].key}
      castShadow
      shadow-mapSize={[1024,1024]}
    />
    <directionalLight ref={fill} position={[-12,8,-8]} intensity={1.2} color={lighting[shift].fill}/>
    {[-15,-9,-3,3,9,15].map((x,index) =>
      <pointLight
        key={x}
        ref={light => { nightPools.current[index]=light }}
        position={[x,4.5,0]}
        intensity={shift === 'Night' ? .95 : .08}
        distance={7}
        decay={2}
        color="#8cbce2"
      />
    )}
  </>
}

function FactoryHall({mobile,night}:{mobile:boolean;night:boolean}){
  const columns=useMemo(()=>[-18,-12,-6,0,6,12,18],[])
  const windows=useMemo(()=>[-18,-13.5,-9,-4.5,0,4.5,9,13.5,18],[])

  return <group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]} receiveShadow>
      <planeGeometry args={[46,18]}/>
      {mobile ? <meshStandardMaterial color="#101419" roughness={.66} metalness={.16}/> :
        <MeshReflectorMaterial
          color="#11161b"
          roughness={.54}
          metalness={.18}
          mirror={.16}
          mixBlur={1.2}
          mixStrength={8}
          blur={[260,90]}
          resolution={512}
          depthScale={.65}
          minDepthThreshold={.55}
          maxDepthThreshold={1.4}
        />}
    </mesh>

    <mesh position={[0,3.8,-8.15]} receiveShadow>
      <boxGeometry args={[46,7.6,.34]}/>
      <meshStandardMaterial color={night?'#0b1016':'#171d22'} roughness={.76} metalness={.16}/>
    </mesh>

    <mesh position={[-22.65,3.6,-.5]} receiveShadow>
      <boxGeometry args={[.3,7.2,15.5]}/>
      <meshStandardMaterial color="#12181d" roughness={.74} metalness={.18}/>
    </mesh>

    {windows.map(x=><mesh key={`window-${x}`} position={[x,5.12,-7.95]}>
      <boxGeometry args={[3.6,1.15,.05]}/>
      <meshStandardMaterial
        color={night?'#24445d':'#718b99'}
        emissive={night?'#173c59':'#44545c'}
        emissiveIntensity={night?.82:.18}
        roughness={.19}
        metalness={.12}
      />
    </mesh>)}

    <mesh position={[0,3.05,-7.48]} receiveShadow>
      <boxGeometry args={[45,.14,1.25]}/>
      <meshStandardMaterial color="#20272d" roughness={.58} metalness={.46}/>
    </mesh>
    <mesh position={[0,3.72,-6.95]}>
      <boxGeometry args={[45,.06,.06]}/>
      <meshStandardMaterial color="#65717a" roughness={.46} metalness={.62}/>
    </mesh>

    {columns.map(x=><group key={`column-${x}`}>
      <mesh position={[x,3.45,-6.75]} castShadow receiveShadow>
        <boxGeometry args={[.24,6.9,.24]}/>
        <meshStandardMaterial color="#4c555d" roughness={.48} metalness={.58}/>
      </mesh>
      <mesh position={[x,6.9,0]} castShadow>
        <boxGeometry args={[.18,.18,13.7]}/>
        <meshStandardMaterial color="#394149" roughness={.46} metalness={.64}/>
      </mesh>
      <mesh position={[x,6.92,-6.55]} rotation={[0,0,.77]} castShadow>
        <boxGeometry args={[4.8,.11,.11]}/>
        <meshStandardMaterial color="#394149" roughness={.46} metalness={.64}/>
      </mesh>
      <mesh position={[x,6.92,6.55]} rotation={[0,0,-.77]} castShadow>
        <boxGeometry args={[4.8,.11,.11]}/>
        <meshStandardMaterial color="#394149" roughness={.46} metalness={.64}/>
      </mesh>
    </group>)}

    {[-5.6,5.6].map(z=><group key={z}>
      {[-20,-10,0,10,20].map(x=><mesh key={x} position={[x,.055,z]}>
        <boxGeometry args={[7.2,.018,.05]}/>
        <meshBasicMaterial color="#aa882d" transparent opacity={.48}/>
      </mesh>)}
    </group>)}
  </group>
}

function AreaZone({ x, label }: { x: number; label: string }) {
  return <group position={[x,0,0]}>
    <mesh position={[0,.045,-3.75]}>
      <boxGeometry args={[10.1,.025,.06]}/>
      <meshBasicMaterial color="#d3a72f" transparent opacity={.62}/>
    </mesh>
    <mesh position={[0,.045,3.75]}>
      <boxGeometry args={[10.1,.025,.06]}/>
      <meshBasicMaterial color="#d3a72f" transparent opacity={.62}/>
    </mesh>
    <Html position={[-4.65,.07,-3.3]} transform distanceFactor={13} occlude={false}>
      <div className="factory-area-label">{label}</div>
    </Html>
  </group>
}

function resolveAndonTone(
  finalTone: Tone,
  stationIndex: number,
  bottleneck: boolean,
  healState: TrialStationState | null,
  sequence: SceneSequence,
): Tone {
  if (sequence.kind === 'run') {
    const revealAt = .20 + stationIndex * .018
    if (sequence.progress < revealAt) return 'ready'
  }

  if (sequence.kind === 'heal' && bottleneck) {
    if (sequence.progress < .40) return finalTone
    if (sequence.progress < .64) return 'watch'
    return healState ? toneForStation(healState) : finalTone
  }

  return finalTone
}

function AndonBeacon({
  tone,
  redLight,
  motionRef,
  sequenceRef,
  stationIndex,
  bottleneck,
  healState,
}: {
  tone: Tone
  redLight: boolean
  motionRef: MotionRef
  sequenceRef: SequenceRef
  stationIndex: number
  bottleneck: boolean
  healState: TrialStationState | null
}) {
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  const rotor = useRef<THREE.Group>(null)
  const floorLight = useRef<THREE.PointLight>(null)

  useFrame(() => {
    const t = motionRef.current.time
    const visualTone = resolveAndonTone(tone,stationIndex,bottleneck,healState,sequenceRef.current)
    const color = STATUS[visualTone].color

    if (lamp.current) {
      lamp.current.color.set(color)
      lamp.current.emissive.set(color)
      lamp.current.emissiveIntensity = visualTone === 'ready'
        ? 3.2
        : visualTone === 'watch'
          ? 2.2 + (Math.sin(t * 2.3) + 1) * 1.15
          : 4.8 + (Math.sin(t * 7.5) + 1) * .55
    }
    if (rotor.current) {
      rotor.current.visible = visualTone === 'risk'
      rotor.current.rotation.y = t * 5.8
    }
    if (floorLight.current) floorLight.current.intensity = visualTone === 'risk'
      ? 1.0 + (Math.sin(t * 6.5) + 1) * .45
      : 0
  })

  const color = STATUS[tone].color
  const scale = bottleneck ? 1.55 : 1
  return <group scale={scale}>
    <mesh castShadow>
      <sphereGeometry args={[.13,14,10]}/>
      <meshStandardMaterial
        ref={lamp}
        color={color}
        emissive={color}
        emissiveIntensity={tone === 'risk' ? 5 : 3.2}
        toneMapped={false}
      />
    </mesh>
    <group ref={rotor} visible={tone === 'risk'}>
      <mesh position={[0,0,.19]} rotation={[Math.PI/2,0,0]}>
        <coneGeometry args={[.11,.42,12,1,true]}/>
        <meshBasicMaterial color="#ff4e4e" transparent opacity={.16} side={THREE.DoubleSide} depthWrite={false}/>
      </mesh>
    </group>
    {redLight && <pointLight ref={floorLight} position={[0,-1.9,0]} color="#ff3f3f" distance={3.2} decay={2} intensity={1.1}/>}
  </group>
}

function StarvationLayer({
  xs,
  motionRef,
  trial,
}: {
  xs: number[]
  motionRef: MotionRef
  trial: RepresentativeTrial
}) {
  const refs = useRef<Array<HTMLDivElement | null>>([])

  useFrame(() => {
    for (let index=0; index<refs.current.length; index++) {
      const node = refs.current[index]
      if (!node) continue
      const visible = stationIsStarved(motionRef.current,trial,index)
      node.style.opacity = visible ? '1' : '0'
      node.style.transform = visible ? 'translateY(0)' : 'translateY(4px)'
    }
  })

  return <>
    {trial.stations.map((station,index)=><Html
      key={station.stationId}
      position={[xs[index],1.78,.45]}
      center
      distanceFactor={12}
      occlude={false}
    >
      <div ref={node=>{refs.current[index]=node}} className="factory-starved-chip">STARVED</div>
    </Html>)}
  </>
}

function Workcell({
  station,
  stationIndex,
  x,
  state,
  aggregateRisk,
  redLight,
  motionRef,
  trial,
  sequenceRef,
  bottleneck,
  healState,
}: {
  station: Station
  stationIndex: number
  x: number
  state: TrialStationState
  aggregateRisk: number
  redLight: boolean
  motionRef: MotionRef
  trial: RepresentativeTrial
  sequenceRef: SequenceRef
  bottleneck: boolean
  healState: TrialStationState | null
}) {
  const tone = toneForStation(state)
  const meta = STATUS[tone]
  const baseMaterial = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(() => {
    if (!baseMaterial.current) return
    const starved = stationIsStarved(motionRef.current,trial,stationIndex)
    const target = starved ? COLOR_CACHE.cell.starved : COLOR_CACHE.cell[tone]
    baseMaterial.current.color.lerp(target,.12)
  })

  return <group position={[x,0,0]}>
    <mesh position={[0,.055,0]} receiveShadow>
      <boxGeometry args={[2.45,.08,5.35]}/>
      <meshStandardMaterial ref={baseMaterial} color={COLOR_CACHE.cell[tone]} roughness={.8}/>
    </mesh>

    <mesh position={[0,.08,2.25]}>
      <boxGeometry args={[2.05,.03,.05]}/>
      <meshBasicMaterial color={meta.color}/>
    </mesh>

    <mesh position={[.88,1.15,-1.95]} castShadow>
      <cylinderGeometry args={[.035,.045,2.2,8]}/>
      <meshStandardMaterial color="#6f7b86" roughness={.48} metalness={.55}/>
    </mesh>
    <group position={[.88,2.3,-1.95]}>
      <AndonBeacon
        tone={tone}
        redLight={redLight}
        motionRef={motionRef}
        sequenceRef={sequenceRef}
        stationIndex={stationIndex}
        bottleneck={bottleneck}
        healState={healState}
      />
    </group>

    <Html position={[0,2.62,-1.95]} center distanceFactor={12} occlude={false}>
      <div className={`factory-cell-chip ${tone} ${bottleneck ? 'bottleneck' : ''}`} tabIndex={0}>
        <i/>
        <b>{String(stationIndex+1).padStart(2,'0')}</b>
        <div className="factory-cell-detail">
          <strong>{station.name}</strong>
          <span>{state.assigned}/{state.required} assigned · {(state.throughputFactor*100).toFixed(0)}% throughput</span>
          <small>{meta.label} · aggregate fail risk {aggregateRisk.toFixed(1)}%</small>
          {state.lapsedPresentWorkerSlots.length > 0 && <small className="cert-lapsed-label">cert lapsed candidate present</small>}
        </div>
      </div>
    </Html>
  </group>
}

function BottleneckSpotlight({
  x,
  station,
  shift,
  failureRate,
  sequenceRef,
  motionRef,
  healState,
}: {
  x: number
  station: TrialStationState
  shift: Shift
  failureRate: number
  sequenceRef: SequenceRef
  motionRef: MotionRef
  healState: TrialStationState | null
}) {
  const ring = useRef<THREE.Mesh>(null)
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const callout = useRef<HTMLDivElement>(null)
  const target = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.set(x,.15,0)
    return object
  },[x])

  useFrame(() => {
    const time = motionRef.current.time
    const seq = sequenceRef.current
    const pulse = .96 + (Math.sin(time*3.2)+1)*.055

    if (ring.current) ring.current.scale.setScalar(pulse)
    if (ringMaterial.current) ringMaterial.current.opacity=.26+(Math.sin(time*3.2)+1)*.09

    if (callout.current) {
      const reveal = seq.kind === 'run' && seq.active ? seq.progress >= .73 : true
      callout.current.style.opacity = reveal ? '1' : '0'
      callout.current.style.transform = reveal ? 'translateY(0)' : 'translateY(8px)'
    }
  })

  const linePct = Math.round(station.throughputFactor*100)
  const shortText = `${station.deficit} qualified ${station.deficit === 1 ? 'person' : 'people'} short`
  const occurrence = shift === 'Night'
    ? `happens on ${failureRate.toFixed(0)}% of nights`
    : `happens on ${failureRate.toFixed(0)}% of ${shift.toLowerCase()} shifts`
  const healed = healState && healState.deficit < station.deficit

  return <>
    <primitive object={target}/>
    <spotLight
      position={[x+1.5,7.5,4.2]}
      target={target}
      angle={.28}
      penumbra={.68}
      distance={14}
      intensity={3.4}
      color="#f7ddb0"
      castShadow
    />
    <mesh ref={ring} position={[x,.075,0]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[1.0,1.28,64]}/>
      <meshBasicMaterial ref={ringMaterial} color="#f5b841" transparent opacity={.32} depthWrite={false}/>
    </mesh>
    <Html position={[x,3.35,1.45]} center distanceFactor={10.5} occlude={false}>
      <div ref={callout} className="bottleneck-callout">
        <span>BOTTLENECK</span>
        <strong>{station.stationName} · {shift}</strong>
        <p>{shortText} · line at {linePct}% · {occurrence}</p>
        {healed && <small>Verified plan restores this cell to {Math.round((healState?.throughputFactor ?? 1)*100)}% capacity.</small>}
      </div>
    </Html>
  </>
}

function makeBeltTexture() {
  const width = 64
  const height = 4
  const data = new Uint8Array(width * height * 4)
  for (let y=0;y<height;y++) {
    for (let x=0;x<width;x++) {
      const stripe = Math.floor(x / 8) % 2 === 0
      const value = stripe ? 74 : 39
      const offset=(y*width+x)*4
      data[offset]=value
      data[offset+1]=value+5
      data[offset+2]=value+8
      data[offset+3]=255
    }
  }
  const texture = new THREE.DataTexture(data,width,height,THREE.RGBAFormat)
  texture.wrapS=THREE.RepeatWrapping
  texture.wrapT=THREE.RepeatWrapping
  texture.repeat.set(2.5,1)
  texture.needsUpdate=true
  return texture
}

function BeltSegment({ x, index, motionRef }: { x: number; index: number; motionRef: MotionRef }) {
  const texture = useMemo(() => makeBeltTexture(),[])
  useEffect(() => () => texture.dispose(),[texture])

  useFrame((_state,delta) => {
    if (motionRef.current.movingSegments.has(index)) texture.offset.x -= delta * .9
  })

  return <mesh position={[x,.565,0]} rotation={[-Math.PI/2,0,0]} receiveShadow>
    <planeGeometry args={[2.86,1.5]}/>
    <meshStandardMaterial map={texture} color="#7e8992" roughness={.46} metalness={.42}/>
  </mesh>
}

function Conveyor({ xs, motionRef }: { xs: number[]; motionRef: MotionRef }) {
  return <group>
    <mesh position={[0,.30,0]} receiveShadow>
      <boxGeometry args={[39,.28,1.75]}/>
      <meshStandardMaterial color="#20272d" roughness={.48} metalness={.38}/>
    </mesh>
    <mesh position={[0,.49,0]} receiveShadow>
      <boxGeometry args={[39,.10,1.58]}/>
      <meshStandardMaterial color="#11161a" roughness={.42} metalness={.5}/>
    </mesh>
    {xs.map((x,index)=><BeltSegment key={index} x={x} index={index} motionRef={motionRef}/>)}
  </group>
}

function EmptySpot({ position, motionRef }: { position: [number,number,number]; motionRef: MotionRef }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color:'#75808b', transparent:true, opacity:.4 }), [])
  const segments = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4
    return {
      position: [
        position[0] + Math.cos(angle) * .19,
        .09,
        position[2] + Math.sin(angle) * .19,
      ] as [number,number,number],
      rotation: [0,-angle,0] as [number,number,number],
    }
  }), [position])

  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    material.opacity=.28 + (Math.sin(motionRef.current.time*1.7)+1)*.12
  })

  return <group>
    {segments.map((segment,i) => <mesh key={i} position={segment.position} rotation={segment.rotation} material={material}>
      <boxGeometry args={[.15,.018,.026]}/>
    </mesh>)}
  </group>
}

interface WorkerVisual {
  position: [number,number,number]
  stationIndex: number
  lapsed: boolean
  face: number
}

function TrialWorkers({
  stations,
  positions,
  trial,
  motionRef,
  sequenceRef,
}: {
  stations: Station[]
  positions: number[]
  trial: RepresentativeTrial
  motionRef: MotionRef
  sequenceRef: SequenceRef
}) {
  const refs = useRef<Array<THREE.Group | null>>([])
  const ghostBodies = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const ghostHelmets = useRef<Array<THREE.MeshStandardMaterial | null>>([])

  const layout = useMemo(() => {
    const detailed: WorkerVisual[] = []
    const support: WorkerVisual[] = []
    const empty: Array<{position:[number,number,number];stationIndex:number;face:number}> = []

    stations.forEach((station,index) => {
      const state=trial.stations.find(s=>s.stationId===station.id)
      if(!state) return
      const spots=Array.from({length:state.required},(_,i)=>{
        const side=i%2===0?1:-1
        const row=Math.floor(i/2)
        return {
          position:[positions[index]+(row-.5)*.28,.88,side*(1.52+row*.17)] as [number,number,number],
          face:side>0?Math.PI:0,
        }
      })

      let cursor=0
      for(let i=0;i<state.assigned;i++,cursor++){
        const spot=spots[cursor]
        const visual={position:spot.position,stationIndex:index,lapsed:false,face:spot.face}
        if(i===0) detailed.push(visual)
        else support.push(visual)
      }

      const lapsedCount=Math.min(state.deficit,state.lapsedPresentWorkerSlots.length)
      for(let i=0;i<lapsedCount;i++,cursor++){
        const spot=spots[cursor]
        const away=spot.position[2]>0?.28:-.28
        support.push({
          position:[spot.position[0],spot.position[1],spot.position[2]+away],
          stationIndex:index,
          lapsed:true,
          face:spot.face,
        })
      }

      for(;cursor<spots.length;cursor++) {
        empty.push({
          position:spots[cursor].position,
          stationIndex:index,
          face:spots[cursor].face,
        })
      }
    })

    return {detailed,support,empty}
  },[stations,positions,trial])

  useFrame(() => {
    const motion=motionRef.current
    const seq=sequenceRef.current

    for(let i=0;i<layout.support.length;i++){
      const group=refs.current[i]
      if(!group) continue
      const worker=layout.support[i]
      const car=carAtStation(motion,worker.stationIndex)
      const working=Boolean(car && !car.moving && !worker.lapsed)
      const breath=1 + Math.sin(motion.time*1.8+i*.7)*.012
      group.scale.y=breath
      group.rotation.y=worker.face
      group.rotation.x=working ? Math.sin(motion.time*2.5+i)*.035 + .055 : 0
      group.position.y=worker.position[1] + Math.sin(motion.time*1.5+i*.4)*.012
    }

    for(let i=0;i<layout.empty.length;i++){
      const spot=layout.empty[i]
      const body=ghostBodies.current[i]
      const helmet=ghostHelmets.current[i]
      if(!body||!helmet) continue

      let opacity=0
      if(seq.kind==='run'){
        const start=.08+spot.stationIndex*.012
        const end=start+.22
        const p=Math.max(0,Math.min(1,(seq.progress-start)/(end-start)))
        opacity=1-easeInOutCubic(p)
      }
      body.opacity=opacity*.78
      helmet.opacity=opacity*.70
    }
  })

  return <>
    {layout.detailed.map((worker,i)=><StationWorkerModel
      key={`detailed-worker-${worker.stationIndex}-${i}`}
      position={worker.position}
      rotationY={worker.face}
      stationIndex={worker.stationIndex}
      motionRef={motionRef}
      lapsed={worker.lapsed}
    />)}

    {layout.support.map((worker,i)=>
      <group
        key={`support-worker-${i}`}
        ref={group=>{refs.current[i]=group}}
        position={worker.position}
        rotation={[0,worker.face,0]}
      >
        <mesh castShadow>
          <capsuleGeometry args={[.12,.38,4,8]}/>
          <meshStandardMaterial color={worker.lapsed?'#535b62':'#8d9aa5'} roughness={worker.lapsed ? .74 : .58} metalness={.08}/>
        </mesh>
        <mesh position={[0,.34,0]} scale={[1,.52,1]} castShadow>
          <sphereGeometry args={[.145,8,6]}/>
          <meshStandardMaterial color={worker.lapsed?'#70767b':'#d5a936'} roughness={.55}/>
        </mesh>
        {worker.lapsed && <mesh position={[.13,.08,.12]}>
          <circleGeometry args={[.05,12]}/>
          <meshStandardMaterial color="#f5b841" emissive="#f5b841" emissiveIntensity={1.2} toneMapped={false}/>
        </mesh>}
      </group>
    )}

    {layout.empty.map((spot,i)=><group key={`empty-${i}`}>
      <EmptySpot position={spot.position} motionRef={motionRef}/>
      <group position={spot.position} rotation={[0,spot.face,0]}>
        <mesh castShadow>
          <capsuleGeometry args={[.12,.38,4,8]}/>
          <meshStandardMaterial
            ref={material=>{ghostBodies.current[i]=material}}
            color="#8c98a3"
            transparent
            opacity={0}
            roughness={.62}
          />
        </mesh>
        <mesh position={[0,.34,0]} scale={[1,.52,1]}>
          <sphereGeometry args={[.145,8,6]}/>
          <meshStandardMaterial
            ref={material=>{ghostHelmets.current[i]=material}}
            color="#d5a936"
            transparent
            opacity={0}
            roughness={.58}
          />
        </mesh>
      </group>
    </group>)}
  </>
}

function HealWorker({
  x,
  targetZ,
  sequenceRef,
  enabled,
  week,
}: {
  x:number
  targetZ:number
  sequenceRef:SequenceRef
  enabled:boolean
  week:number | null
}) {
  const group=useRef<THREE.Group>(null)
  const start=useMemo(()=>new THREE.Vector3(x+4.4,.075,4.3),[x])
  const control=useMemo(()=>new THREE.Vector3(x+2.2,.075,3.5),[x])
  const end=useMemo(()=>new THREE.Vector3(x,.075,targetZ),[x,targetZ])
  const curve=useMemo(()=>new THREE.QuadraticBezierCurve3(start,control,end),[start,control,end])
  const point=useMemo(()=>new THREE.Vector3(),[])
  const tangent=useMemo(()=>new THREE.Vector3(),[])

  useFrame(()=>{
    if(!group.current) return
    const seq=sequenceRef.current
    const active=enabled && seq.kind==='heal'
    group.current.visible=active
    if(!active) return

    const p=Math.max(0,Math.min(1,(seq.progress-.10)/.55))
    curve.getPoint(p,point)
    curve.getTangent(p,tangent)
    group.current.position.copy(point)
    group.current.rotation.y=-Math.atan2(tangent.z,tangent.x)+Math.PI/2
  })

  return <HealWorkerModel groupRef={group} week={week}/>
}

function slotX(xs: number[], slot: number) {
  if(slot<0) return xs[0]-3
  if(slot>=xs.length) return xs[xs.length-1]+3
  return xs[slot]
}

function isQueueLinked(state: LineMotionState, slot: number) {
  const b=state.bottleneckIndex
  if(slot<0 || slot>b || state.slots[b]==null) return false
  for(let i=slot;i<=b;i++) if(state.slots[i]==null) return false
  return true
}

function renderSlotX(xs: number[], state: LineMotionState, slot: number) {
  const base=slotX(xs,slot)
  if(slot<0 || slot>=xs.length || !isQueueLinked(state,slot)) return base
  const compression=queueCompression(state)
  if(compression<=0) return base
  const target=xs[state.bottleneckIndex]-(state.bottleneckIndex-slot)*2.08
  return THREE.MathUtils.lerp(base,target,Math.min(1,compression))
}

interface CarVisual {
  root: THREE.Object3D
  body: THREE.Mesh | null
  bodyMaterial: THREE.MeshPhysicalMaterial | null
  bodyMap: THREE.Texture | null
  wheels: Array<{object:THREE.Object3D;baseRotation:THREE.Euler}>
}

function createCarVisual(source:THREE.Object3D):CarVisual{
  const root=source.clone(true)
  const wheels:Array<{object:THREE.Object3D;baseRotation:THREE.Euler}>=[]
  let body:THREE.Mesh|null=null
  let bodyMaterial:THREE.MeshPhysicalMaterial|null=null
  let bodyMap:THREE.Texture|null=null

  root.traverse(object=>{
    const mesh=object as THREE.Mesh
    if(!mesh.isMesh) return
    mesh.castShadow=true
    mesh.receiveShadow=true

    if(mesh.name==='body'){
      body=mesh
      const sourceMaterial=Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if(sourceMaterial instanceof THREE.MeshStandardMaterial) bodyMap=sourceMaterial.map
      bodyMaterial=new THREE.MeshPhysicalMaterial({
        color:BODY_IN_WHITE,
        map:null,
        metalness:.42,
        roughness:.31,
        clearcoat:.08,
        clearcoatRoughness:.22,
      })
      mesh.material=bodyMaterial
    }else if(mesh.name.startsWith('wheel-')){
      const sourceMaterial=Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const map=sourceMaterial instanceof THREE.MeshStandardMaterial ? sourceMaterial.map : null
      mesh.material=new THREE.MeshStandardMaterial({
        color:'#202428',
        map,
        metalness:.22,
        roughness:.68,
      })
      wheels.push({object:mesh,baseRotation:mesh.rotation.clone()})
    }
  })

  root.rotation.y=Math.PI/2
  root.scale.setScalar(.72)
  root.visible=false
  return {root,body,bodyMaterial,bodyMap,wheels}
}

function CarFleet({
  xs,
  motionRef,
}: {
  xs: number[]
  motionRef: MotionRef
}) {
  const source=useGLTF(CAR_URL)
  const maxCars=12
  const visuals=useMemo(
    ()=>Array.from({length:maxCars},()=>createCarVisual(source.scene)),
    [source.scene],
  )

  useEffect(()=>()=>{
    for(const visual of visuals){
      visual.bodyMaterial?.dispose()
      for(const wheel of visual.wheels){
        const mesh=wheel.object as THREE.Mesh
        const materials=Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach(material=>material.dispose())
      }
    }
  },[visuals])

  useFrame(()=>{
    const state=motionRef.current
    let visualIndex=0

    for(const car of state.cars.values()){
      if(visualIndex>=maxCars) break
      const visual=visuals[visualIndex++]
      const p=easeInOutCubic(carMoveProgress(car,state.time))
      const fromX=renderSlotX(xs,state,car.fromSlot)
      const toX=renderSlotX(xs,state,car.slot)
      const x=THREE.MathUtils.lerp(fromX,toX,p)
      const stage=Math.max(0,Math.min(xs.length-1,car.slot))
      const bounce=car.moving?Math.sin(p*Math.PI)*.022:0

      visual.root.visible=true
      visual.root.position.set(x,.575+bounce,0)

      if(visual.bodyMaterial){
        if(stage<2){
          if(visual.bodyMaterial.map){
            visual.bodyMaterial.map=null
            visual.bodyMaterial.needsUpdate=true
          }
          visual.bodyMaterial.color.set(BODY_IN_WHITE)
          visual.bodyMaterial.metalness=.18
          visual.bodyMaterial.roughness=.40
          visual.bodyMaterial.clearcoat=.04
        }else{
          if(visual.bodyMaterial.map!==visual.bodyMap){
            visual.bodyMaterial.map=visual.bodyMap
            visual.bodyMaterial.needsUpdate=true
          }
          visual.bodyMaterial.color.set(PAINTS[car.id%PAINTS.length])
          visual.bodyMaterial.metalness=.42
          visual.bodyMaterial.roughness=stage>=4?.24:.32
          visual.bodyMaterial.clearcoat=stage>=4?1:.22
          visual.bodyMaterial.clearcoatRoughness=stage>=4?.12:.24
        }
      }

      const spin=car.moving ? -(state.time-car.moveStart)*5.5 : 0
      for(const wheel of visual.wheels){
        wheel.object.visible=stage>=7
        wheel.object.rotation.set(
          wheel.baseRotation.x+spin,
          wheel.baseRotation.y,
          wheel.baseRotation.z,
        )
      }
    }

    while(visualIndex<maxCars) visuals[visualIndex++].root.visible=false
  })

  return <>{visuals.map((visual,index)=><primitive key={index} object={visual.root}/>)}</>
}

useGLTF.preload(CAR_URL)

function WeldSparks({
  motionRef,
  trial,
  stationIndex,
  disabled,
}: {
  motionRef: MotionRef
  trial: RepresentativeTrial
  stationIndex: number
  disabled: boolean
}) {
  const count=44
  const mesh=useRef<THREE.InstancedMesh>(null)
  const temp=useMemo(()=>new THREE.Object3D(),[])

  useFrame(()=>{
    if(!mesh.current) return
    const state=motionRef.current
    const car=carAtStation(state,stationIndex)
    const staffed=trial.stations[stationIndex]?.deficit===0
    const active=!disabled && staffed && Boolean(car && !car.moving)

    for(let i=0;i<count;i++){
      if(!active){
        temp.position.set(0,0,0);temp.scale.set(0,0,0);temp.updateMatrix();mesh.current.setMatrixAt(i,temp.matrix)
        continue
      }
      const phase=(state.time*3.4+i/count)%1
      if(phase>.26){
        temp.position.set(0,0,0);temp.scale.set(0,0,0);temp.updateMatrix();mesh.current.setMatrixAt(i,temp.matrix)
        continue
      }
      const angle=(i*2.399963229728653 + Math.floor(state.time*3.4)*.73)%(Math.PI*2)
      const radius=.08+phase*.55
      temp.position.set(Math.cos(angle)*radius,-phase*phase*1.15,Math.sin(angle)*radius)
      const size=.022*(1-phase/.26)
      temp.scale.setScalar(size)
      temp.updateMatrix()
      mesh.current.setMatrixAt(i,temp.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate=true
  })

  return <instancedMesh ref={mesh} args={[undefined,undefined,count]}>
    <sphereGeometry args={[1,5,4]}/>
    <meshBasicMaterial color="#ffd36a" transparent opacity={.92} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}/>
  </instancedMesh>
}

function RobotArm({
  position,
  stationIndex,
  motionRef,
  trial,
  mirror=false,
  sparksDisabled=false,
  phaseOffset=0,
}: {
  position:[number,number,number]
  stationIndex:number
  motionRef:MotionRef
  trial:RepresentativeTrial
  mirror?:boolean
  sparksDisabled?:boolean
  phaseOffset?:number
}) {
  const shoulder=useRef<THREE.Group>(null)
  const elbow=useRef<THREE.Group>(null)
  const wrist=useRef<THREE.Group>(null)

  useFrame(()=>{
    const state=motionRef.current
    const car=carAtStation(state,stationIndex)
    const staffed=trial.stations[stationIndex]?.deficit===0
    const active=staffed && Boolean(car && !car.moving)
    const sign=mirror?-1:1

    if(!shoulder.current||!elbow.current||!wrist.current) return
    if(!active){
      shoulder.current.rotation.z=THREE.MathUtils.lerp(shoulder.current.rotation.z,sign*.18,.08)
      elbow.current.rotation.z=THREE.MathUtils.lerp(elbow.current.rotation.z,-sign*.38,.08)
      wrist.current.rotation.z=THREE.MathUtils.lerp(wrist.current.rotation.z,sign*.16,.08)
      return
    }

    const dwell=Math.max(.1,(car!.readyAt-car!.arrivedAt))
    const phase=Number.isFinite(dwell)
      ? Math.max(0,Math.min(1,(state.time-car!.arrivedAt)/dwell))
      : 0
    const weld=Math.sin((phase*5+phaseOffset)*Math.PI*2)
    const reach=Math.sin(Math.min(1,phase*2)*Math.PI/2)

    shoulder.current.rotation.z=sign*(.18-.48*reach+.07*weld)
    elbow.current.rotation.z=-sign*(.38+.55*reach-.08*weld)
    wrist.current.rotation.z=sign*(.16+.24*reach+.12*Math.sin((phase*6+phaseOffset)*Math.PI*2))
  })

  return <group position={position} rotation={[0,mirror?Math.PI:0,0]}>
    <mesh position={[0,.14,0]} castShadow>
      <cylinderGeometry args={[.26,.31,.28,12]}/>
      <meshStandardMaterial color="#b8942f" roughness={.48} metalness={.38}/>
    </mesh>
    <group ref={shoulder} position={[0,.34,0]}>
      <mesh position={[0,.45,0]} castShadow>
        <capsuleGeometry args={[.105,.65,5,8]}/>
        <meshStandardMaterial color="#d2aa35" roughness={.42} metalness={.34}/>
      </mesh>
      <group ref={elbow} position={[0,.88,0]}>
        <mesh position={[0,.38,0]} castShadow>
          <capsuleGeometry args={[.09,.52,5,8]}/>
          <meshStandardMaterial color="#bd982f" roughness={.42} metalness={.34}/>
        </mesh>
        <group ref={wrist} position={[0,.72,0]}>
          <mesh position={[0,.21,0]} castShadow>
            <capsuleGeometry args={[.065,.28,4,7]}/>
            <meshStandardMaterial color="#8b949d" roughness={.4} metalness={.52}/>
          </mesh>
          <group position={[0,.47,0]}>
            <mesh>
              <cylinderGeometry args={[.045,.025,.18,8]}/>
              <meshStandardMaterial color="#3d444a" roughness={.38} metalness={.62}/>
            </mesh>
            <group position={[0,.11,0]}>
              <WeldSparks motionRef={motionRef} trial={trial} stationIndex={stationIndex} disabled={sparksDisabled}/>
            </group>
          </group>
        </group>
      </group>
    </group>
  </group>
}

function TorqueEffect({
  x,
  motionRef,
  trial,
  stationIndex,
  reducedMotion,
}: {
  x:number
  motionRef:MotionRef
  trial:RepresentativeTrial
  stationIndex:number
  reducedMotion:boolean
}) {
  const group=useRef<THREE.Group>(null)
  const material=useRef<THREE.MeshStandardMaterial>(null)
  useFrame(()=>{
    if(!group.current||!material.current) return
    const car=carAtStation(motionRef.current,stationIndex)
    const active=!reducedMotion && trial.stations[stationIndex]?.deficit===0 && Boolean(car&&!car.moving)
    group.current.visible=active
    if(active){
      group.current.rotation.z=motionRef.current.time*8
      material.current.emissiveIntensity=1.6+(Math.sin(motionRef.current.time*12)+1)*1.2
    }
  })
  return <group ref={group} position={[x,1.13,.55]} rotation={[Math.PI/2,0,0]}>
    <mesh>
      <torusGeometry args={[.22,.025,8,18,.85*Math.PI*2]}/>
      <meshStandardMaterial ref={material} color="#f5b841" emissive="#f5b841" emissiveIntensity={2} toneMapped={false}/>
    </mesh>
  </group>
}

function buildCurveClock(curve: THREE.CatmullRomCurve3) {
  const samples=160
  const cumulative=[0]
  let total=0
  for(let i=1;i<=samples;i++){
    const t=i/samples
    const prev=Math.max(0,t-.012)
    const next=Math.min(1,t+.012)
    const a=curve.getTangentAt(prev).normalize()
    const b=curve.getTangentAt(next).normalize()
    const straightness=Math.max(0,Math.min(1,(a.dot(b)+1)/2))
    const speed=.52+.48*straightness
    total+=1/speed
    cumulative.push(total)
  }
  for(let i=0;i<cumulative.length;i++) cumulative[i]/=total
  return (phase:number)=>{
    const p=((phase%1)+1)%1
    let lo=0,hi=samples
    while(lo<hi){
      const mid=Math.floor((lo+hi)/2)
      if(cumulative[mid]<p) lo=mid+1
      else hi=mid
    }
    const upper=Math.max(1,lo)
    const lower=upper-1
    const span=Math.max(1e-6,cumulative[upper]-cumulative[lower])
    const local=(p-cumulative[lower])/span
    return (lower+local)/samples
  }
}

function AGVLoop({
  motionRef,
  trial,
  reducedMotion,
}: {
  motionRef:MotionRef
  trial:RepresentativeTrial
  reducedMotion:boolean
}) {
  const groups=useRef<Array<THREE.Group|null>>([])
  const beacons=useRef<Array<THREE.MeshStandardMaterial|null>>([])
  const routePoints=useMemo(()=>[
    [-17,4.55],[-9,5.0],[0,4.75],[9,4.9],[15,4.25],
    [14,3.0],[7,2.75],[-2,3.05],[-12,3.0],[-17,4.55],
  ] as Array<[number,number]>,[])
  const curve=useMemo(()=>new THREE.CatmullRomCurve3(
    routePoints.map(([x,z])=>new THREE.Vector3(x,.28,z)),
    true,'catmullrom',.2,
  ),[routePoints])
  const decalCurve=useMemo(()=>new THREE.CatmullRomCurve3(
    routePoints.map(([x,z])=>new THREE.Vector3(x,.045,z)),
    true,'catmullrom',.2,
  ),[routePoints])
  const decalGeometry=useMemo(()=>new THREE.TubeGeometry(decalCurve,96,.032,4,true),[decalCurve])
  const phaseToT=useMemo(()=>buildCurveClock(curve),[curve])
  const point=useMemo(()=>new THREE.Vector3(),[])
  const tangent=useMemo(()=>new THREE.Vector3(),[])
  const materialFlowIndex=trial.stations.findIndex(s=>s.stationId==='material-flow')
  const materialShort=materialFlowIndex>=0 && trial.stations[materialFlowIndex].deficit>0
  const dockT=.43

  useEffect(()=>()=>decalGeometry.dispose(),[decalGeometry])

  useFrame(()=>{
    const time=motionRef.current.time
    for(let i=0;i<3;i++){
      const group=groups.current[i]
      const beacon=beacons.current[i]
      if(!group||!beacon) continue
      const phase=materialShort
        ? dockT + (i-1)*.013
        : reducedMotion
          ? .14+i*.26
          : (time*.035+i/3)%1
      const t=materialShort?phase:phaseToT(phase)
      curve.getPointAt(((t%1)+1)%1,point)
      curve.getTangentAt(((t%1)+1)%1,tangent)
      group.position.copy(point)
      group.rotation.y=-Math.atan2(tangent.z,tangent.x)
      const pulse=(Math.sin(time*5+i)+1)/2
      beacon.color.set(materialShort?'#f5b841':'#5cc8ff')
      beacon.emissive.set(materialShort?'#f5b841':'#5cc8ff')
      beacon.emissiveIntensity=materialShort?1.5:1.1+pulse*1.8
    }
  })

  return <>
    <mesh geometry={decalGeometry}>
      <meshBasicMaterial color="#8a7428" transparent opacity={.34} depthWrite={false}/>
    </mesh>
    {[0,1,2].map(i=><group key={i} ref={group=>{groups.current[i]=group}}>
      <mesh castShadow>
        <boxGeometry args={[1.05,.32,.72]}/>
        <meshStandardMaterial color="#252d34" roughness={.42} metalness={.4}/>
      </mesh>
      <mesh position={[.30,.22,0]}>
        <boxGeometry args={[.22,.08,.35]}/>
        <meshStandardMaterial ref={m=>{beacons.current[i]=m}} color="#5cc8ff" emissive="#5cc8ff" emissiveIntensity={1.3} toneMapped={false}/>
      </mesh>
      <mesh position={[-.31,.18,0]}>
        <boxGeometry args={[.22,.08,.42]}/>
        <meshStandardMaterial color="#66717b" roughness={.5} metalness={.38}/>
      </mesh>
    </group>)}
  </>
}

function AlarmStrip({
  xs,
  motionRef,
}: {
  xs:number[]
  motionRef:MotionRef
}) {
  const mesh=useRef<THREE.Mesh>(null)
  const material=useRef<THREE.MeshStandardMaterial>(null)
  useFrame(()=>{
    const state=motionRef.current
    if(!mesh.current||!material.current) return
    mesh.current.position.x=xs[state.bottleneckIndex]??0
    mesh.current.visible=state.lineStopped
    if(state.lineStopped) material.current.emissiveIntensity=2.5+(Math.sin(state.time*10)+1)*2.4
  })
  return <mesh ref={mesh} position={[0,5.45,0]}>
    <boxGeometry args={[2.7,.06,.22]}/>
    <meshStandardMaterial ref={material} color="#ff4d4d" emissive="#ff4d4d" emissiveIntensity={3} toneMapped={false}/>
  </mesh>
}

function OverheadLights({ night }: { night: boolean }) {
  return <>
    {[-14,-7,0,7,14].map(x => <group key={x}>
      <mesh position={[x,6.25,0]}>
        <boxGeometry args={[4.7,.05,.18]}/>
        <meshStandardMaterial color={night ? '#b9d8ee' : '#eef5f7'} emissive={night ? '#8cbce2' : '#d6e4ea'} emissiveIntensity={night ? 2.2 : .72} toneMapped={false}/>
      </mesh>
      <mesh position={[x-1.7,6.72,0]}>
        <cylinderGeometry args={[.018,.018,.94,6]}/>
        <meshStandardMaterial color="#4d565e" roughness={.6} metalness={.5}/>
      </mesh>
      <mesh position={[x+1.7,6.72,0]}>
        <cylinderGeometry args={[.018,.018,.94,6]}/>
        <meshStandardMaterial color="#4d565e" roughness={.6} metalness={.5}/>
      </mesh>
    </group>)}
  </>
}

function CameraDirector({
  xs,
  bottleneckIndex,
  sequenceRef,
  controlsRef,
  mobile,
  reducedMotion,
}: {
  xs:number[]
  bottleneckIndex:number
  sequenceRef:SequenceRef
  controlsRef:OrbitRef
  mobile:boolean
  reducedMotion:boolean
}) {
  const camera=useThree(state=>state.camera)
  const initialized=useRef(false)
  const settled=useRef(false)
  const widePosition=useMemo(()=>new THREE.Vector3(24,18,24),[])
  const wideTarget=useMemo(()=>new THREE.Vector3(0,.9,0),[])
  const focusPosition=useMemo(()=>{
    const x=xs[bottleneckIndex]??0
    return mobile
      ? new THREE.Vector3(x+5.2,6.4,8.4)
      : new THREE.Vector3(x+5.6,5.4,7.6)
  },[bottleneckIndex,mobile,xs])
  const focusTarget=useMemo(()=>new THREE.Vector3(xs[bottleneckIndex]??0,1.05,0),[bottleneckIndex,xs])
  const desiredPosition=useMemo(()=>new THREE.Vector3(),[])
  const desiredTarget=useMemo(()=>new THREE.Vector3(),[])

  useFrame(()=>{
    const controls=controlsRef.current
    const seq=sequenceRef.current

    if(!initialized.current && mobile){
      initialized.current=true
      camera.position.copy(focusPosition)
      if(controls){
        controls.target.copy(focusTarget)
        controls.update()
      }else{
        camera.lookAt(focusTarget)
      }
    }

    const needsSettle=!seq.active && seq.progress>=1 && seq.kind!=='idle' && !settled.current
    if(!seq.active && !needsSettle){
      if(controls) controls.enabled=!reducedMotion
      return
    }
    if(seq.progress<1) settled.current=false

    let focusBlend=0
    if(seq.kind==='run'){
      focusBlend=Math.max(0,Math.min(1,(seq.progress-.48)/.34))
      focusBlend=easeInOutCubic(focusBlend)
    }else if(seq.kind==='heal'){
      if(seq.progress<.64) focusBlend=1
      else focusBlend=1-easeInOutCubic(Math.max(0,Math.min(1,(seq.progress-.64)/.31)))
    }

    desiredPosition.copy(widePosition).lerp(focusPosition,focusBlend)
    desiredTarget.copy(wideTarget).lerp(focusTarget,focusBlend)
    camera.position.lerp(desiredPosition,.12)

    if(controls){
      controls.enabled=false
      controls.target.lerp(desiredTarget,.14)
      controls.update()
    }else{
      camera.lookAt(desiredTarget)
    }

    if(needsSettle){
      camera.position.copy(desiredPosition)
      if(controls){
        controls.target.copy(desiredTarget)
        controls.enabled=!reducedMotion
        controls.update()
      }
      settled.current=true
    }
  },20)

  return null
}

function FactoryWorld({
  result,
  trial,
  previousTrial,
  healTrial,
  failureRate,
  healWeek,
  runId,
  healId,
  skipId,
  shift,
  seed,
  reducedMotion,
}: {
  result:SimResult
  trial:RepresentativeTrial
  previousTrial:RepresentativeTrial | null
  healTrial:RepresentativeTrial | null
  failureRate:number
  healWeek:number | null
  runId:number
  healId:number
  skipId:number
  shift:Shift
  seed:number
  reducedMotion:boolean
}) {
  const plant=useMemo(()=>generatePlant(seed),[seed])
  const xs=useMemo(()=>plant.stations.map((_s,i)=>-16.5+i*3),[plant.stations])
  const motionRef=useRef<LineMotionState>(createLineMotion(trial))
  const sequenceRef=useRef<SceneSequence>({kind:'idle',active:false,progress:1,elapsed:0})
  const controlsRef=useRef<ElementRef<typeof OrbitControls> | null>(null)
  const stationStates=useMemo(()=>new Map(trial.stations.map(state=>[state.stationId,state])),[trial])
  const risks=useMemo(
    ()=>new Map(result.stationRisks.filter(r=>r.shift===shift).map(r=>[r.stationId,r])),
    [result,shift],
  )
  const mobile=typeof window!=='undefined'&&window.matchMedia(MOBILE_QUERY).matches
  const [renderQuality,setRenderQuality]=useState(mobile?0:2)
  const bottleneckIndex=useMemo(()=>trial.stations.reduce((best,station,index,all)=>{
    const current=all[best]
    if(station.deficit>current.deficit) return index
    if(station.deficit===current.deficit && station.throughputFactor<current.throughputFactor) return index
    return best
  },0),[trial])
  const bottleneckState=trial.stations[bottleneckIndex]
  const hasBottleneck=Boolean(bottleneckState && bottleneckState.deficit>0)
  const healState=healTrial?.stations.find(station=>station.stationId===bottleneckState?.stationId) ?? null
  const healAddsWorker=Boolean(hasBottleneck && healState && healState.assigned>bottleneckState.assigned)
  const redLightIndices=useMemo(
    ()=>trial.stations
      .map((station,index)=>({station,index}))
      .filter(x=>x.station.status==='uncovered')
      .sort((a,b)=>b.station.deficit-a.station.deficit)
      .slice(0,3)
      .map(x=>x.index),
    [trial],
  )

  return <>
    <MotionController
      trial={trial}
      previousTrial={previousTrial}
      healTrial={healTrial}
      motionRef={motionRef}
      sequenceRef={sequenceRef}
      runId={runId}
      healId={healId}
      skipId={skipId}
      reducedMotion={reducedMotion}
    />
    <ShiftLighting shift={shift} reducedMotion={reducedMotion} focus={hasBottleneck} sequenceRef={sequenceRef}/>
    <LocalEnvironment/>
    {!mobile&&!reducedMotion&&<PerformanceMonitor
      factor={1}
      bounds={()=>[45,60]}
      flipflops={3}
      onDecline={()=>setRenderQuality(level=>Math.max(0,level-1))}
      onFallback={()=>setRenderQuality(0)}
    />}
    <CameraDirector
      xs={xs}
      bottleneckIndex={bottleneckIndex}
      sequenceRef={sequenceRef}
      controlsRef={controlsRef}
      mobile={mobile}
      reducedMotion={reducedMotion}
    />

    <FactoryHall mobile={mobile} night={shift==='Night'}/>

    <AreaZone x={-12} label="BODY SYSTEMS"/>
    <AreaZone x={0} label="ASSEMBLY"/>
    <AreaZone x={12} label="QUALITY & FLOW"/>

    <Conveyor xs={xs} motionRef={motionRef}/>
    <CarFleet xs={xs} motionRef={motionRef}/>
    <TrialWorkers stations={plant.stations} positions={xs} trial={trial} motionRef={motionRef} sequenceRef={sequenceRef}/>
    <HealWorker
      x={xs[bottleneckIndex]??0}
      targetZ={1.52}
      sequenceRef={sequenceRef}
      enabled={healAddsWorker}
      week={healWeek}
    />
    <AGVLoop motionRef={motionRef} trial={trial} reducedMotion={reducedMotion}/>
    <OverheadLights night={shift==='Night'}/>
    <AlarmStrip xs={xs} motionRef={motionRef}/>
    <StarvationLayer xs={xs} motionRef={motionRef} trial={trial}/>

    <RobotArm position={[xs[0]-.45,.06,-2.4]} stationIndex={0} motionRef={motionRef} trial={trial} sparksDisabled={mobile||reducedMotion} phaseOffset={0}/>
    <RobotArm position={[xs[0]+.45,.06,2.4]} stationIndex={0} motionRef={motionRef} trial={trial} mirror sparksDisabled={mobile||reducedMotion} phaseOffset={.17}/>
    <RobotArm position={[xs[1],.06,-2.4]} stationIndex={1} motionRef={motionRef} trial={trial} sparksDisabled={mobile||reducedMotion} phaseOffset={.33}/>
    <TorqueEffect x={xs[7]} stationIndex={7} motionRef={motionRef} trial={trial} reducedMotion={reducedMotion}/>

    {hasBottleneck && <BottleneckSpotlight
      x={xs[bottleneckIndex]}
      station={bottleneckState}
      shift={shift}
      failureRate={failureRate}
      sequenceRef={sequenceRef}
      motionRef={motionRef}
      healState={healState}
    />}

    {plant.stations.map((station,i)=>{
      const state=stationStates.get(station.id)!
      const aggregateRisk=risks.get(station.id)?.uncoveredProbability??0
      const targetHealState=healTrial?.stations.find(item=>item.stationId===station.id) ?? null
      return <Workcell
        key={station.id}
        station={station}
        stationIndex={i}
        x={xs[i]}
        state={state}
        aggregateRisk={aggregateRisk}
        redLight={redLightIndices.includes(i)}
        motionRef={motionRef}
        trial={trial}
        sequenceRef={sequenceRef}
        bottleneck={i===bottleneckIndex && hasBottleneck}
        healState={targetHealState}
      />
    })}

    {(mobile||renderQuality<2)&&<ContactShadows position={[0,.02,0]} opacity={.32} scale={46} blur={2.5} far={12}/>}
    {!mobile&&!reducedMotion&&<EffectComposer multisampling={0}>
      {renderQuality>=2&&<N8AO
        aoRadius={2.2}
        intensity={1.25}
        quality="performance"
        halfRes
        distanceFalloff={1}
      />}
      {renderQuality>=1&&<Bloom intensity={.42} luminanceThreshold={1.08} luminanceSmoothing={.2} mipmapBlur/>}
      <SMAA/>
      <Vignette eskil={false} offset={.18} darkness={.38}/>
    </EffectComposer>}

    <OrbitControls
      ref={controlsRef}
      enabled={!reducedMotion}
      makeDefault
      target={[0,.9,0]}
      minDistance={mobile?15:24}
      maxDistance={46}
      minPolarAngle={Math.PI*.20}
      maxPolarAngle={Math.PI*.44}
      minAzimuthAngle={-Math.PI*.24}
      maxAzimuthAngle={Math.PI*.24}
      enablePan={false}
      dampingFactor={.075}
      enableDamping
    />
  </>
}

export default function FactoryFloorScene({
  result,
  trial,
  previousTrial,
  healTrial,
  failureRate,
  healWeek,
  runId,
  healId,
  skipId,
  shift,
  seed,
  active,
  reducedMotion,
}: {
  result:SimResult
  trial:RepresentativeTrial
  previousTrial:RepresentativeTrial | null
  healTrial:RepresentativeTrial | null
  failureRate:number
  healWeek:number | null
  runId:number
  healId:number
  skipId:number
  shift:Shift
  seed:number
  active:boolean
  reducedMotion:boolean
}) {
  return <Canvas
    className="factory-canvas"
    shadows
    dpr={[1,1.5]}
    frameloop={!active?'never':reducedMotion?'demand':'always'}
    camera={{position:[24,18,24],fov:30,near:.1,far:100}}
    gl={{antialias:true,powerPreference:'high-performance'}}
    onCreated={({gl})=>{
      gl.toneMapping=THREE.AgXToneMapping
      gl.toneMappingExposure=1.05
    }}
  >
    <FactoryWorld
      result={result}
      trial={trial}
      previousTrial={previousTrial}
      healTrial={healTrial}
      failureRate={failureRate}
      healWeek={healWeek}
      runId={runId}
      healId={healId}
      skipId={skipId}
      shift={shift}
      seed={seed}
      reducedMotion={reducedMotion}
    />
  </Canvas>
}
