import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Html, Instance, Instances, Lightformer, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { generatePlant } from '../sim/plant'
import type { RepresentativeTrial, Shift, SimResult, Station, TrialStationState } from '../sim/types'

const STATUS = {
  ready: { color: '#3ddc97', label: 'staffed' },
  watch: { color: '#f5b841', label: 'short by 1' },
  risk: { color: '#ff5d5d', label: 'short by 2+' },
} as const

type Tone = keyof typeof STATUS

function toneForStation(station: TrialStationState): Tone {
  return station.status === 'staffed' ? 'ready' : station.status === 'short' ? 'watch' : 'risk'
}

const lighting = {
  Early: { background: '#111a21', ambient: '#b9dcf0', key: '#d8efff', fill: '#8ec6e6', intensity: 3.0 },
  Late: { background: '#1b1511', ambient: '#d4b493', key: '#ffcf9e', fill: '#d68a5b', intensity: 2.6 },
  Night: { background: '#06090d', ambient: '#52677a', key: '#91b8d9', fill: '#446b8a', intensity: 1.6 },
} as const

function ShiftLighting({ shift, reducedMotion }: { shift: Shift; reducedMotion: boolean }) {
  const ambient = useRef<THREE.AmbientLight>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()

  useEffect(() => {
    if (!scene.background) scene.background = new THREE.Color(lighting[shift].background)
  }, [scene, shift])

  useFrame((_state, delta) => {
    const cfg = lighting[shift]
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-5.2 * delta)
    const bg = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(cfg.background)
    bg.lerp(new THREE.Color(cfg.background), alpha)
    scene.background = bg

    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.lerp(ambient.current.intensity, cfg.intensity * .62, alpha)
      ambient.current.color.lerp(new THREE.Color(cfg.ambient), alpha)
    }
    if (key.current) {
      key.current.intensity = THREE.MathUtils.lerp(key.current.intensity, cfg.intensity, alpha)
      key.current.color.lerp(new THREE.Color(cfg.key), alpha)
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.lerp(fill.current.intensity, cfg.intensity * .48, alpha)
      fill.current.color.lerp(new THREE.Color(cfg.fill), alpha)
    }
  })

  return <>
    <ambientLight ref={ambient} intensity={1.4} color={lighting[shift].ambient}/>
    <directionalLight ref={key} position={[8,16,10]} intensity={3} color={lighting[shift].key} castShadow shadow-mapSize={[1024,1024]}/>
    <directionalLight ref={fill} position={[-12,8,-8]} intensity={1.2} color={lighting[shift].fill}/>
  </>
}

function AreaZone({ x, label, night }: { x: number; label: string; night: boolean }) {
  return <group position={[x,0,0]}>
    <mesh position={[0,.015,0]} receiveShadow>
      <boxGeometry args={[10.7,.03,8.2]}/>
      <meshStandardMaterial color={night ? '#0c1117' : '#151b20'} roughness={.82} metalness={.08}/>
    </mesh>
    <mesh position={[0,.04,-3.75]}>
      <boxGeometry args={[10.1,.03,.06]}/>
      <meshBasicMaterial color="#d3a72f"/>
    </mesh>
    <mesh position={[0,.04,3.75]}>
      <boxGeometry args={[10.1,.03,.06]}/>
      <meshBasicMaterial color="#d3a72f"/>
    </mesh>
    <Html position={[-4.65,.06,-3.3]} transform distanceFactor={13} occlude={false}>
      <div className="factory-area-label">{label}</div>
    </Html>
  </group>
}

