import { beta, mulberry32 } from './rng'
import type { Area, Plant, Qualification, Shift, Station, WorkerRecord } from './types'

const shifts: Shift[] = ['Early', 'Late', 'Night']

const areas: Area[] = [
  { id: 'body', name: 'Body Systems' },
  { id: 'assembly', name: 'Assembly' },
  { id: 'quality', name: 'Quality & Flow' },
]

const stations: Station[] = [
  { id: 'joining', name: 'Joining Cell', areaId: 'body', critical: true, baseRequired: 4 },
  { id: 'frame-fit', name: 'Frame Fit', areaId: 'body', critical: true, baseRequired: 3 },
  { id: 'surface-prep', name: 'Surface Prep', areaId: 'body', critical: true, baseRequired: 3 },
  { id: 'dim-check', name: 'Dimensional Check', areaId: 'body', critical: true, baseRequired: 2 },
  { id: 'module-install', name: 'Module Install', areaId: 'assembly', critical: true, baseRequired: 4 },
  { id: 'process-b', name: 'Process B', areaId: 'assembly', critical: true, baseRequired: 5 },
  { id: 'cabin-systems', name: 'Cabin Systems', areaId: 'assembly', critical: true, baseRequired: 3 },
  { id: 'final-torque', name: 'Final Torque', areaId: 'assembly', critical: true, baseRequired: 3 },
  { id: 'eol-test', name: 'End-of-Line Test', areaId: 'quality', critical: true, baseRequired: 3 },
  { id: 'quality-gate', name: 'Quality Gate', areaId: 'quality', critical: true, baseRequired: 3 },
  { id: 'material-flow', name: 'Material Flow', areaId: 'quality', critical: true, baseRequired: 3 },
  { id: 'rework', name: 'Rework Support', areaId: 'quality', critical: true, baseRequired: 2 },
]

function qualification(stationId: string, rand: () => number, core = false): Qualification {
  // Always consume the same four draws so expiry tuning cannot reshape
  // the rest of the synthetic plant through RNG-stream drift.
  const expiryRoll = rand()
  const expiryWeekRoll = rand()
  const renewalRank = rand()
  const trainingRoll = rand()
  return {
    stationId,
    expiresWeek: expiryRoll < 0.70 ? 99 : 2 + Math.floor(expiryWeekRoll * 11),
    renewalRank,
    trainingRank: core ? trainingRoll * 0.82 : trainingRoll,
    availableWeek: 0,
  }
}

export function generatePlant(seed = 20261029): Plant {
  const rand = mulberry32(seed)
  const workers: WorkerRecord[] = []
  let id = 1
  const generatedStations = stations.map(station => ({ ...station, demandRank: rand() }))

  // Scarcity is generated from the seed, never attached to a named station.
  const stationAffinity = new Map(generatedStations.map(station => [station.id, 0.38 + rand() * 0.50]))
  const shiftAffinity = new Map<string, number>()
  for (const shift of shifts) {
    for (const station of generatedStations) {
      shiftAffinity.set(`${shift}|${station.id}`, 0.72 + rand() * 0.28)
    }
  }

  for (const shift of shifts) {
    const shiftWorkers: WorkerRecord[] = []
    for (let i = 0; i < 60; i++) {
      const home = generatedStations[i % generatedStations.length]
      const qualifications: Qualification[] = [qualification(home.id, rand, true)]
      const extraCount = (rand() < 0.88 ? 1 : 0) + (rand() < 0.07 ? 1 : 0)

      for (let q = 0; q < extraCount; q++) {
        let tries = 0
        while (tries++ < 14) {
          const candidate = generatedStations[Math.floor(rand() * generatedStations.length)]
          if (qualifications.some(x => x.stationId === candidate.id)) continue
          const affinity = (stationAffinity.get(candidate.id) ?? 0.6) * (shiftAffinity.get(`${shift}|${candidate.id}`) ?? 0.85)
          if (rand() > affinity) continue
          qualifications.push(qualification(candidate.id, rand))
          break
        }
      }

      shiftWorkers.push({
        id: id++,
        shift,
        absenceFactor: 0.97 + beta(8, 8, rand) * 0.80,
        qualifications,
      })
    }
    workers.push(...shiftWorkers)
  }

  return { seed, areas, stations: generatedStations, workers }
}

export const BASELINE_SCENARIO = {
  absenceRate: 8,
  demandPct: 0,
  trainingCoverage: 96,
  certHorizon: 0,
  renewalRate: 85,
  week: 0,
} as const
