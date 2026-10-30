import type { RepresentativeTrial } from './types'

export const CAR_MOVE_SECONDS = 1.1
export const VISUAL_TIME_COMPRESSION = 18
export const MAX_VISIBLE_CARS = 12

export interface MotionCar {
  id: number
  slot: number
  fromSlot: number
  moving: boolean
  moveStart: number
  moveEnd: number
  arrivedAt: number
  readyAt: number
}

export interface LineMotionState {
  time: number
  slots: Array<number | null>
  cars: Map<number, MotionCar>
  nextCarId: number
  nextInjectAt: number
  movingSegments: Set<number>
  bottleneckIndex: number
  bottleneckHoldSince: number | null
  lineStopped: boolean
}

export function visualTaktSeconds(targetLineRateJPH: number) {
  const safeRate = Math.max(1, targetLineRateJPH)
  return (3600 / safeRate) / VISUAL_TIME_COMPRESSION
}

export function dwellSeconds(targetLineRateJPH: number, throughputFactor: number) {
  if (throughputFactor <= 0) return Number.POSITIVE_INFINITY
  const cycle = visualTaktSeconds(targetLineRateJPH) / Math.max(0.05, throughputFactor)
  return Math.max(0.12, cycle - CAR_MOVE_SECONDS)
}

function stationFactor(trial: RepresentativeTrial, slot: number) {
  if (slot < 0 || slot >= trial.stations.length) return 1
  return trial.stations[slot]?.throughputFactor ?? 1
}

function initialSlots(stationCount: number) {
  if (stationCount <= 0) return []
  const preferred = [0,1,2,3,4,5,6,8,9,11]
  return preferred.filter(slot => slot < stationCount).slice(0, Math.min(MAX_VISIBLE_CARS, stationCount))
}

export function createLineMotion(trial: RepresentativeTrial): LineMotionState {
  const slots = Array.from({ length: trial.stations.length }, () => null as number | null)
  const cars = new Map<number, MotionCar>()
  const populated = initialSlots(trial.stations.length)
  let nextId = 1

  for (let index = 0; index < populated.length; index++) {
    const slot = populated[index]
    const id = nextId++
    slots[slot] = id
    const dwell = dwellSeconds(trial.targetLineRateJPH, stationFactor(trial, slot))
    cars.set(id, {
      id,
      slot,
      fromSlot: slot,
      moving: false,
      moveStart: 0,
      moveEnd: 0,
      arrivedAt: 0,
      readyAt: Number.isFinite(dwell) ? dwell * (0.2 + (index % 4) * 0.12) : Number.POSITIVE_INFINITY,
    })
  }

  const bottleneckIndex = trial.stations.reduce((best, station, index, all) =>
    station.throughputFactor < all[best].throughputFactor ? index : best
  , 0)

  return {
    time: 0,
    slots,
    cars,
    nextCarId: nextId,
    nextInjectAt: visualTaktSeconds(trial.targetLineRateJPH) * 0.6,
    movingSegments: new Set<number>(),
    bottleneckIndex,
    bottleneckHoldSince: null,
    lineStopped: false,
  }
}

function startMove(state: LineMotionState, car: MotionCar, toSlot: number) {
  const fromSlot = car.slot
  car.fromSlot = fromSlot
  car.slot = toSlot
  car.moving = true
  car.moveStart = state.time
  car.moveEnd = state.time + CAR_MOVE_SECONDS
  car.arrivedAt = state.time
  car.readyAt = Number.POSITIVE_INFINITY
  if (fromSlot >= 0) state.movingSegments.add(fromSlot)
  if (toSlot >= 0 && toSlot < state.slots.length) state.movingSegments.add(toSlot)
}

function finishMoves(state: LineMotionState, trial: RepresentativeTrial) {
  for (const car of [...state.cars.values()]) {
    if (!car.moving || state.time < car.moveEnd) continue
    car.moving = false
    car.arrivedAt = state.time

    if (car.slot >= state.slots.length) {
      state.cars.delete(car.id)
      continue
    }

    const dwell = dwellSeconds(trial.targetLineRateJPH, stationFactor(trial, car.slot))
    car.readyAt = Number.isFinite(dwell) ? state.time + dwell : Number.POSITIVE_INFINITY
  }
}