function Workcell({
  station,
  x,
  state,
  aggregateRisk,
}: {
  station: Station
  x: number
  state: TrialStationState
  aggregateRisk: number
}) {
  const tone = toneForStation(state)
  const meta = STATUS[tone]
  return <group position={[x,0,0]}>
    <mesh position={[0,.055,0]} receiveShadow>
      <boxGeometry args={[2.45,.08,5.35]}/>
      <meshStandardMaterial color={tone === 'risk' ? '#171214' : tone === 'watch' ? '#171611' : '#10161a'} roughness={.8}/>
    </mesh>

    <mesh position={[0,.08,2.25]}>
      <boxGeometry args={[2.05,.03,.05]}/>
      <meshBasicMaterial color={meta.color}/>
    </mesh>

    <mesh position={[.88,1.15,-1.95]} castShadow>
      <cylinderGeometry args={[.035,.045,2.2,8]}/>
      <meshStandardMaterial color="#6f7b86" roughness={.48} metalness={.55}/>
    </mesh>
    <mesh position={[.88,2.3,-1.95]} castShadow>
      <sphereGeometry args={[.13,14,10]}/>
      <meshStandardMaterial color={meta.color} emissive={meta.color} emissiveIntensity={tone === 'risk' ? 5.5 : 3.4} toneMapped={false}/>
    </mesh>

    <Html position={[0,2.78,-1.95]} center distanceFactor={12} occlude={false}>
      <div className={`factory-cell-label ${tone}`}>
        <strong>{station.name}</strong>
        <span>{state.assigned}/{state.required} assigned · {(state.throughputFactor*100).toFixed(0)}%</span>
        <small>{meta.label} · aggregate fail risk {aggregateRisk.toFixed(1)}%</small>
        {state.lapsedPresentWorkerSlots.length > 0 && <small className="cert-lapsed-label">cert lapsed candidate present</small>}
      </div>
    </Html>
  </group>
}

function Conveyor() {
  const rollerXs = useMemo(() => Array.from({ length: 52 }, (_, i) => -19.1 + i * .75), [])
  return <group>
    <mesh position={[0,.30,0]} receiveShadow>
      <boxGeometry args={[39,.28,1.75]}/>
      <meshStandardMaterial color="#20272d" roughness={.48} metalness={.38}/>
    </mesh>
    <mesh position={[0,.49,0]} receiveShadow>
      <boxGeometry args={[39,.10,1.58]}/>
      <meshStandardMaterial color="#11161a" roughness={.42} metalness={.5}/>
    </mesh>
    <Instances limit={rollerXs.length}>
      <cylinderGeometry args={[.07,.07,1.48,10]}/>
      <meshStandardMaterial color="#5c6670" roughness={.34} metalness={.65}/>
      {rollerXs.map((x,i) => <Instance key={i} position={[x,.57,0]} rotation={[Math.PI/2,0,0]}/>)}
    </Instances>
  </group>
}

function EmptySpot({ position }: { position: [number,number,number] }) {
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

  return <group>
    {segments.map((segment,i) => <mesh key={i} position={segment.position} rotation={segment.rotation}>
      <boxGeometry args={[.15,.018,.026]}/>
      <meshBasicMaterial color="#75808b" transparent opacity={.48}/>
    </mesh>)}
  </group>
}

