import { activeStationIds } from './coverage'
import { simulate } from './montecarlo'
import type { Intervention, Plan, Plant, Scenario, SimResult, Shift, WorkerRecord } from './types'

const clonePlant = (plant: Plant): Plant => ({
  ...plant,
  areas: plant.areas.map(x => ({ ...x })),
  stations: plant.stations.map(x => ({ ...x })),
  workers: plant.workers.map(w => ({ ...w, qualifications: w.qualifications.map(q => ({ ...q })) })),
})

function sim(plant: Plant, scenario: Scenario, samples = 600) {
  return simulate(plant, scenario, samples)
}

function chooseTraining(plant: Plant, scenario: Scenario, current: SimResult, budget = 4) {
  let working = clonePlant(plant)
  let evaluated = 0
  const chosen: Array<{ workerId: number; stationId: string }> = []

  for (let slot = 0; slot < budget; slot++) {
    const targets = current.stationRisks.slice(0, 3)
    const candidates: Array<{ worker: WorkerRecord; stationId: string }> = []

    for (const target of targets) {
      const pool = working.workers
        .filter(w => w.shift === target.shift && !activeStationIds(w, scenario).includes(target.stationId))
        .sort((a, b) => a.qualifications.length - b.qualifications.length)
        .slice(0, 3)
      for (const worker of pool) candidates.push({ worker, stationId: target.stationId })
    }

    let bestGain = -Infinity
    let best: typeof candidates[number] | null = null
    const before = sim(working, scenario, 320).readiness
    for (const candidate of candidates) {
      const test = clonePlant(working)
      const w = test.workers.find(x => x.id === candidate.worker.id)!
      w.qualifications.push({
        stationId: candidate.stationId,
        expiresWeek: 99,
        trainingRank: 0,
        availableWeek: 3,
      })
      const after = sim(test, { ...scenario, week: Math.max(3, scenario.week) }, 320).readiness
      evaluated++
      if (after - before > bestGain) {
        bestGain = after - before
        best = candidate
      }
    }

    if (!best) break
    const w = working.workers.find(x => x.id === best!.worker.id)!
    w.qualifications.push({ stationId: best.stationId, expiresWeek: 99, trainingRank: 0, availableWeek: 3 })
    chosen.push({ workerId: w.id, stationId: best.stationId })
  }

  const verificationScenario = { ...scenario, week: Math.max(3, scenario.week) }
  const result = sim(working, verificationScenario, 1800)
  return { plant: working, result, chosen, evaluated }
}

function chooseRebalance(plant: Plant, scenario: Scenario, current: SimResult, moves = 2) {
  let working = clonePlant(plant)
  let evaluated = 0
  const moved: Array<{ workerId: number; from: Shift; to: Shift }> = []
  const target = current.worst

  for (let m = 0; m < moves; m++) {
    let bestGain = -Infinity
    let best: { workerId: number; from: Shift; to: Shift; test: Plant } | null = null
    const before = sim(working, scenario, 300).readiness

    for (const donor of (['Early', 'Late', 'Night'] as Shift[]).filter(s => s !== target.shift)) {
      const candidates = working.workers
        .filter(w => w.shift === donor && activeStationIds(w, scenario).includes(target.stationId))
        .sort((a, b) => b.qualifications.length - a.qualifications.length)
        .slice(0, 4)

      for (const candidate of candidates) {
        const test = clonePlant(working)
        test.workers.find(w => w.id === candidate.id)!.shift = target.shift
        const r = sim(test, scenario, 300)
        evaluated++
        const donorCoverage = r.shiftResults.find(x => x.shift === donor)?.coverageProbability ?? 0
        const gain = r.readiness - before
        if (donorCoverage >= 88 && gain > bestGain) {
          bestGain = gain
          best = { workerId: candidate.id, from: donor, to: target.shift, test }
        }
      }
    }

    if (!best || bestGain <= 0) break
    working = best.test
    moved.push({ workerId: best.workerId, from: best.from, to: best.to })
  }

  return { plant: working, result: sim(working, scenario, 1600), moved, evaluated }
}

export function optimize(plant: Plant, scenario: Scenario, current: SimResult): { plan: Plan; optimizedPlant: Plant } {
  const training = chooseTraining(plant, scenario, current, 4)
  const rebalance = chooseRebalance(plant, scenario, current, 2)

  // Conservative approximation: temporary overtime/relief can absorb a small share
  // of incremental demand but is deliberately capped and never treated as a full substitute.
  const overtimeScenario = { ...scenario, demandPct: Math.max(0, scenario.demandPct - Math.min(5, scenario.demandPct)) }
  const overtimeResult = sim(plant, overtimeScenario, 1400)

  const combinedRebalance = chooseRebalance(training.plant, { ...scenario, week: Math.max(3, scenario.week) }, training.result, 1)
  const combinedResult = sim(combinedRebalance.plant, { ...scenario, week: Math.max(3, scenario.week) }, 2500)

  const stationName = current.worst.stationName
  const trainingGain = training.result.readiness - current.readiness
  const options: Intervention[] = [
    {
      id: 'training',
      title: 'Cross-training',
      description: `Build redundancy around ${stationName}`,
      readinessBefore: current.readiness,
      readinessAfter: training.result.readiness,
      leadWeeks: 3,
      actions: [`Add ${training.chosen.length} targeted qualification slots`, `Prioritize the highest marginal resilience gain`],
      valuePerSlot: training.chosen.length ? trainingGain / training.chosen.length : 0,
      result: training.result,
    },
    {
      id: 'rebalance',
      title: 'Shift rebalancing',
      description: `Move qualified capacity toward ${current.worst.shift} shift`,
      readinessBefore: current.readiness,
      readinessAfter: rebalance.result.readiness,
      leadWeeks: 0,
      actions: rebalance.moved.length
        ? [`Rebalance ${rebalance.moved.length} qualified positions`, 'Protect donor-shift viability']
        : ['No safe donor move improves the current scenario'],
      result: rebalance.result,
    },
    {
      id: 'overtime',
      title: 'Overtime / temporary relief',
      description: 'Short-term contingency under a conservative capacity cap',
      readinessBefore: current.readiness,
      readinessAfter: overtimeResult.readiness,
      leadWeeks: 0,
      actions: ['Model up to 5% equivalent short-term demand relief', 'Do not treat overtime as permanent capacity'],
      capped: true,
      result: overtimeResult,
    },
  ]

  const combined: Intervention = {
    id: 'combined',
    title: 'Recommended plan',
    description: 'Rebalance now, then add targeted cross-training',
    readinessBefore: current.readiness,
    readinessAfter: combinedResult.readiness,
    leadWeeks: 3,
    actions: [
      rebalance.moved.length ? 'Use immediate rebalancing where donor coverage remains viable' : 'Keep current shift allocation',
      `Add ${training.chosen.length} targeted qualification slots by week 3`,
      'Re-run the scenario after training completion',
    ],
    result: combinedResult,
  }

  const evaluated = training.evaluated + rebalance.evaluated + combinedRebalance.evaluated + 1
  return {
    plan: { evaluated, options, recommended: combined },
    optimizedPlant: combinedRebalance.plant,
  }
}
