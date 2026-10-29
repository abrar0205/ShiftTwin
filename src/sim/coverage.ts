import { clamp, hash01 } from './rng'
import type { Plant, Scenario, Shift, Station, WorkerRecord } from './types'

interface Edge {
  to: number
  rev: number
  cap: number
}

class Dinic {
  private g: Edge[][]
  private level: number[]
  private it: number[]

  constructor(private n: number) {
    this.g = Array.from({ length: n }, () => [])
    this.level = new Array(n).fill(-1)
    this.it = new Array(n).fill(0)
  }

  addEdge(from: number, to: number, cap: number) {
    const a: Edge = { to, rev: this.g[to].length, cap }
    const b: Edge = { to: from, rev: this.g[from].length, cap: 0 }
    this.g[from].push(a)
    this.g[to].push(b)
    return a
  }

  private bfs(s: number, t: number) {
    this.level.fill(-1)
    const q = new Int32Array(this.n)
    let head = 0, tail = 0
    this.level[s] = 0
    q[tail++] = s
    while (head < tail) {
      const v = q[head++]
      for (const e of this.g[v]) {
        if (e.cap > 0 && this.level[e.to] < 0) {
          this.level[e.to] = this.level[v] + 1
          q[tail++] = e.to
        }
      }
    }
    return this.level[t] >= 0
  }

  private dfs(v: number, t: number, f: number): number {
    if (v === t) return f
    for (let i = this.it[v]; i < this.g[v].length; i++, this.it[v]++) {
      const e = this.g[v][i]
      if (e.cap <= 0 || this.level[v] + 1 !== this.level[e.to]) continue
      const d = this.dfs(e.to, t, Math.min(f, e.cap))
      if (d > 0) {
        e.cap -= d
        this.g[e.to][e.rev].cap += d
        return d
      }
    }
    return 0
  }

  maxFlow(s: number, t: number) {
    let flow = 0
    const INF = 1 << 20
    while (this.bfs(s, t)) {
      this.it.fill(0)
      for (;;) {
        const f = this.dfs(s, t, INF)
        if (!f) break
        flow += f
      }
    }
    return flow
  }
}

export function activeStationIds(worker: WorkerRecord, scenario: Scenario) {
  const trainingCut = scenario.trainingCoverage / 100
  const certCut = Math.max(scenario.week, scenario.certHorizon)
  const renewalCut = scenario.renewalRate / 100
  return worker.qualifications
    .filter(q => {
      if (q.trainingRank > trainingCut || q.availableWeek > scenario.week) return false
      if (q.expiresWeek > certCut) return true
      return q.renewalRank <= renewalCut
    })
    .map(q => q.stationId)
}

export function requirementFor(station: Station, scenario: Scenario) {
  return Math.max(1, Math.ceil(station.baseRequired * (1 + scenario.demandPct / 100)))
}

export function isPresent(plant: Plant, worker: WorkerRecord, sample: number, workerIndex: number, scenario: Scenario) {
  const p = clamp((scenario.absenceRate / 100) * worker.absenceFactor, 0.003, 0.45)
  return hash01(plant.seed + 4049, sample, workerIndex, scenario.week) >= p
}

export interface CoverageResult {
  full: boolean
  uncoveredStationIds: string[]
  deficits: Record<string, number>
}

export function solveShiftCoverage(
  stations: Station[],
  workers: Array<{ worker: WorkerRecord; eligible: string[] }>,
  scenario: Scenario,
): CoverageResult {
  const source = 0
  const workerStart = 1
  const stationStart = workerStart + workers.length
  const sink = stationStart + stations.length
  const dinic = new Dinic(sink + 1)
  const stationEdges: Edge[] = []

  workers.forEach((entry, wi) => {
    const wn = workerStart + wi
    dinic.addEdge(source, wn, 1)
    for (const sid of entry.eligible) {
      const si = stations.findIndex(s => s.id === sid)
      if (si >= 0) dinic.addEdge(wn, stationStart + si, 1)
    }
  })

  let totalRequired = 0
  stations.forEach((s, si) => {
    const req = requirementFor(s, scenario)
    totalRequired += req
    stationEdges.push(dinic.addEdge(stationStart + si, sink, req))
  })

  const flow = dinic.maxFlow(source, sink)
  const deficits: Record<string, number> = {}
  const uncoveredStationIds: string[] = []
  stations.forEach((s, i) => {
    const deficit = stationEdges[i].cap
    deficits[s.id] = deficit
    if (deficit > 0) uncoveredStationIds.push(s.id)
  })

  return { full: flow === totalRequired, uncoveredStationIds, deficits }
}

export function qualifiedPool(plant: Plant, stationId: string, shift: Shift, scenario: Scenario) {
  return plant.workers.filter(w => w.shift === shift && activeStationIds(w, scenario).includes(stationId)).length
}
