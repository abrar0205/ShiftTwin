import { create } from 'zustand'
import { BASELINE_SCENARIO, generatePlant } from '../sim/plant'
import type { Plan, Scenario, SimResult, TimelinePoint, WorkerRequest, WorkerResponse } from '../sim/types'

let plantSeed = 20261029
let plant = generatePlant(plantSeed)
const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })
let nextId = 1
let previewGeneration = 0
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
  const msg = event.data
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  if (!msg.ok) p.reject(new Error(msg.error))
  else p.resolve(msg.result)
}

type WorkerRequestPayload = WorkerRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id'>
    : never
  : never

function request<T>(payload: WorkerRequestPayload): Promise<T> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker.postMessage({ ...payload, id } as WorkerRequest)
  })
}

interface Store {
  seed: number
  scenario: Scenario
  baseline: SimResult | null
  result: SimResult | null
  previousResult: SimResult | null
  appliedResult: SimResult | null
  previewResult: SimResult | null
  plan: Plan | null
  timeline: TimelinePoint[]
  running: boolean
  optimizing: boolean
  applyingPlan: boolean
  appliedPlan: boolean
  runId: number
  healId: number
  sequenceSkipId: number
  reducedMotion: boolean
  error: string | null
  initialize: () => Promise<void>
  setScenario: (patch: Partial<Scenario>) => void
  runPreview: () => Promise<void>
  runScenario: () => Promise<void>
  optimize: () => Promise<void>
  applyPlan: () => Promise<void>
  completePlanApply: () => void
  skipSequence: () => void
  reset: () => Promise<void>
  regeneratePlant: () => Promise<void>
  setReducedMotion: (value: boolean) => void
}

async function buildBaseline() {
  const baseline = await request<SimResult>({ type: 'simulate', plant, scenario: { ...BASELINE_SCENARIO }, samples: 5000 })
  const frozenShot = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('freeze') === '1'
  const timeline = frozenShot
    ? [{ week: 0, readiness: baseline.readiness, p10: baseline.p10, p90: baseline.p90 }]
    : await request<TimelinePoint[]>({ type: 'timeline', plant, scenario: { ...BASELINE_SCENARIO }, optimized: false })
  return { baseline, timeline }
}

export const useTwinStore = create<Store>((set, get) => ({
  seed: plantSeed,
  scenario: { ...BASELINE_SCENARIO },
  baseline: null,
  result: null,
  previousResult: null,
  appliedResult: null,
  previewResult: null,
  plan: null,
  timeline: [],
  running: false,
  optimizing: false,
  applyingPlan: false,
  appliedPlan: false,
  runId: 0,
  healId: 0,
  sequenceSkipId: 0,
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  error: null,

  initialize: async () => {
    if (get().baseline) return
    set({ running: true, error: null })
    try {
      const { baseline, timeline } = await buildBaseline()
      set({ baseline, result: baseline, timeline, running: false })
    } catch (error) {
      set({ running: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  setScenario: patch => set(state => ({
    scenario: { ...state.scenario, ...patch },
    plan: null,
    appliedPlan: false,
    applyingPlan: false,
    appliedResult: null,
  })),

  runPreview: async () => {
    const generation = ++previewGeneration
    const scenario = get().scenario
    try {
      const previewResult = await request<SimResult>({ type: 'simulate', plant, scenario, samples: 300 })
      if (generation === previewGeneration && !get().running) set({ previewResult })
    } catch {
      // previews are intentionally best-effort
    }
  },

  runScenario: async () => {
    const scenario = get().scenario
    const before = get().appliedResult ?? get().result
    previewGeneration++
    set({
      running: true,
      error: null,
      plan: null,
      appliedPlan: false,
      applyingPlan: false,
      appliedResult: null,
      previewResult: null,
      previousResult: before,
    })
    try {
      const result = await request<SimResult>({
        type: 'simulate',
        plant,
        scenario,
        samples: 5000,
        baselineScenario: { ...BASELINE_SCENARIO },
      })
      const timeline = await request<TimelinePoint[]>({ type: 'timeline', plant, scenario, optimized: false })
      set(state => ({
        result,
        timeline,
        running: false,
        runId: state.runId + 1,
      }))
    } catch (error) {
      set({ running: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  optimize: async () => {
    const { scenario, result } = get()
    if (!result) return
    set({ optimizing: true, error: null })
    try {
      const plan = await request<Plan>({ type: 'optimize', plant, scenario, current: result })
      set({ plan, optimizing: false })
    } catch (error) {
      set({ optimizing: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  applyPlan: async () => {
    const { plan, scenario } = get()
    if (!plan || get().applyingPlan || get().appliedPlan) return

    set(state => ({
      applyingPlan: true,
      error: null,
      healId: state.healId + 1,
      appliedResult: null,
    }))

    try {
      const timeline = await request<TimelinePoint[]>({
        type: 'timeline',
        plant,
        scenario: { ...scenario, week: plan.recommended.evaluationWeek },
        optimized: true,
      })
      set({ timeline })
    } catch {
      // The verified plan result remains valid even if timeline generation fails.
    }
  },

  completePlanApply: () => {
    const plan = get().plan
    if (!plan) return
    set({
      appliedResult: plan.recommended.result,
      appliedPlan: true,
      applyingPlan: false,
    })
  },

  skipSequence: () => set(state => ({ sequenceSkipId: state.sequenceSkipId + 1 })),

  reset: async () => {
    previewGeneration++
    const { baseline } = get()
    const timeline = await request<TimelinePoint[]>({ type: 'timeline', plant, scenario: { ...BASELINE_SCENARIO }, optimized: false })
    set({
      scenario: { ...BASELINE_SCENARIO },
      plan: null,
      previewResult: null,
      previousResult: null,
      appliedResult: null,
      appliedPlan: false,
      applyingPlan: false,
      result: baseline,
      timeline,
    })
  },

  regeneratePlant: async () => {
    previewGeneration++
    plantSeed += 1
    plant = generatePlant(plantSeed)
    set({
      seed: plantSeed,
      running: true,
      baseline: null,
      result: null,
      previousResult: null,
      appliedResult: null,
      plan: null,
      previewResult: null,
      appliedPlan: false,
      applyingPlan: false,
      scenario: { ...BASELINE_SCENARIO },
      error: null,
    })
    try {
      const { baseline, timeline } = await buildBaseline()
      set({ baseline, result: baseline, timeline, running: false })
    } catch (error) {
      set({ running: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  setReducedMotion: reducedMotion => set({ reducedMotion }),
}))
