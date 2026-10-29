import { activeStationIds, isPresent, lapsedStationIds, qualifiedPool, requirementFor, solveShiftCoverage } from './coverage'
import type {
  AttributionStep,
  Plant,
  RepresentativeTrial,
  Scenario,
  Shift,
  SimResult,
  StationRisk,
  TimelinePoint,
  TrialWorkerState,
} from './types'

const SHIFTS: Shift[] = ['Early', 'Late', 'Night']
const z80 = 1.2815515655446004
const ATTRIBUTION_SAMPLES = 700
export const BASE_LINE_RATE_JPH = 60
export const SHIFT_HOURS = 8

function emptyRepresentative(shift: Shift, samples: number): RepresentativeTrial {
  return {
    shift,
    trialIndex: 0,
    sampleCount: samples,
    selection: 'median-shortfall',
    medianShortfall: 0,
    shortfall: 0,
    fullCoverage: false,
    workers: [],
    stations: [],
    targetLineRateJPH: BASE_LINE_RATE_JPH,
    lineRateJPH: 0,
    carsLostPerShift: BASE_LINE_RATE_JPH * SHIFT_HOURS,
    shiftHours: SHIFT_HOURS,
  }
}

function emptyResult(plant: Plant, scenario: Scenario, samples: number): SimResult {
  const station = plant.stations[0]
  const fallback: StationRisk = {
    stationId: station.id, stationName: station.name, areaId: station.areaId, shift: 'Early',
    required: requirementFor(station, scenario), qualifiedPool: 0, uncoveredProbability: 0, failureShare: 0,
  }
  return {
    samples,
    readiness: 0,
    p10: 0,
    p90: 0,
    shiftResults: [],
    stationRisks: [fallback],
    histogram: [],
    worst: fallback,
    criticalSkillCoverage: 0,
    attribution: [],
    representativeTrials: {
      Early: emptyRepresentative('Early', samples),
      Late: emptyRepresentative('Late', samples),
      Night: emptyRepresentative('Night', samples),
    },
  }
}

