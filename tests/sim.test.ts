import { describe, expect, it } from 'vitest'
import { generatePlant, BASELINE_SCENARIO } from '../src/sim/plant'
import { simulate } from '../src/sim/montecarlo'
import { activeStationIds, solveShiftCoverage } from '../src/sim/coverage'
import type { Plant, Station, WorkerRecord } from '../src/sim/types'

describe('ShiftTwin simulation', () => {
  it('generates the same synthetic plant from the same seed', () => {
    expect(generatePlant(42)).toEqual(generatePlant(42))
  })

  it('respects one-worker-per-station matching capacity', () => {
    const stations: Station[] = [
      { id:'a', name:'A', areaId:'x', critical:true, baseRequired:1 },
      { id:'b', name:'B', areaId:'x', critical:true, baseRequired:1 },
    ]
    const worker: WorkerRecord = {
      id:1, shift:'Early', absenceFactor:1,
      qualifications:[
        {stationId:'a',expiresWeek:99,trainingRank:0,availableWeek:0},
        {stationId:'b',expiresWeek:99,trainingRank:0,availableWeek:0},
      ],
    }
    const result=solveShiftCoverage(stations,[{worker,eligible:['a','b']}],{...BASELINE_SCENARIO})
    expect(result.full).toBe(false)
    expect(result.uncoveredStationIds).toHaveLength(1)
  })

  it('is deterministic under common random numbers', () => {
    const plant=generatePlant(2026)
    const a=simulate(plant,{...BASELINE_SCENARIO,absenceRate:9,demandPct:10},240)
    const b=simulate(plant,{...BASELINE_SCENARIO,absenceRate:9,demandPct:10},240)
    expect(a.readiness).toBe(b.readiness)
    expect(a.worst.stationId).toBe(b.worst.stationId)
  })

  it('adding a qualification cannot reduce matching-based readiness under the same random trials', () => {
    const plant=generatePlant(99)
    const scenario={...BASELINE_SCENARIO,absenceRate:10,demandPct:12,trainingCoverage:95}
    const before=simulate(plant,scenario,260)
    const target=before.worst
    const copy: Plant={
      ...plant,
      workers:plant.workers.map(w=>({...w,qualifications:w.qualifications.map(q=>({...q}))})),
      areas:plant.areas.map(a=>({...a})),
      stations:plant.stations.map(s=>({...s})),
    }
    const candidate=copy.workers.find(w=>w.shift===target.shift && !activeStationIds(w,scenario).includes(target.stationId))
    expect(candidate).toBeTruthy()
    candidate!.qualifications.push({stationId:target.stationId,expiresWeek:99,trainingRank:0,availableWeek:0})
    const after=simulate(copy,scenario,260)
    expect(after.readiness).toBeGreaterThanOrEqual(before.readiness)
  })
})
