import type { Sprite } from 'pixi.js'

export const VIEW_W = 320
export const VIEW_H = 180
export const TILE = 32
export const COLS = 20
export const ROWS = 12
export const ROOM_W = COLS * TILE
export const ROOM_H = ROWS * TILE

/** Pixel size of the active mansion floor. `fit` reads this. */
export const worldSize = { w: 3200, h: 1152 }

export const PLAYER_SPEED = 138
export const PLAYER_SPEED_FULL = 96
export const PLAYER_HP = 100
export const HIT_R = 12
export const IFRAME = 0.6
export const PICKUP_R = 24
export const TANK_P0 = 100
export const TANK_P1 = 140
export const DIRT_PER_STAGE = 5
export const SWEEP_PX = 16
export const SWEEPS_PER_STAGE = 3
export const BOLT_COST = 2
export const DUST_EVERY = 90
export const FLASH = 0.1

export const DOCK_X = 296
export const DOCK_Y = 0
export const DOCK_PIVOT = { x: DOCK_X + 24, y: 31 }
export const PLATE = { x: DOCK_X + 4, y: 31, w: 40, h: 13 }
export const SPAWN = { x: 320, y: 120 }

export const PIVOT = {
  p0: { x: 16, y: 17 },
  p1: { x: 16, y: 15 },
  rival: { x: 16, y: 17 },
} as const

export type Facing = 'down' | 'left' | 'right' | 'up'
export type FloorId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
export type FormId = 'p0' | 'p1'
export type DecalId =
  | '57a' | '57b' | '57c' | '57d' | '57e' | '57f' | '57g'
  | '57h' | '57i' | '57j' | '57k' | '57l' | '57m' | '57n'
export type CoinKind = 'silver' | 'gold' | 'premium'
export type PickupKind = CoinKind | 'bolt'
export type Mode = 'play' | 'docking' | 'dead' | 'clear' | 'levelup' | 'hub' | 'down' | 'results' | 'shop' | 'title' | 'brief' | 'settings' | 'pause'

export const FACINGS: Facing[] = ['down', 'left', 'right', 'up']
export const DECAL_IDS: DecalId[] = [
  '57a', '57b', '57c', '57d', '57e', '57f', '57g',
  '57h', '57i', '57j', '57k', '57l', '57m', '57n',
]

export const DECAL_SIZE: Record<DecalId, { w: number; h: number }> = {
  '57a': { w: 16, h: 14 },
  '57b': { w: 32, h: 20 },
  '57c': { w: 18, h: 14 },
  '57d': { w: 50, h: 34 },
  '57e': { w: 32, h: 24 },
  '57f': { w: 24, h: 16 },
  '57g': { w: 18, h: 14 },
  '57h': { w: 34, h: 14 },
  '57i': { w: 18, h: 18 },
  '57j': { w: 32, h: 24 },
  '57k': { w: 16, h: 14 },
  '57l': { w: 26, h: 10 },
  '57m': { w: 26, h: 22 },
  '57n': { w: 48, h: 24 },
}

export const DUST_AT: Record<Facing, { x: number; y: number }> = {
  right: { x: 2, y: 24 },
  left: { x: 20, y: 24 },
  down: { x: 11, y: 12 },
  up: { x: 11, y: 27 },
}

export const COIN_VALUE: Record<CoinKind, number> = {
  silver: 1,
  gold: 5,
  premium: 25,
}

export const PICKUP_BOX: Record<PickupKind, { w: number; h: number; ax: number; ay: number }> = {
  silver: { w: 12, h: 14, ax: 6, ay: 6 },
  gold: { w: 16, h: 18, ax: 8, ay: 8 },
  premium: { w: 22, h: 24, ax: 11, ay: 11 },
  bolt: { w: 16, h: 18, ax: 8, ay: 8 },
}

