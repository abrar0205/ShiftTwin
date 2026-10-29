import { create } from 'zustand'
import { BASELINE_SCENARIO, generatePlant } from '../sim/plant'
import type { Plan, Scenario, SimResult, TimelinePoint, WorkerRequest, WorkerResponse } from '../sim/types'

const plant = generatePlant(20261029)
const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })
let nextId = 1
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
  const msg = event.data
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  if (!msg.ok) p.reject(new Error(msg.error))
  else p.resolve(msg.result)
}

function request<T>(payload: Omit<WorkerRequest, 'id'>): Promise<T> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    worker.postMessage({ ...payload, id } as WorkerRequest)
  })
}

interface Store {
  scenario: Scenario
  baseline: SimResult | null
  result: SimResult | null
  previewResult: SimResult | null
  plan: Plan | null
  timeline: TimelinePoint[]
  running: boolean
  optimizing: boolean
  appliedPlan: boolean
  reducedMotion: boolean
  error: string | null
  initialize: () => Promise<void>
  setScenario: (patch: Partial<Scenario>) => void
  runPreview: () => Promise<void>
  runScenario: () => Promise<void>
  optimize: () => Promise<void>
  applyPlan: () => Promise<void>
  reset: () => Promise<void>
  setReducedMotion: (value: boolean) => void
}

export const useTwinStore = create<Store>((set, get) => ({
  scenario: { ...BASELINE_SCENARIO },
  baseline: null,
  result: null,
  previewResult: null,
  plan: null,
  timeline: [],
  running: false,
  optimizing: false,
  appliedPlan: false,
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  error: null,

  initialize: async () => {
    if (get().baseline) return
    set({ running: true, error: null })
    try {
      const baseline = await request<SimResult>({ type: 'simulate', plant, scenario: { ...BASELINE_SCENARIO }, samples: 5000 })
      const timeline = await request<TimelinePoint[]>({ type: 'timeline', plant, scenario: { ...BASELINE_SCENARIO }, optimized: false })
      set({ baseline, result: baseline, timeline, running: false })
    } catch (error) {
      set({ running: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  setScenario: patch => set(state => ({ scenario: { ...state.scenario, ...patch }, plan: null, appliedPlan: false })),

  runPreview: async () => {
    const scenario = get().scenario
    try {
      const previewResult = await request<SimResult>({ type: 'simulate', plant, scenario, samples: 300 })
      set({ previewResult })
    } catch {
      // previews are intentionally best-effort
    }
  },

  runScenario: async () => {
    const scenario = get().scenario
    set({ running: true, error: null, plan: null, appliedPlan: false })
    try {
      const result = await request<SimResult>({ type: 'simulate', plant, scenario, samples: 5000, baselineScenario: { ...BASELINE_SCENARIO } })
      const timeline = await request<TimelinePoint[]>({ type: 'timeline', plant, scenario, optimized: false })
      set({ result, previewResult: null, timeline, running: false })
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
    if (!plan) return
    set({ result: plan.recommended.result, appliedPlan: true })
    try {
      const timeline = await request<TimelinePoint[]>({ type: 'timeline', plant, scenario, optimized: true })
      set({ timeline })
    } catch {
      // plan result remains available even if timeline generation fails
    }
  },

  reset: async () => {
    set({ scenario: { ...BASELINE_SCENARIO }, plan: null, previewResult: null, appliedPlan: false })
    await get().initialize()
    const baseline = get().baseline
    if (baseline) set({ result: baseline })
  },

  setReducedMotion: reducedMotion => set({ reducedMotion }),
}))
