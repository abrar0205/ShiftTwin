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

function expiry(rand: () => number, stationId: string, shift: Shift, homeIndex: number) {
  if (stationId === 'process-b' && shift === 'Night' && (homeIndex === 5 || homeIndex === 17)) {
    return homeIndex === 5 ? 3 : 4
  }
  const u = rand()
  if (u < 0.58) return 99
  return 2 + Math.floor(rand() * 11)
}

function qualification(stationId: string, shift: Shift, homeIndex: number, rand: () => number): Qualification {
  return {
    stationId,
    expiresWeek: expiry(rand, stationId, shift, homeIndex),
    trainingRank: rand(),
    availableWeek: 0,
  }
}

export function generatePlant(seed = 20261029): Plant {
  const rand = mulberry32(seed)
  const workers: WorkerRecord[] = []
  let id = 1

  for (const shift of shifts) {
    const shiftWorkers: WorkerRecord[] = []
    for (let i = 0; i < 60; i++) {
      const home = stations[i % stations.length]
      const qualifications: Qualification[] = [qualification(home.id, shift, i, rand)]
      const extraCount = 1 + Math.floor(rand() * 3)

      for (let q = 0; q < extraCount; q++) {
        let tries = 0
        while (tries++ < 20) {
          const candidate = stations[Math.floor(rand() * stations.length)]
          if (qualifications.some(x => x.stationId === candidate.id)) continue
          const scarcePenalty = candidate.id === 'process-b'
            ? shift === 'Night' ? 0.08 : 0.32
            : candidate.id === 'quality-gate' && shift === 'Night' ? 0.45 : 1
          if (rand() > scarcePenalty) continue
          qualifications.push(qualification(candidate.id, shift, i, rand))
          break
        }
      }

      shiftWorkers.push({
        id: id++,
        shift,
        absenceFactor: 0.72 + beta(8, 8, rand) * 0.56,
        qualifications,
      })
    }

    const processBExtras = shift === 'Early' ? 4 : shift === 'Late' ? 3 : 2
    let added = 0
    for (const w of shiftWorkers) {
      if (added >= processBExtras) break
      if (!w.qualifications.some(q => q.stationId === 'process-b')) {
        w.qualifications.push({
          stationId: 'process-b',
          expiresWeek: shift === 'Night' && added < 2 ? 4 + added : 99,
          trainingRank: 0.35 + rand() * 0.35,
          availableWeek: 0,
        })
        added++
      }
    }

    workers.push(...shiftWorkers)
  }

  return { seed, areas, stations, workers }
}

export const BASELINE_SCENARIO = {
  absenceRate: 6,
  demandPct: 0,
  trainingCoverage: 96,
  certHorizon: 0,
  week: 0,
} as const
