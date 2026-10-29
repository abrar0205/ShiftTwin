import { activeStationIds } from './coverage'
import { simulate } from './montecarlo'
import type { Intervention, Plan, Plant, Scenario, SimResult, Shift, WorkerRecord } from './types'

const VERIFY_SAMPLES = 1800
const SEARCH_SAMPLES = 360
const TARGET_LEAD_WEEKS = 3

const clonePlant = (plant: Plant): Plant => ({
  ...plant,
  areas: plant.areas.map(x => ({ ...x })),
  stations: plant.stations.map(x => ({ ...x })),
  workers: plant.workers.map(w => ({ ...w, qualifications: w.qualifications.map(q => ({ ...q })) })),
})

function sim(plant: Plant, scenario: Scenario, samples = SEARCH_SAMPLES) {
  return simulate(plant, scenario, samples)
}

function chooseTraining(plant: Plant, scenario: Scenario, current: SimResult, budget = 4) {
  let working = clonePlant(plant)
  let evaluated = 0
  const chosen: Array<{ workerId: number; stationId: string }> = []

  for (let slot = 0; slot < budget; slot++) {
    const targets = current.stationRisks.slice(0, 4)
    const candidates: Array<{ worker: WorkerRecord; stationId: string }> = []

    for (const target of targets) {
      const pool = working.workers
        .filter(w => w.shift === target.shift && !activeStationIds(w, scenario).includes(target.stationId))
        .sort((a, b) => a.qualifications.length - b.qualifications.length)
        .slice(0, 4)
      for (const worker of pool) candidates.push({ worker, stationId: target.stationId })
    }

    let bestGain = 0
    let best: typeof candidates[number] | null = null
    const before = sim(working, scenario, SEARCH_SAMPLES).readiness
    for (const candidate of candidates) {
      const test = clonePlant(working)
      const w = test.workers.find(x => x.id === candidate.worker.id)!
      w.qualifications.push({
        stationId: candidate.stationId,
        expiresWeek: 99,
        renewalRank: 0,
        trainingRank: 0,
        availableWeek: scenario.week,
      })
      const after = sim(test, scenario, SEARCH_SAMPLES).readiness
      evaluated++
      if (after - before > bestGain + 1e-9) {
        bestGain = after - before
        best = candidate
      }
    }

    if (!best) break
    const w = working.workers.find(x => x.id === best.worker.id)!
    w.qualifications.push({ stationId: best.stationId, expiresWeek: 99, renewalRank: 0, trainingRank: 0, availableWeek: scenario.week })
    chosen.push({ workerId: w.id, stationId: best.stationId })
  }

  return { plant: working, chosen, evaluated }
}

function chooseRebalance(plant: Plant, scenario: Scenario, current: SimResult, moves = 2) {
  let working = clonePlant(plant)
  let evaluated = 0
  const moved: Array<{ workerId: number; from: Shift; to: Shift }> = []
  let focus = current

  for (let m = 0; m < moves; m++) {
    const target = focus.worst
    let bestGain = 0
    let best: { workerId: number; from: Shift; to: Shift; test: Plant; result: SimResult } | null = null
    const before = sim(working, scenario, SEARCH_SAMPLES).readiness

    for (const donor of (['Early', 'Late', 'Night'] as Shift[]).filter(s => s !== target.shift)) {
      const candidates = working.workers
        .filter(w => w.shift === donor && activeStationIds(w, scenario).includes(target.stationId))
        .sort((a, b) => b.qualifications.length - a.qualifications.length)
        .slice(0, 5)

      for (const candidate of candidates) {
        const test = clonePlant(working)
        test.workers.find(w => w.id === candidate.id)!.shift = target.shift
        const r = sim(test, scenario, SEARCH_SAMPLES)
        evaluated++
        const donorCoverage = r.shiftResults.find(x => x.shift === donor)?.coverageProbability ?? 0
        const gain = r.readiness - before
        if (donorCoverage >= 85 && gain > bestGain + 1e-9) {
          bestGain = gain
          best = { workerId: candidate.id, from: donor, to: target.shift, test, result: r }
        }
      }
    }

    if (!best) break
    working = best.test
    focus = best.result
    moved.push({ workerId: best.workerId, from: best.from, to: best.to })
  }

  return { plant: working, moved, evaluated }
}