function TrialWorkers({
  stations,
  positions,
  trial,
}: {
  stations: Station[]
  positions: number[]
  trial: SimResult['representativeTrials'][Shift]
}) {
  const layout = useMemo(() => {
    const assigned: Array<[number,number,number]> = []
    const assignedHelmets: Array<[number,number,number]> = []
    const lapsed: Array<[number,number,number]> = []
    const lapsedHelmets: Array<[number,number,number]> = []
    const empty: Array<[number,number,number]> = []

    stations.forEach((station, index) => {
      const state = trial.stations.find(s => s.stationId === station.id)
      if (!state) return
      const spots = Array.from({ length: state.required }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1
        const row = Math.floor(i / 2)
        return [positions[index] + side * .55, .88, 1.55 + row * .46] as [number,number,number]
      })

      let cursor = 0
      for (let i = 0; i < state.assigned; i++, cursor++) {
        const p = spots[cursor]
        assigned.push(p)
        assignedHelmets.push([p[0],p[1]+.38,p[2]])
      }

      const lapsedCount = Math.min(state.deficit, state.lapsedPresentWorkerSlots.length)
      for (let i = 0; i < lapsedCount; i++, cursor++) {
        const p = spots[cursor]
        lapsed.push(p)
        lapsedHelmets.push([p[0],p[1]+.38,p[2]])
      }

      for (; cursor < spots.length; cursor++) empty.push(spots[cursor])
    })

    return { assigned, assignedHelmets, lapsed, lapsedHelmets, empty }
  }, [stations, positions, trial])

  return <>
    <Instances limit={layout.assigned.length}>
      <capsuleGeometry args={[.13,.42,4,8]}/>
      <meshStandardMaterial color="#9ba7b3" roughness={.58} metalness={.06}/>
      {layout.assigned.map((position,i) => <Instance key={i} position={position} castShadow/>)}
    </Instances>
    <Instances limit={layout.assignedHelmets.length}>
      <sphereGeometry args={[.16,8,6]}/>
      <meshStandardMaterial color="#d5a936" roughness={.5}/>
      {layout.assignedHelmets.map((position,i) => <Instance key={i} position={position} scale={[1,.52,1]} castShadow/>)}
    </Instances>

    <Instances limit={layout.lapsed.length}>
      <capsuleGeometry args={[.13,.42,4,8]}/>
      <meshStandardMaterial color="#565e66" roughness={.72}/>
      {layout.lapsed.map((position,i) => <Instance key={i} position={position} castShadow/>)}
    </Instances>
    <Instances limit={layout.lapsedHelmets.length}>
      <sphereGeometry args={[.16,8,6]}/>
      <meshStandardMaterial color="#6d747a" roughness={.68}/>
      {layout.lapsedHelmets.map((position,i) => <Instance key={i} position={position} scale={[1,.52,1]} castShadow/>)}
    </Instances>

    {layout.empty.map((position,i) => <EmptySpot key={i} position={position}/>)}
  </>
}

function StaticCars({ positions }: { positions: number[] }) {
  const colors = ['#aeb7bf','#6e7882','#d4d7d9','#88949f']
  return <Instances limit={positions.length}>
    <boxGeometry args={[1.58,.42,.90]}/>
    <meshStandardMaterial roughness={.32} metalness={.68}/>
    {positions.map((x,i) =>
      <Instance key={i} position={[x,1.0,0]} color={colors[i % colors.length]} castShadow />
    )}
  </Instances>
}

function StaticAgvs() {
  const positions: Array<[number,number,number]> = [[10,.28,4.45],[1,.28,4.45],[-10,.28,4.45]]
  return <>
    <mesh position={[0,.035,4.45]}>
      <boxGeometry args={[35,.025,.06]}/>
      <meshBasicMaterial color="#826c25"/>
    </mesh>
    {positions.map((position,i) => <group position={position} key={i}>
      <mesh castShadow>
        <boxGeometry args={[1.05,.32,.72]}/>
        <meshStandardMaterial color="#252d34" roughness={.42} metalness={.4}/>
      </mesh>
      <mesh position={[.30,.22,0]}>
        <boxGeometry args={[.22,.08,.35]}/>
        <meshStandardMaterial color="#5cc8ff" emissive="#5cc8ff" emissiveIntensity={1.3} toneMapped={false}/>
      </mesh>
    </group>)}
  </>
}

function OverheadLights({ night }: { night: boolean }) {
  return <>
    {[-14,-7,0,7,14].map((x,i) => <mesh position={[x,6,0]} key={i}>
      <boxGeometry args={[4.7,.05,.18]}/>
      <meshStandardMaterial color={night ? '#b9d8ee' : '#eef5f7'} emissive={night ? '#8cbce2' : '#d6e4ea'} emissiveIntensity={night ? 2.0 : .65} toneMapped={false}/>
    </mesh>)}
  </>
}

