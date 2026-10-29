/// <reference lib="webworker" />
import { buildTimeline, simulate, withAttribution } from './montecarlo'
import { optimize } from './optimizer'
import type { Plant, WorkerRequest, WorkerResponse } from './types'

let optimizedPlant: Plant | null = null

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'simulate') {
      let result = simulate(msg.plant, msg.scenario, msg.samples)
      if (msg.baselineScenario && msg.samples >= 1000) {
        result = withAttribution(msg.plant, msg.baselineScenario, msg.scenario, result)
      }
      const out: WorkerResponse = { id: msg.id, ok: true, type: 'simulate', result }
      self.postMessage(out)
      return
    }

    if (msg.type === 'optimize') {
      const optimized = optimize(msg.plant, msg.scenario, msg.current)
      optimizedPlant = optimized.optimizedPlant
      const out: WorkerResponse = { id: msg.id, ok: true, type: 'optimize', result: optimized.plan }
      self.postMessage(out)
      return
    }

    const target = msg.optimized && optimizedPlant ? optimizedPlant : msg.plant
    const result = buildTimeline(target, msg.scenario, 600)
    const out: WorkerResponse = { id: msg.id, ok: true, type: 'timeline', result }
    self.postMessage(out)
  } catch (error) {
    const out: WorkerResponse = { id: msg.id, ok: false, error: error instanceof Error ? error.message : String(error) }
    self.postMessage(out)
  }
}