function asIntervention(
  id: Intervention['id'],
  title: string,
  description: string,
  before: SimResult,
  after: SimResult,
  evaluationWeek: number,
  leadWeeks: number,
  actions: string[],
  extra: Partial<Intervention> = {},
): Intervention {
  return {
    id, title, description,
    readinessBefore: before.readiness,
    readinessAfter: after.readiness,
    evaluationWeek,
    leadWeeks,
    actions,
    result: after,
    ...extra,
  }
}

export function optimize(plant: Plant, scenario: Scenario, _current: SimResult): { plan: Plan; optimizedPlant: Plant } {
  const targetWeek = Math.max(scenario.week, scenario.week + TARGET_LEAD_WEEKS)
  const targetScenario: Scenario = { ...scenario, week: targetWeek, certHorizon: Math.max(scenario.certHorizon, targetWeek) }
  const before = sim(plant, targetScenario, VERIFY_SAMPLES)

  const training = chooseTraining(plant, targetScenario, before, 4)
  const trainingResult = sim(training.plant, targetScenario, VERIFY_SAMPLES)

  const rebalance = chooseRebalance(plant, targetScenario, before, 2)
  const rebalanceResult = sim(rebalance.plant, targetScenario, VERIFY_SAMPLES)

  // Phase 1 keeps the existing conservative relief approximation, but verifies it
  // at exactly the same week, N and random trials as every other option.
  const overtimeScenario: Scenario = { ...targetScenario, demandPct: Math.max(0, targetScenario.demandPct - Math.min(5, targetScenario.demandPct)) }
  const overtimeResult = sim(plant, overtimeScenario, VERIFY_SAMPLES)

  const trainingFocus = sim(training.plant, targetScenario, SEARCH_SAMPLES)
  const combinedRebalance = chooseRebalance(training.plant, targetScenario, trainingFocus, 1)
  const combinedResult = sim(combinedRebalance.plant, targetScenario, VERIFY_SAMPLES)

  const stationName = before.worst.stationName
  const trainingGain = Math.max(0, trainingResult.readiness - before.readiness)
  const options: Intervention[] = [
    asIntervention(
      'training', 'Cross-training', `Build redundancy around ${stationName}`,
      before, trainingResult, targetWeek, TARGET_LEAD_WEEKS,
      [`Add ${training.chosen.length} targeted qualification slots`, 'Prioritize the highest marginal resilience gain'],
      { valuePerSlot: training.chosen.length ? trainingGain / training.chosen.length : 0 },
    ),
    asIntervention(
      'rebalance', 'Shift rebalancing', `Move qualified capacity toward ${before.worst.shift} shift`,
      before, rebalanceResult, targetWeek, 0,
      rebalance.moved.length
        ? [`Rebalance ${rebalance.moved.length} qualified positions`, 'Protect donor-shift viability']
        : ['No safe donor move improves the target-week scenario'],
    ),
    asIntervention(
      'overtime', 'Overtime / temporary relief', 'Short-term contingency under a conservative capacity cap',
      before, overtimeResult, targetWeek, 0,
      ['Model up to 5% equivalent short-term demand relief', 'Do not treat overtime as permanent capacity'],
      { capped: true },
    ),
  ]

  const combined = asIntervention(
    'combined', 'Combined response', 'Targeted cross-training plus safe shift rebalancing',
    before, combinedResult, targetWeek, TARGET_LEAD_WEEKS,
    [
      combinedRebalance.moved.length ? 'Use immediate rebalancing where donor coverage remains viable' : 'Keep current shift allocation',
      `Add ${training.chosen.length} targeted qualification slots by week ${targetWeek}`,
      'Re-run the scenario after training completion',
    ],
  )

  const candidates = [...options, combined]
  const recommended = candidates.reduce((best, candidate) => {
    if (candidate.readinessAfter > best.readinessAfter + 1e-9) return candidate
    if (Math.abs(candidate.readinessAfter - best.readinessAfter) <= 1e-9 && candidate.leadWeeks < best.leadWeeks) return candidate
    return best
  })

  const plantById: Record<Intervention['id'], Plant> = {
    training: training.plant,
    rebalance: rebalance.plant,
    overtime: plant,
    combined: combinedRebalance.plant,
  }

  const evaluated = training.evaluated + rebalance.evaluated + combinedRebalance.evaluated + 1
  return {
    plan: { evaluated, options, recommended },
    optimizedPlant: plantById[recommended.id],
  }
}