function FactoryWorld({ result, trial, shift, seed, reducedMotion }: { result: SimResult; trial: RepresentativeTrial; shift: Shift; seed: number; reducedMotion: boolean }) {
  const plant = useMemo(() => generatePlant(seed), [seed])
  const xs = useMemo(() => plant.stations.map((_s,i) => -16.5 + i * 3), [plant.stations])
  const stationStates = useMemo(() => new Map(trial.stations.map(state => [state.stationId,state])), [trial])
  const risks = useMemo(
    () => new Map(result.stationRisks.filter(r => r.shift === shift).map(r => [r.stationId, r])),
    [result, shift],
  )
  const carPositions = useMemo(() => [-15,-11.6,-8.2,-4.8,-1.4,2,5.4,8.8,12.2,15.6], [])
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches

  return <>
    <ShiftLighting shift={shift} reducedMotion={reducedMotion}/>
    <Environment resolution={256} frames={1}>
      <Lightformer intensity={2.2} position={[0,9,0]} rotation-x={Math.PI/2} scale={[40,6,1]}/>
      <Lightformer intensity={0.8} position={[-20,4,0]} rotation-y={Math.PI/2} scale={[20,4,1]} color="#9cc9ff"/>
      <Lightformer intensity={0.6} position={[20,4,0]} rotation-y={-Math.PI/2} scale={[20,4,1]} color="#ffd2a1"/>
    </Environment>

    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]} receiveShadow>
      <planeGeometry args={[45,18]}/>
      <meshStandardMaterial color="#0b0f13" roughness={.66} metalness={.14}/>
    </mesh>
    <gridHelper args={[44,44,'#27313a','#171d22']} position={[0,.012,0]}/>

    <AreaZone x={-12} label="BODY SYSTEMS" night={shift === 'Night'}/>
    <AreaZone x={0} label="ASSEMBLY" night={shift === 'Night'}/>
    <AreaZone x={12} label="QUALITY & FLOW" night={shift === 'Night'}/>

    <Conveyor/>
    <StaticCars positions={carPositions}/>
    <TrialWorkers stations={plant.stations} positions={xs} trial={trial}/>
    <StaticAgvs/>
    <OverheadLights night={shift === 'Night'}/>

    {plant.stations.map((station,i) => {
      const state = stationStates.get(station.id)!
      const aggregateRisk = risks.get(station.id)?.uncoveredProbability ?? 0
      return <Workcell
        key={station.id}
        station={station}
        x={xs[i]}
        state={state}
        aggregateRisk={aggregateRisk}
      />
    })}

    <ContactShadows position={[0,.02,0]} opacity={.38} scale={46} blur={2.6} far={12}/>
    {!mobile && !reducedMotion && <EffectComposer multisampling={0}>
      <Bloom intensity={.45} luminanceThreshold={1.15} luminanceSmoothing={.18} mipmapBlur/>
    </EffectComposer>}

    <OrbitControls
      enabled={!reducedMotion}
      makeDefault
      target={[0,.9,0]}
      minDistance={24}
      maxDistance={46}
      minPolarAngle={Math.PI * .22}
      maxPolarAngle={Math.PI * .42}
      minAzimuthAngle={-Math.PI * .22}
      maxAzimuthAngle={Math.PI * .22}
      enablePan={false}
      dampingFactor={.075}
      enableDamping
    />
  </>
}

export default function FactoryFloorScene({
  result,
  trial,
  shift,
  seed,
  active,
  reducedMotion,
}: {
  result: SimResult
  trial: RepresentativeTrial
  shift: Shift
  seed: number
  active: boolean
  reducedMotion: boolean
}) {
  return <Canvas
    className="factory-canvas"
    shadows
    dpr={[1,1.5]}
    frameloop={!active ? 'never' : reducedMotion ? 'demand' : 'always'}
    camera={{ position: [24,18,24], fov: 30, near: .1, far: 100 }}
    gl={{ antialias: true, powerPreference: 'high-performance' }}
  >
    <FactoryWorld result={result} trial={trial} shift={shift} seed={seed} reducedMotion={reducedMotion}/>
  </Canvas>
}
