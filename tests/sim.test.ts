import { describe, expect, it } from 'vitest'
import { generatePlant, BASELINE_SCENARIO } from '../src/sim/plant'
import { shapleyAttribution, simulate } from '../src/sim/montecarlo'
import { activeStationIds, solveShiftCoverage } from '../src/sim/coverage'
import { optimize } from '../src/sim/optimizer'
import type { Plant, Station, WorkerRecord } from '../src/sim/types'

const PRESETS = {
  baseline: { ...BASELINE_SCENARIO },
  flu: { ...BASELINE_SCENARIO, absenceRate: 12 },
  ramp: { ...BASELINE_SCENARIO, absenceRate: 7, demandPct: 15, trainingCoverage: 94 },
  holiday: { ...BASELINE_SCENARIO, absenceRate: 10, demandPct: 5, trainingCoverage: 94, certHorizon: 1 },
  cert: { ...BASELINE_SCENARIO, absenceRate: 7, demandPct: 5, certHorizon: 6, renewalRate: 35 },
}

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
        {stationId:'a',expiresWeek:99,renewalRank:0,trainingRank:0,availableWeek:0},
        {stationId:'b',expiresWeek:99,renewalRank:0,trainingRank:0,availableWeek:0},
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

  it('keeps the reference scenarios in calibrated operating ranges', () => {
    const plant=generatePlant(20261029)
    const values={
      baseline:simulate(plant,PRESETS.baseline,1600).readiness,
      flu:simulate(plant,PRESETS.flu,1600).readiness,
      ramp:simulate(plant,PRESETS.ramp,1600).readiness,
      holiday:simulate(plant,PRESETS.holiday,1600).readiness,
      cert:simulate(plant,PRESETS.cert,1600).readiness,
    }
    console.info('CALIBRATION', values)
    expect(values.baseline).toBeGreaterThanOrEqual(92)
    expect(values.baseline).toBeLessThanOrEqual(96)
    expect(values.flu).toBeGreaterThanOrEqual(82)
    expect(values.flu).toBeLessThanOrEqual(89)
    expect(values.ramp).toBeGreaterThanOrEqual(76)
    expect(values.ramp).toBeLessThanOrEqual(85)
    expect(values.holiday).toBeGreaterThanOrEqual(68)
    expect(values.holiday).toBeLessThanOrEqual(78)
    expect(values.cert).toBeGreaterThanOrEqual(64)
    expect(values.cert).toBeLessThanOrEqual(78)
  })

  it('produces order-independent Shapley attribution that sums to the displayed change', () => {
    const plant=generatePlant(20261029)
    const scenario=PRESETS.holiday
    const result=simulate(plant,scenario,900)
    const attribution=shapleyAttribution(plant,BASELINE_SCENARIO,scenario,result)
    const baseline=simulate(plant,{...BASELINE_SCENARIO,week:scenario.week},result.samples)
    const sum=attribution.reduce((s,x)=>s+x.delta,0)
    expect(sum).toBeCloseTo(result.readiness-baseline.readiness,6)
  })

  it('recommends the highest-scoring verified intervention', () => {
    const plant=generatePlant(20261029)
    const current=simulate(plant,PRESETS.holiday,900)
    const { plan }=optimize(plant,PRESETS.holiday,current)
    const best=Math.max(...plan.options.map(x=>x.readinessAfter),plan.recommended.readinessAfter)
    expect(plan.recommended.readinessAfter).toBeCloseTo(best,8)
    for (const option of plan.options) {
      if (option.id==='training' || option.id==='overtime') {
        expect(option.readinessAfter).toBeGreaterThanOrEqual(option.readinessBefore)
      }
    }
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
    candidate!.qualifications.push({stationId:target.stationId,expiresWeek:99,renewalRank:0,trainingRank:0,availableWeek:0})
    const after=simulate(copy,scenario,260)
    expect(after.readiness).toBeGreaterThanOrEqual(before.readiness)
  })
})