function medianShortfall(values: number[]) {
  const sorted = [...values].sort((a,b) => a-b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function buildRepresentativeTrial(
  plant: Plant,
  scenario: Scenario,
  shift: Shift,
  sample: number,
  samples: number,
  median: number,
): RepresentativeTrial {
  const shiftEntries = plant.workers
    .map((worker, globalIndex) => ({ worker, globalIndex }))
    .filter(entry => entry.worker.shift === shift)
    .map((entry, shiftIndex) => ({
      ...entry,
      slot: shiftIndex + 1,
      eligible: activeStationIds(entry.worker, scenario),
      lapsed: lapsedStationIds(entry.worker, scenario),
    }))

  const presentEntries = shiftEntries.filter(entry =>
    isPresent(plant, entry.worker, sample, entry.globalIndex, scenario)
  )

  const solved = solveShiftCoverage(
    plant.stations,
    presentEntries
      .filter(entry => entry.eligible.length > 0)
      .map(entry => ({ worker: entry.worker, eligible: entry.eligible, slot: entry.slot })),
    scenario,
  )

  const assignedStationBySlot = new Map<number, string>()
  for (const station of plant.stations) {
    for (const slot of solved.assignments[station.id] ?? []) assignedStationBySlot.set(slot, station.id)
  }

  const workers: TrialWorkerState[] = shiftEntries.map(entry => ({
    slot: entry.slot,
    present: presentEntries.some(p => p.slot === entry.slot),
    assignedStationId: assignedStationBySlot.get(entry.slot),
    eligibleStationIds: entry.eligible,
    lapsedStationIds: entry.lapsed,
  }))

  const stations = plant.stations.map(station => {
    const required = requirementFor(station, scenario)
    const assignedWorkerSlots = solved.assignments[station.id] ?? []
    const assigned = assignedWorkerSlots.length
    const deficit = Math.max(0, required - assigned)
    const throughputFactor = required > 0 ? Math.min(1, assigned / required) : 1
    const lapsedPresentWorkerSlots = presentEntries
      .filter(entry => entry.lapsed.includes(station.id) && !assignedStationBySlot.has(entry.slot))
      .map(entry => entry.slot)
    return {
      stationId: station.id,
      stationName: station.name,
      required,
      assigned,
      assignedWorkerSlots,
      lapsedPresentWorkerSlots,
      deficit,
      throughputFactor,
      status: deficit === 0 ? 'staffed' as const : deficit === 1 ? 'short' as const : 'uncovered' as const,
    }
  })

  const shortfall = stations.reduce((sum, station) => sum + station.deficit, 0)
  const bottleneckFactor = Math.min(...stations.map(station => station.throughputFactor))
  const targetLineRateJPH = BASE_LINE_RATE_JPH * (1 + scenario.demandPct / 100)
  const lineRateJPH = targetLineRateJPH * bottleneckFactor
  const carsLostPerShift = Math.max(0, (targetLineRateJPH - lineRateJPH) * SHIFT_HOURS)

  return {
    shift,
    trialIndex: sample + 1,
    sampleCount: samples,
    selection: 'median-shortfall',
    medianShortfall: median,
    shortfall,
    fullCoverage: solved.full,
    workers,
    stations,
    targetLineRateJPH,
    lineRateJPH,
    carsLostPerShift,
    shiftHours: SHIFT_HOURS,
  }
}

export function simulate(plant: Plant, scenario: Scenario, samples = 5000): SimResult {
  if (samples <= 0) return emptyResult(plant, scenario, samples)

  const workersByShift = new Map<Shift, Array<{ worker: typeof plant.workers[number]; index: number; slot: number; eligible: string[] }>>()
  for (const shift of SHIFTS) workersByShift.set(shift, [])
  for (const shift of SHIFTS) {
    let slot = 1
    plant.workers.forEach((worker, index) => {
      if (worker.shift !== shift) return
      workersByShift.get(shift)!.push({ worker, index, slot: slot++, eligible: activeStationIds(worker, scenario) })
    })
  }

  let plantFull = 0
  const shiftFull: Record<Shift, number> = { Early: 0, Late: 0, Night: 0 }
  const shiftUncoveredSum: Record<Shift, number> = { Early: 0, Late: 0, Night: 0 }
  const shortfalls: Record<Shift, number[]> = { Early: [], Late: [], Night: [] }
  const stationUncovered = new Map<string, number>()
  const firstFailure = new Map<string, number>()
  const histogram = new Map<number, number>()

  for (let sample = 0; sample < samples; sample++) {
    let allShifts = true
    let totalUncovered = 0

    for (const shift of SHIFTS) {
      const present = workersByShift.get(shift)!
        .filter(x => x.eligible.length > 0 && isPresent(plant, x.worker, sample, x.index, scenario))
        .map(x => ({ worker: x.worker, eligible: x.eligible, slot: x.slot }))

      const solved = solveShiftCoverage(plant.stations, present, scenario)
      if (solved.full) shiftFull[shift]++
      else allShifts = false

      totalUncovered += solved.uncoveredStationIds.length
      shiftUncoveredSum[shift] += solved.uncoveredStationIds.length
      shortfalls[shift].push(Object.values(solved.deficits).reduce((sum, value) => sum + value, 0))

      let firstKey: string | null = null
      let largestDeficit = -1
      for (const sid of solved.uncoveredStationIds) {
        const key = `${shift}|${sid}`
        stationUncovered.set(key, (stationUncovered.get(key) ?? 0) + 1)
        const d = solved.deficits[sid] ?? 0
        if (d > largestDeficit) {
          largestDeficit = d
          firstKey = key
        }
      }
      if (firstKey) firstFailure.set(firstKey, (firstFailure.get(firstKey) ?? 0) + 1)
    }

    if (allShifts) plantFull++
    histogram.set(totalUncovered, (histogram.get(totalUncovered) ?? 0) + 1)
  }

  const readiness = 100 * plantFull / samples
  const p = plantFull / samples
  const se = Math.sqrt(Math.max(1e-12, p * (1 - p) / samples))
  const p10 = Math.max(0, 100 * (p - z80 * se))
  const p90 = Math.min(100, 100 * (p + z80 * se))
  const totalFailures = Math.max(1, samples - plantFull)

  const stationRisks: StationRisk[] = []
  for (const shift of SHIFTS) {
    for (const station of plant.stations) {
      const key = `${shift}|${station.id}`
      stationRisks.push({
        stationId: station.id,
        stationName: station.name,
        areaId: station.areaId,
        shift,
        required: requirementFor(station, scenario),
        qualifiedPool: qualifiedPool(plant, station.id, shift, scenario),
        uncoveredProbability: 100 * (stationUncovered.get(key) ?? 0) / samples,
        failureShare: 100 * (firstFailure.get(key) ?? 0) / totalFailures,
      })
    }
  }

  stationRisks.sort((a, b) => b.uncoveredProbability - a.uncoveredProbability || b.failureShare - a.failureShare)
  const worst = stationRisks[0]

  const representativeTrials = Object.fromEntries(SHIFTS.map(shift => {
    const median = medianShortfall(shortfalls[shift])
    let chosenSample = 0
    let bestDistance = Infinity
    for (let sample = 0; sample < shortfalls[shift].length; sample++) {
      const distance = Math.abs(shortfalls[shift][sample] - median)
      if (distance < bestDistance) {
        bestDistance = distance
        chosenSample = sample
      }
    }
    return [shift, buildRepresentativeTrial(plant, scenario, shift, chosenSample, samples, median)]
  })) as Record<Shift, RepresentativeTrial>

  return {
    samples,
    readiness,
    p10,
    p90,
    shiftResults: SHIFTS.map(shift => ({
      shift,
      coverageProbability: 100 * shiftFull[shift] / samples,
      meanUncoveredStations: shiftUncoveredSum[shift] / samples,
    })),
    stationRisks,
    histogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([uncovered, count]) => ({ uncovered, count })),
    worst,
    criticalSkillCoverage: 100 - stationRisks.reduce((s, r) => s + r.uncoveredProbability, 0) / stationRisks.length,
    attribution: [],
    representativeTrials,
  }
}

const DRIVERS: Array<{ key: AttributionStep['key']; label: string; apply: (base: Scenario, target: Scenario) => Scenario }> = [
  { key: 'absence', label: 'Absence', apply: (base, target) => ({ ...base, absenceRate: target.absenceRate }) },
  { key: 'demand', label: 'Demand', apply: (base, target) => ({ ...base, demandPct: target.demandPct }) },
  { key: 'training', label: 'Training', apply: (base, target) => ({ ...base, trainingCoverage: target.trainingCoverage }) },
  { key: 'certification', label: 'Certification', apply: (base, target) => ({ ...base, certHorizon: target.certHorizon, renewalRate: target.renewalRate }) },
]

function factorial(n: number) {
  let value = 1
  for (let i = 2; i <= n; i++) value *= i
  return value
}

function scenarioForMask(base: Scenario, target: Scenario, mask: number) {
  let scenario = { ...base, week: target.week }
  DRIVERS.forEach((driver, index) => {
    if (mask & (1 << index)) scenario = driver.apply(scenario, target)
  })
  return scenario
}

export function shapleyAttribution(plant: Plant, baseline: Scenario, scenario: Scenario, displayedResult?: SimResult): AttributionStep[] {
  const n = DRIVERS.length
  const values = new Map<number, number>()
  for (let mask = 0; mask < (1 << n); mask++) {
    values.set(mask, simulate(plant, scenarioForMask(baseline, scenario, mask), ATTRIBUTION_SAMPLES).readiness)
  }

  const raw = DRIVERS.map((driver, i) => {
    let phi = 0
    for (let mask = 0; mask < (1 << n); mask++) {
      if (mask & (1 << i)) continue
      const size = DRIVERS.reduce((count, _d, j) => count + ((mask & (1 << j)) ? 1 : 0), 0)
      const weight = factorial(size) * factorial(n - size - 1) / factorial(n)
      phi += weight * ((values.get(mask | (1 << i)) ?? 0) - (values.get(mask) ?? 0))
    }
    return { key: driver.key, label: driver.label, delta: phi }
  })

  if (!displayedResult) return raw

  const baseDisplayed = simulate(plant, { ...baseline, week: scenario.week }, displayedResult.samples).readiness
  const desiredDelta = displayedResult.readiness - baseDisplayed
  const rawDelta = raw.reduce((sum, step) => sum + step.delta, 0)
  if (Math.abs(rawDelta) < 1e-9) return raw.map(step => ({ ...step, delta: 0 }))
  const scale = desiredDelta / rawDelta
  return raw.map(step => ({ ...step, delta: step.delta * scale }))
}

export function withAttribution(plant: Plant, baseline: Scenario, scenario: Scenario, result: SimResult): SimResult {
  return { ...result, attribution: shapleyAttribution(plant, baseline, scenario, result) }
}

export function buildTimeline(plant: Plant, scenario: Scenario, samples = 600): TimelinePoint[] {
  const points: TimelinePoint[] = []
  for (let week = 0; week <= 8; week++) {
    const r = simulate(plant, { ...scenario, week, certHorizon: Math.max(scenario.certHorizon, week) }, samples)
    points.push({ week, readiness: r.readiness, p10: r.p10, p90: r.p90 })
  }
  return points
}
