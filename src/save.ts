import type { DoorState } from './mansion.ts'
import { DECAL_IDS, type DecalId, type Facing, type FormId, type PickupKind } from './spec.ts'
import type { ProgressSnap } from './upgrades.ts'

const KEY = 'clean-sweep-run'
const DOORS = new Set<DoorState>(['open', 'arch', 'closed', 'locked', 'oneway_in', 'oneway_out', 'front', 'sealed'])
const FACES = new Set<Facing>(['down', 'left', 'right', 'up'])
const PICKS = new Set<PickupKind>(['silver', 'gold', 'premium', 'bolt'])
const DECALS = new Set<string>(DECAL_IDS)

export interface GateSnap {
  k: string
  state: DoorState
}

export interface DecalSnap {
  id: DecalId
  x: number
  y: number
  stage: 0 | 1 | 2
  sweeps: number
  dist: number
}

export interface FoeSnap {
  breed: string
  x: number
  y: number
  hp: number
  facing: Facing
  room: number
}

export interface PickupSnap {
  kind: PickupKind
  x: number
  y: number
}

export interface RunSnap {
  locked: number
  wavesLeft: number
  cleared: number[]
  seen: number[]
  explored: number[]
  looted: number[]
  shrineUsed: boolean
  hasKey: boolean
  kills: number
  roomsCleared: number
  dirt: number
  timeMs: number
  gifted: boolean
  mop: number
  vx: number
  vy: number
}

export interface PlayerSnap {
  x: number
  y: number
  hp: number
  maxHp: number
  facing: Facing
  form: FormId
  coins: number
  bolts: number
  tank: number
}

export interface PuddleSnap {
  kind: 'coffee' | 'water'
  x: number
  y: number
  stage: 0 | 1 | 2
  sweeps: number
  dist: number
}

export interface RunFile {
  v: 1
  floor: number
  seed: number
  player: PlayerSnap
  run: RunSnap
  progress: ProgressSnap
  gates: GateSnap[]
  seals: GateSnap[]
  decals: DecalSnap[]
  foes: FoeSnap[]
  pickups: PickupSnap[]
  /** Absent on saves from before puddles could be vacuumed. */
  puddles?: PuddleSnap[]
}

export function hasSavedRun(): boolean {
  return loadRun() !== null
}

export function loadRun(): RunFile | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<RunFile>
    if (data.v !== 1 || !data.player || !data.run || !data.progress) return null
    const floor = int(data.floor, 1, 5)
    const seed = data.seed
    if (floor === null || typeof seed !== 'number' || !Number.isFinite(seed)) return null
    const player = playerOf(data.player)
    const run = runOf(data.run)
    if (!player || !run) return null
    return {
      v: 1,
      floor,
      seed,
      player,
      run,
      progress: data.progress,
      gates: gatesOf(data.gates),
      seals: gatesOf(data.seals),
      decals: decalsOf(data.decals),
      foes: foesOf(data.foes),
      pickups: pickupsOf(data.pickups),
      puddles: puddlesOf(data.puddles),
    }
  } catch {
    return null
  }
}

export function saveRun(file: RunFile): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

export function clearRun(): void {
  localStorage.removeItem(KEY)
}

function playerOf(raw: PlayerSnap): PlayerSnap | null {
  const hp = int(raw.hp, 1, 9999)
  const maxHp = int(raw.maxHp, 1, 9999)
  const x = num(raw.x)
  const y = num(raw.y)
  if (hp === null || maxHp === null || x === null || y === null) return null
  if (!FACES.has(raw.facing)) return null
  const coins = int(raw.coins, 0, 999999)
  const bolts = int(raw.bolts, 0, 999999)
  const tank = int(raw.tank, 0, 9999)
  if (coins === null || bolts === null || tank === null) return null
  return {
    x,
    y,
    hp,
    maxHp,
    facing: raw.facing,
    form: raw.form === 'p1' ? 'p1' : 'p0',
    coins,
    bolts,
    tank,
  }
}

