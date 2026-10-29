export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash01(seed: number, a: number, b: number, c = 0) {
  let x = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 11, 0x85ebca6b) ^ Math.imul(c + 101, 0xc2b2ae35)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

function gamma(shape: number, rand: () => number): number {
  if (shape < 1) {
    const u = Math.max(rand(), 1e-12)
    return gamma(shape + 1, rand) * Math.pow(u, 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      const u1 = Math.max(rand(), 1e-12)
      const u2 = Math.max(rand(), 1e-12)
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function beta(alpha: number, betaShape: number, rand: () => number) {
  const x = gamma(alpha, rand)
  const y = gamma(betaShape, rand)
  return x / (x + y)
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
