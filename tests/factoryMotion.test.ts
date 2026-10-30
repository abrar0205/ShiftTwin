import { describe, expect, it } from 'vitest'
import {
  advanceLineMotion,
  carAtStation,
  createLineMotion,
  dwellSeconds,
  stationIsStarved,
  visualTaktSeconds,
} from '../src/sim/factoryMotion'
import type { RepresentativeTrial, TrialStationState } from '../src/sim/types'

function station(index: number, factor = 1): TrialStationState {
  return {
    stationId: `s-${index}`,
    stationName: `Station ${index}`,
    required: 4,
    assigned: Math.round(4 * factor),
    assignedWorkerSlots: [],
    lapsedPresentWorkerSlots: [],
    deficit: Math.max(0, 4 - Math.round(4 * factor)),
    throughputFactor: factor,
    status: factor >= 1 ? 'staffed' : factor > 0 ? 'short' : 'uncovered',
  }
}

function trial(factors: number[]): RepresentativeTrial {
  return {
    shift:'Night',
    trialIndex:1,
    sampleCount:5000,
    selection:'median-failing-shortfall',
    medianShortfall:1,
    shortfall:1,
    fullCoverage:false,
    workers:[],
    stations:factors.map((factor,index)=>station(index,factor)),
    targetLineRateJPH:60,
    lineRateJPH:60*Math.min(...factors),
    carsLostPerShift:(60-60*Math.min(...factors))*8,
    shiftHours:8,
  }
}

describe('Living Factory motion model', () => {
  it('derives visual takt and dwell from model throughput', () => {
    expect(visualTaktSeconds(60)).toBeCloseTo(60/18,8)
    expect(dwellSeconds(60,0.5)).toBeGreaterThan(dwellSeconds(60,1))
    expect(dwellSeconds(60,0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('never advances a car held at a zero-throughput bottleneck', () => {
    const t=trial([1,0,1,1])
    const state=createLineMotion(t)
    const heldId=state.slots[1]
    expect(heldId).not.toBeNull()

    for(let i=0;i<500;i++) advanceLineMotion(state,t,0.05)

    expect(state.slots[1]).toBe(heldId)
    expect(carAtStation(state,1)?.moving).toBe(false)
    expect(state.lineStopped).toBe(true)
  })

  it('keeps station slots uniquely occupied while cars advance', () => {
    const t=trial([1,0.75,1,1,1,1])
    const state=createLineMotion(t)
    for(let i=0;i<700;i++) {
      advanceLineMotion(state,t,0.05)
      const occupied=state.slots.filter((id): id is number => id != null)
      expect(new Set(occupied).size).toBe(occupied.length)
      for(const id of occupied) expect(state.cars.has(id)).toBe(true)
    }
  })

  it('allows downstream starvation to emerge behind a constrained bottleneck', () => {
    const t=trial([1,0,1,1,1,1])
    const state=createLineMotion(t)
    let sawStarvation=false
    for(let i=0;i<1200;i++) {
      advanceLineMotion(state,t,0.05)
      if([2,3,4,5].some(index=>stationIsStarved(state,t,index))) {
        sawStarvation=true
        break
      }
    }
    expect(sawStarvation).toBe(true)
  })

  it('a slower station holds its car longer than a fully staffed station', () => {
    const t=trial([1,0.5,1,1])
    const state=createLineMotion(t)
    const fast=carAtStation(state,0)
    const slow=carAtStation(state,1)
    expect(fast).not.toBeNull()
    expect(slow).not.toBeNull()
    expect(slow!.readyAt).toBeGreaterThan(fast!.readyAt)
  })
})