function runOf(raw: RunSnap): RunSnap | null {
  const locked = int(raw.locked, -1, 256)
  const wavesLeft = int(raw.wavesLeft, 0, 8)
  const kills = int(raw.kills, 0, 999999)
  const roomsCleared = int(raw.roomsCleared, 0, 9999)
  const dirt = int(raw.dirt, 0, 999999)
  const timeMs = num(raw.timeMs)
  const mop = num(raw.mop)
  const vx = num(raw.vx)
  const vy = num(raw.vy)
  if (
    locked === null || wavesLeft === null || kills === null || roomsCleared === null
    || dirt === null || timeMs === null || mop === null || vx === null || vy === null
  ) return null
  return {
    locked,
    wavesLeft,
    cleared: ids(raw.cleared),
    seen: ids(raw.seen),
    explored: ids(raw.explored),
    looted: ids(raw.looted),
    shrineUsed: raw.shrineUsed === true,
    hasKey: raw.hasKey === true,
    kills,
    roomsCleared,
    dirt,
    timeMs,
    gifted: raw.gifted === true,
    mop,
    vx,
    vy,
  }
}

function gatesOf(raw: unknown): GateSnap[] {
  if (!Array.isArray(raw)) return []
  const out: GateSnap[] = []
  for (const row of raw.slice(0, 500)) {
    if (!row || typeof row !== 'object') continue
    const gate = row as Partial<GateSnap>
    if (typeof gate.k !== 'string' || gate.k.length === 0 || gate.k.length > 80) continue
    if (!gate.state || !DOORS.has(gate.state)) continue
    out.push({ k: gate.k, state: gate.state })
  }
  return out
}

function decalsOf(raw: unknown): DecalSnap[] {
  if (!Array.isArray(raw)) return []
  const out: DecalSnap[] = []
  for (const row of raw.slice(0, 300)) {
    if (!row || typeof row !== 'object') continue
    const decal = row as Partial<DecalSnap>
    if (typeof decal.id !== 'string' || !DECALS.has(decal.id)) continue
    const x = int(decal.x, -10000, 10000)
    const y = int(decal.y, -10000, 10000)
    const stage = int(decal.stage, 0, 2)
    const sweeps = int(decal.sweeps, 0, 9)
    const dist = num(decal.dist)
    if (x === null || y === null || stage === null || sweeps === null || dist === null) continue
    out.push({ id: decal.id as DecalId, x, y, stage: stage as 0 | 1 | 2, sweeps, dist })
  }
  return out
}

function puddlesOf(raw: unknown): PuddleSnap[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return []
  const out: PuddleSnap[] = []
  for (const row of raw.slice(0, 80)) {
    if (!row || typeof row !== 'object') continue
    const puddle = row as Partial<PuddleSnap>
    if (puddle.kind !== 'coffee' && puddle.kind !== 'water') continue
    const x = int(puddle.x, -10000, 10000)
    const y = int(puddle.y, -10000, 10000)
    const stage = int(puddle.stage, 0, 2)
    const sweeps = int(puddle.sweeps, 0, 9)
    const dist = num(puddle.dist)
    if (x === null || y === null || stage === null || sweeps === null || dist === null) continue
    out.push({ kind: puddle.kind, x, y, stage: stage as 0 | 1 | 2, sweeps, dist })
  }
  return out
}

function foesOf(raw: unknown): FoeSnap[] {
  if (!Array.isArray(raw)) return []
  const out: FoeSnap[] = []
  for (const row of raw.slice(0, 80)) {
    if (!row || typeof row !== 'object') continue
    const foe = row as Partial<FoeSnap>
    if (typeof foe.breed !== 'string' || foe.breed.length === 0 || foe.breed.length > 40) continue
    if (!foe.facing || !FACES.has(foe.facing)) continue
    const x = num(foe.x)
    const y = num(foe.y)
    const hp = int(foe.hp, 1, 9999)
    const room = int(foe.room, 0, 256)
    if (x === null || y === null || hp === null || room === null) continue
    out.push({ breed: foe.breed, x, y, hp, facing: foe.facing, room })
  }
  return out
}

function pickupsOf(raw: unknown): PickupSnap[] {
  if (!Array.isArray(raw)) return []
  const out: PickupSnap[] = []
  for (const row of raw.slice(0, 100)) {
    if (!row || typeof row !== 'object') continue
    const pickup = row as Partial<PickupSnap>
    if (!pickup.kind || !PICKS.has(pickup.kind)) continue
    const x = num(pickup.x)
    const y = num(pickup.y)
    if (x === null || y === null) continue
    out.push({ kind: pickup.kind, x, y })
  }
  return out
}

function ids(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw.slice(0, 300)) {
    const id = int(item, 0, 256)
    if (id !== null) out.push(id)
  }
  return out
}

function int(value: unknown, lo: number, hi: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const next = Math.floor(value)
  if (next < lo || next > hi) return null
  return next
}

function num(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}