function tryAdvance(state: LineMotionState, trial: RepresentativeTrial) {
  const last = state.slots.length - 1

  for (let slot = last; slot >= 0; slot--) {
    const id = state.slots[slot]
    if (id == null) continue
    const car = state.cars.get(id)
    if (!car || car.moving || state.time < car.readyAt) continue

    if (slot === last) {
      state.slots[slot] = null
      startMove(state, car, last + 1)
      continue
    }

    if (state.slots[slot + 1] == null) {
      state.slots[slot] = null
      state.slots[slot + 1] = id
      startMove(state, car, slot + 1)
    }
  }
}

function tryInject(state: LineMotionState, trial: RepresentativeTrial) {
  if (state.slots.length === 0 || state.slots[0] != null || state.time < state.nextInjectAt) return
  if (state.cars.size >= MAX_VISIBLE_CARS) return

  const id = state.nextCarId++
  const car: MotionCar = {
    id,
    slot: 0,
    fromSlot: -1,
    moving: true,
    moveStart: state.time,
    moveEnd: state.time + CAR_MOVE_SECONDS,
    arrivedAt: state.time,
    readyAt: Number.POSITIVE_INFINITY,
  }
  state.cars.set(id, car)
  state.slots[0] = id
  state.movingSegments.add(0)
  state.nextInjectAt = state.time + visualTaktSeconds(trial.targetLineRateJPH)
}

function refreshMovingSegments(state: LineMotionState) {
  state.movingSegments.clear()
  for (const car of state.cars.values()) {
    if (!car.moving) continue
    if (car.fromSlot >= 0 && car.fromSlot < state.slots.length) state.movingSegments.add(car.fromSlot)
    if (car.slot >= 0 && car.slot < state.slots.length) state.movingSegments.add(car.slot)
  }
}

function updateBottleneckState(state: LineMotionState, trial: RepresentativeTrial) {
  const index = state.bottleneckIndex
  const factor = trial.stations[index]?.throughputFactor ?? 1
  const id = state.slots[index]
  const car = id == null ? null : state.cars.get(id)
  const holding = Boolean(car && !car.moving && factor < 1)

  if (holding && state.bottleneckHoldSince == null) state.bottleneckHoldSince = state.time
  if (!holding) state.bottleneckHoldSince = null
  state.lineStopped = Boolean(car && !car.moving && factor <= 0)
}

export function advanceLineMotion(
  state: LineMotionState,
  trial: RepresentativeTrial,
  deltaSeconds: number,
) {
  const dt = Math.max(0, Math.min(deltaSeconds, 0.1))
  state.time += dt
  finishMoves(state, trial)
  tryAdvance(state, trial)
  tryInject(state, trial)
  refreshMovingSegments(state)
  updateBottleneckState(state, trial)
  return state
}

export function carMoveProgress(car: MotionCar, time: number) {
  if (!car.moving) return 1
  const duration = Math.max(0.001, car.moveEnd - car.moveStart)
  return Math.max(0, Math.min(1, (time - car.moveStart) / duration))
}

export function easeInOutCubic(t: number) {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function queueCompression(state: LineMotionState) {
  if (state.bottleneckHoldSince == null) return 0
  const elapsed = Math.max(0, state.time - state.bottleneckHoldSince)
  const t = Math.min(1, elapsed / 1.25)
  const eased = easeInOutCubic(t)
  const settle = elapsed > 1.0 ? Math.sin((elapsed - 1) * 9) * Math.exp(-(elapsed - 1) * 3.2) * 0.08 : 0
  return Math.max(0, Math.min(1.08, eased + settle))
}

export function carAtStation(state: LineMotionState, stationIndex: number) {
  const id = state.slots[stationIndex]
  if (id == null) return null
  return state.cars.get(id) ?? null
}

export function stationIsStarved(state: LineMotionState, trial: RepresentativeTrial, stationIndex: number) {
  const bottleneck = state.bottleneckIndex
  const constrained = (trial.stations[bottleneck]?.throughputFactor ?? 1) < 1
  return constrained && stationIndex > bottleneck && state.slots[stationIndex] == null
}