export const DIRT_SPOTS: { id: DecalId; x: number; y: number }[] = [
  { id: '57a', x: 48, y: 64 },
  { id: '57e', x: 96, y: 150 },
  { id: '57b', x: 48, y: 240 },
  { id: '57d', x: 40, y: 320 },
  { id: '57c', x: 180, y: 200 },
  { id: '57h', x: 160, y: 300 },
  { id: '57k', x: 230, y: 120 },
  { id: '57f', x: 380, y: 90 },
  { id: '57g', x: 400, y: 180 },
  { id: '57i', x: 360, y: 280 },
  { id: '57j', x: 500, y: 240 },
  { id: '57l', x: 470, y: 140 },
  { id: '57m', x: 560, y: 80 },
  { id: '57n', x: 520, y: 320 },
]

export const COIN_SPOTS: { kind: CoinKind; x: number; y: number }[] = [
  { kind: 'silver', x: 120, y: 100 },
  { kind: 'silver', x: 200, y: 260 },
  { kind: 'silver', x: 450, y: 200 },
  { kind: 'silver', x: 580, y: 300 },
  { kind: 'gold', x: 140, y: 330 },
]

export type RivalSpawn = (typeof RIVAL_SPAWNS)[number]

export const RIVAL_SPAWNS = [
  { kind: 'std' as const, x: 90, y: 210, axis: 'x' as const, min: 80, max: 560, dir: 1, hp: 2, speed: 36 },
  { kind: 'elite' as const, x: 500, y: 130, axis: 'y' as const, min: 100, max: 320, dir: 1, hp: 3, speed: 24 },
]

export const GLARE_AT = [
  { x: 24, y: 40 },
  { x: 400, y: 70 },
]

export interface Player {
  x: number
  y: number
  hp: number
  maxHp: number
  iframe: number
  facing: Facing
  frame: number
  frameMs: number
  form: FormId
  tank: number
  capacity: number
  coins: number
  bolts: number
  dustMs: number
  settling: boolean
  wasMoving: boolean
  bruise: number
  healAcc: number
  sprite: Sprite
}

export interface ReactAnim {
  kind: 'hit' | 'death'
  frame: number
  frameMs: number
  px: number
  py: number
  dropped: boolean
}

export interface Rival {
  kind: 'std' | 'elite'
  breed: string
  x: number
  y: number
  hp: number
  maxHp: number
  contact: number
  xp: number
  lootCoins: number
  lootBolts: number
  iframe: number
  facing: Facing
  frame: number
  frameMs: number
  settling: boolean
  alive: boolean
  react: ReactAnim | null
  rewarded: boolean
  fx: Sprite
  axis: 'x' | 'y'
  min: number
  max: number
  dir: number
  speed: number
  dustMs: number
  sprite: Sprite
  vuln: number
  act: string
  actMs: number
  cool: number
  room: number
  hang: boolean
  key: boolean
  smudge: number
  smudgeStage: 0 | 1 | 2
  markX: number
  markY: number
  markOn: boolean
  plain: boolean
  reach: number
  aim: number
  phase: number
  /** Last detour side. -1 left, 0 straight, 1 right. */
  steer: number
}

export interface Decal {
  id: DecalId
  x: number
  y: number
  stage: 0 | 1 | 2 | 3
  dist: number
  sweeps: number
  sprite: Sprite
}

export interface Pickup {
  kind: PickupKind
  x: number
  y: number
  alive: boolean
  mode: 'spin' | 'shimmer'
  ms: number
  sprite: Sprite
}

export interface State {
  mode: Mode
  player: Player
  rivals: Rival[]
  decals: Decal[]
  pickups: Pickup[]
  dockMs: number
  dockStartPct: number
  afterEmpty: boolean
  flash: number
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function circleRect(
  cx: number, cy: number, r: number,
  x: number, y: number, w: number, h: number,
): boolean {
  const nx = clamp(cx, x, x + w)
  const ny = clamp(cy, y, y + h)
  const dx = cx - nx
  const dy = cy - ny
  return dx * dx + dy * dy <= r * r
}

export function facingFrom(x: number, y: number, prev: Facing): Facing {
  if (x === 0 && y === 0) return prev
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}

export function onPlate(x: number, y: number): boolean {
  return x >= PLATE.x - 8 && x <= PLATE.x + PLATE.w + 8
    && y >= PLATE.y - 4 && y <= PLATE.y + PLATE.h + 10
}

export function litSegments(pct: number): number {
  return clamp(Math.floor(pct / 10 + 0.5), 0, 10)
}
