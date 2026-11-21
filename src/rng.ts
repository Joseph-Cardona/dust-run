/** Seeded RNG. Same call pattern as Python's random.Random. Not the same stream. */
export interface Rng {
  random(): number
  randrange(stop: number): number
  randrange(start: number, stop: number): number
  choice<T>(items: readonly T[]): T
  shuffle<T>(items: T[]): void
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0
  if (state === 0) state = 1
  const random = (): number => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
  const randrange = (a: number, b?: number): number => {
    const lo = b === undefined ? 0 : a
    const hi = b === undefined ? a : b
    return lo + Math.floor(random() * (hi - lo))
  }
  return {
    random,
    randrange,
    choice<T>(items: readonly T[]): T {
      return items[Math.floor(random() * items.length)]
    },
    shuffle<T>(items: T[]): void {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        const swap = items[i]
        items[i] = items[j]
        items[j] = swap
      }
    },
  }
}
