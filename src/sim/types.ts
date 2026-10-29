export type Shift = 'Early' | 'Late' | 'Night'

export interface Area {
  id: string
  name: string
}

export interface Station {
  id: string
  name: string
  areaId: string
  critical: boolean
  baseRequired: number
}

export interface Qualification {
  stationId: string
  expiresWeek: number
  trainingRank: number
  availableWeek: number
}

export interface WorkerRecord {
  id: number
  shift: Shift
  absenceFactor: number
  qualifications: Qualification[]
}

export interface Plant {
  seed: number
  areas: Area[]
  stations: Station[]
  workers: WorkerRecord[]
}

export interface Scenario {
  absenceRate: number
  demandPct: number
  trainingCoverage: number
  certHorizon: number
  week: number
}

export interface StationRisk {
  stationId: string
  stationName: string
  areaId: string
  shift: Shift
  required: number
  qualifiedPool: number
  uncoveredProbability: number
  failureShare: number
}

export interface ShiftResult {
  shift: Shift
  coverageProbability: number
  meanUncoveredStations: number
}

export interface HistogramBin {
  uncovered: number
  count: number
}

export interface AttributionStep {
  key: 'absence' | 'demand' | 'training' | 'certification'
  label: string
  delta: number
}

export interface SimResult {
  samples: number
  readiness: number
  p10: number
  p90: number
  shiftResults: ShiftResult[]
  stationRisks: StationRisk[]
  histogram: HistogramBin[]
  worst: StationRisk
  criticalSkillCoverage: number
  attribution: AttributionStep[]
}

export interface Intervention {
  id: 'training' | 'rebalance' | 'overtime' | 'combined'
  title: string
  description: string
  readinessBefore: number
  readinessAfter: number
  leadWeeks: number
  actions: string[]
  capped?: boolean
  valuePerSlot?: number
  result: SimResult
}

export interface Plan {
  evaluated: number
  options: Intervention[]
  recommended: Intervention
}

export interface TimelinePoint {
  week: number
  readiness: number
  p10: number
  p90: number
}

export type WorkerRequest =
  | { id: number; type: 'simulate'; plant: Plant; scenario: Scenario; samples: number; baselineScenario?: Scenario }
  | { id: number; type: 'optimize'; plant: Plant; scenario: Scenario; current: SimResult }
  | { id: number; type: 'timeline'; plant: Plant; scenario: Scenario; optimized: boolean }

export type WorkerResponse =
  | { id: number; ok: true; type: 'simulate'; result: SimResult }
  | { id: number; ok: true; type: 'optimize'; result: Plan }
  | { id: number; ok: true; type: 'timeline'; result: TimelinePoint[] }
  | { id: number; ok: false; error: string }
