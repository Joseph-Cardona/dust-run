import type { FormId } from './spec.ts'

const KEY = 'clean-sweep-meta'

export interface Meta {
  bolts: number
  coins: number
  form: FormId
  plating: number
  bag: number
  reroll: boolean
  starter: boolean
  best: number
  runs: number
}

export function emptyMeta(): Meta {
  return {
    bolts: 0,
    coins: 0,
    form: 'p0',
    plating: 0,
    bag: 0,
    reroll: false,
    starter: false,
    best: 1,
    runs: 0,
  }
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyMeta()
    const data = JSON.parse(raw) as Partial<Meta>
    return {
      bolts: num(data.bolts, 0),
      coins: num(data.coins, 0),
      form: data.form === 'p1' ? 'p1' : 'p0',
      plating: clampRank(data.plating, 3),
      bag: clampRank(data.bag, 2),
      reroll: data.reroll === true,
      starter: data.starter === true,
      best: num(data.best, 1),
      runs: num(data.runs, 0),
    }
  } catch {
    return emptyMeta()
  }
}

export function saveMeta(meta: Meta): void {
  localStorage.setItem(KEY, JSON.stringify(meta))
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function clampRank(value: unknown, max: number): number {
  const rank = num(value, 0)
  return Math.min(max, rank)
}
