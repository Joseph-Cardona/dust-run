import type { Texture } from 'pixi.js'
import type { Art } from './assets.ts'
import { bossProfile, floorBoss, isFloorBoss, stepBoss, type BossShot } from './bosses.ts'
import foeFile from './data/enemies.json' with { type: 'json' }
import { MANSION_TILE, type MansionRoom } from './mansion.ts'
import { makeRng, type Rng } from './rng.ts'
import { blankRival } from './rivals.ts'
import { BODY_RX, BODY_RY, blockedAt, bodyRim, type FloorWorld } from './rooms.ts'
import { floorSpec, roomTileRect } from './run.ts'
import { facingFrom, worldSize, type Facing, type Rival } from './spec.ts'

interface FoeDef {
  hp: number
  damage: number
  speed_px_s?: number
  xp: number
  coins: number
  bolts?: number
  cost?: number | string
  floors?: number[]
  themes?: string[]
  per_floor?: Record<string, { hp: number; damage: number }>
}

const FOES = (foeFile as { enemies: Record<string, FoeDef> }).enemies

const CHASE: Record<string, number> = {
  '47m3': 36,
  '48m2': 24,
}

export interface FoeHit {
  damage: number
  x: number
  y: number
  stun?: number
}

export interface FoeStep {
  hits: FoeHit[]
  summons: Rival[]
  wet: { x: number; y: number }[]
  slow: number
  pull: boolean
  shots: BossShot[]
}

export function floorPixels(world: FloorWorld, room: MansionRoom): { x: number; y: number }[] {
  const rect = roomTileRect(room)
  const out: { x: number; y: number }[] = []
  for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) {
    for (let x = rect.x + 1; x < rect.x + rect.w - 1; x++) {
      if (world.solid[x + y * world.cols] !== 0) continue
      const px = (x + 0.5) * MANSION_TILE
      const py = (y + 0.85) * MANSION_TILE
      if (blockedAt(world, px, py, 0, 0)) continue
      out.push({ x: px, y: py })
    }
  }
  return out
}

export function spawnRoom(
  world: FloorWorld,
  roomIndex: number,
  floor: number,
  wave: number,
  art: Art,
  foeArt: Record<string, Texture>,
  playerX: number,
  playerY: number,
): Rival[] {
  const room = world.plan.rooms[roomIndex]
  if (!room) return []
  const rng = makeRng(world.plan.seed * 100 + floor * 17 + roomIndex * 3 + wave)
  const ids = rollIds(room, floor, rng)
  const spots = floorPixels(world, room).filter((spot) => {
    const dx = spot.x - playerX
    const dy = spot.y - playerY
    return dx * dx + dy * dy > 48 * 48
  })
  const pool = spots.length > 0 ? spots : floorPixels(world, room)
  const rivals: Rival[] = []
  ids.forEach((id, index) => {
    const stride = id === 'dust_bunny' ? 11 : 3
    const spot = pool[(index * stride) % Math.max(1, pool.length)]
    if (!spot) return
    const foe = makeFoe(art, foeArt, id, floor, roomIndex, spot.x, spot.y, room)
    if (id === 'dust_bunny') staggerBunny(foe, index)
    rivals.push(foe)
  })
  return rivals
}

export function stepFoes(
  rivals: Rival[],
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  art: Art,
  foeArt: Record<string, Texture>,
): FoeStep {
  const out: FoeStep = { hits: [], summons: [], wet: [], slow: 0, pull: false, shots: [] }
  for (const rival of rivals) {
    if (!rival.alive || rival.react) continue
    if (rival.hp <= 0 && !(isFloorBoss(rival.breed) && rival.act === 'death')) continue
    stepOne(rival, dt, world, player, rivals, art, foeArt, out)
    if (!rival.hang) {
      rival.x = Math.max(BODY_RX, Math.min(worldSize.w - BODY_RX, rival.x))
      rival.y = Math.max(BODY_RY, Math.min(worldSize.h - BODY_RY, rival.y))
    }
  }
  return out
}

function rollIds(room: MansionRoom, floor: number, rng: Rng): string[] {
  if (room.role === 'boss') return ['head_butler']
  if (room.role === 'stairs') {
    const guard = floorBoss(floor)
    if (guard) return [guard]
  }
  if (room.role === 'elite') {
    const brute = fits('vacuum_brute', room.theme, floor)
    const elite = brute && rng.random() < 0.5 ? 'vacuum_brute' : '48m2'
    return [elite, ...fillBudget(room, floor, Math.max(0, floor - 1), rng)]
  }
  return fillBudget(room, floor, floorSpec(floor).enemies_per_room, rng)
}

function fillBudget(room: MansionRoom, floor: number, budget: number, rng: Rng): string[] {
  const theme = themePool(room, floor)
  const out: string[] = []
  const counts = new Map<string, number>()
  let spent = 0
  const half = theme.length > 0 ? Math.ceil(budget / 2) : 0
  let guard = 0
  while (spent < budget && guard < 40) {
    guard += 1
    const fromTheme = spent < half && theme.length > 0
    let options = (fromTheme ? theme : ['47m3', ...theme]).filter((id) => canTake(id, counts, spent, budget))
    if (options.length === 0 && fromTheme) {
      options = ['47m3', ...theme].filter((id) => canTake(id, counts, spent, budget))
    }
    if (options.length === 0) break
    const id = rng.choice(options)
    const cost = 1
    out.push(id)
    if (id !== 'dust_bunny') counts.set(id, (counts.get(id) ?? 0) + 1)
    spent += cost
  }
  const expanded: string[] = []
  for (const id of out) {
    if (id === 'dust_bunny') expanded.push(id, id, id)
    else expanded.push(id)
  }
  return expanded
}

function themePool(room: MansionRoom, floor: number): string[] {
  const out: string[] = []
  for (const id of Object.keys(FOES)) {
    if (id === '47m3' || id === '48m2' || id === 'head_butler' || id === 'vacuum_brute' || id === 'chandelier') continue
    if (!fits(id, room.theme, floor)) continue
    const cost = FOES[id]?.cost
    if (typeof cost !== 'number') continue
    out.push(id)
  }
  return out
}

function fits(id: string, theme: string, floor: number): boolean {
  const def = FOES[id]
  if (!def) return false
  if (def.floors && !def.floors.includes(floor)) return false
  if (def.themes && !def.themes.includes(theme)) return false
  return true
}

function canTake(id: string, counts: Map<string, number>, spent: number, budget: number): boolean {
  if (id === 'chandelier') return false
  const cost = 1
  if (spent + cost > budget) return false
  if (id !== 'dust_bunny' && id !== '47m3' && (counts.get(id) ?? 0) >= 2) return false
  return true
}

function scaled(id: string, floor: number): { hp: number; dmg: number } {
  if (id === 'head_butler') return { hp: 300, dmg: 20 }
  const row = floorSpec(floor)
  if (id === '47m3' || id === '48m2') {
    return { hp: row.enemy_hp[id] ?? 1, dmg: row.enemy_damage[id] ?? 1 }
  }
  const def = FOES[id]
  const per = def?.per_floor?.[String(floor)]
  if (per) return { hp: per.hp, dmg: per.damage }
  return {
    hp: Math.max(1, Math.round((def?.hp ?? 1) * row.hp_mult)),
    dmg: Math.max(1, Math.round((def?.damage ?? 1) * row.dmg_mult)),
  }
}

function makeFoe(
  art: Art,
  foeArt: Record<string, Texture>,
  id: string,
  floor: number,
  room: number,
  x: number,
  y: number,
  place: MansionRoom,
): Rival {
  const profile = bossProfile(id)
  if (profile) {
    const spot = bossSpot(place)
    const rival = blankRival(undefined, spot.x, spot.y)
    rival.kind = 'std'
    rival.breed = id
    rival.hp = profile.hp
    rival.maxHp = profile.hp
    rival.contact = profile.dmg
    rival.xp = profile.xp
    rival.lootCoins = profile.coins
    rival.lootBolts = profile.bolts
    rival.speed = profile.speed
    rival.plain = true
    rival.room = room
    rival.key = false
    rival.act = 'intro'
    rival.cool = 1.4
    rival.hang = false
    rival.vuln = 0
    rival.phase = 1
    rival.reach = 18
    rival.max = 0
    rival.aim = 0
    rival.facing = 'down'
    rival.frame = 0
    rival.frameMs = 0
    return rival
  }
  const stat = scaled(id, floor)
  const def = FOES[id]
  const elite = id === '48m2' || id === 'vacuum_brute' || id === 'head_butler'
  const plain = id !== '47m3' && id !== '48m2'
  const tex = plain
    ? foeArt[id]
    : id === '48m2' ? art.rival.elite.glide.down[0] : art.rival.std.glide.down[0]
  const rival = blankRival(tex, x, y)
  rival.kind = elite ? 'elite' : 'std'
  rival.breed = id
  rival.hp = stat.hp
  rival.maxHp = stat.hp
  rival.contact = stat.dmg
  rival.xp = def?.xp ?? (elite ? 18 : 6)
  rival.lootCoins = def?.coins ?? 0
  rival.lootBolts = def?.bolts ?? 0
  rival.speed = def?.speed_px_s ?? CHASE[id] ?? 36
  rival.plain = plain
  rival.room = room
  rival.key = id === '48m2' || id === 'vacuum_brute'
  rival.act = 'idle'
  rival.hang = false
  rival.vuln = 1
  rival.reach = plain ? Math.max(12, Math.round((tex?.width ?? 32) / 4)) : 12
  rival.smudge = id === 'dust_bunny' ? 1 : id === 'vacuum_brute' ? 3 : 0
  rival.smudgeStage = id === 'dust_bunny' ? 2 : 0
  if (id === 'tin_soldier') {
    rival.act = 'march'
    rival.cool = 1.5
  }
  if (id === 'head_butler') {
    const spot = bossSpot(place)
    rival.x = spot.x
    rival.y = spot.y
  }
  if (plain && tex) {
    rival.sprite.texture = tex
    rival.sprite.anchor.set(0.5, 1)
  }
  return rival
}

/** Live foe at a saved spot. Boss placement inside makeFoe is overwritten. */
export function placeFoe(
  art: Art,
  foeArt: Record<string, Texture>,
  id: string,
  floor: number,
  roomIndex: number,
  x: number,
  y: number,
  place: MansionRoom,
): Rival | null {
  if (id === 'chandelier' || (!FOES[id] && !bossProfile(id))) return null
  const foe = makeFoe(art, foeArt, id, floor, roomIndex, x, y, place)
  foe.x = x
  foe.y = y
  return foe
}

function bossSpot(room: MansionRoom): { x: number; y: number } {
  const rect = roomTileRect(room)
  const x = rect.x + Math.floor(rect.w / 2)
  const y = rect.y + Math.floor(rect.h / 2)
  return { x: (x + 0.5) * MANSION_TILE, y: (y + 0.85) * MANSION_TILE }
}

function stepOne(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  art: Art,
  foeArt: Record<string, Texture>,
  out: FoeStep,
): void {
  const id = rival.breed
  if (id === 'dust_bunny') bunny(rival, dt, world, player, rivals, out)
  else if (id === 'snap_trap') trap(rival, dt, world, player, rivals, out)
  else if (id === 'rogue_mop') mop(rival, dt, world, player, rivals, out)
  else if (id === 'toaster') toaster(rival, dt, world, player, rivals, out)
  else if (id === 'tin_soldier') soldier(rival, dt, world, player, rivals, out)
  else if (id === 'sheet_ghost') ghost(rival, dt, world, player, out)
  else if (id === 'vacuum_brute') brute(rival, dt, world, player, out)
  else if (id === 'head_butler') butler(rival, dt, world, player, rivals, art, foeArt, out)
  else if (isFloorBoss(id)) stepBoss(rival, dt, world, player, out)
  else chase(rival, dt, world, player, rival.speed, true, out)
}

function staggerBunny(rival: Rival, index: number): void {
  rival.phase = index * 2.399963
  rival.frameMs = (index % 7) * 0.13
}

function bunny(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  out: FoeStep,
): void {
  rival.frameMs += dt
  const ang = rival.phase + rival.frameMs * 1.6
  const aimX = player.x + Math.cos(ang) * 36
  const aimY = player.y + Math.sin(ang) * 24
  const wave = 0.72 + 0.28 * Math.sin(rival.frameMs * 7 + rival.phase)
  seek(rival, dt, world, aimX, aimY, rival.speed * wave)
  nudgeBunnies(rival, rivals, world)
  if (touching(player, rival)) hit(out, rival, player, rival.contact)
}

const TRAP_HIT = [0.05, 0.05, 0.06, 0.07, 0.07, 0.08]
const TRAP_ATTACK = [0.07, 0.09, 0.09, 0.09, 0.04, 0.04, 0.06, 0.2, 0.11, 0.11, 0.11, 0.11, 0.09]

function trap(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  out: FoeStep,
): void {
  settleFoe(world, rival, rivals)
  if (rival.act === 'hit') {
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, TRAP_HIT)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'hop'
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  if (rival.act === 'shiver' || rival.act === 'snap' || rival.act === 'open') {
    if (rival.act === 'open') rival.vuln = 1.5
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, TRAP_ATTACK)
    rival.actMs -= dt
    if (rival.act === 'snap' && rival.aim === 0 && inFront(rival, player) && edgeDist(player, rival) < 14) {
      rival.aim = 1
      hit(out, rival, player, rival.contact)
    }
    if (rival.actMs > 0) return
    if (rival.act === 'shiver') {
      rival.act = 'snap'
      rival.actMs = 0.14
      rival.aim = 0
      return
    }
    if (rival.act === 'snap') {
      rival.act = 'open'
      rival.actMs = 0.73
      rival.vuln = 1.5
      return
    }
    rival.vuln = 1
    rival.act = 'hop'
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  chase(rival, dt, world, player, rival.speed, false, out)
  rival.dustMs += dt
  rival.frame = Math.floor(rival.dustMs / 0.06) % 7
  if (edgeDist(player, rival) >= 14) return
  rival.facing = facingFrom(player.x - rival.x, player.y - rival.y, rival.facing)
  rival.act = 'shiver'
  rival.actMs = 0.35
  rival.dustMs = 0
  rival.frame = 0
  rival.aim = 0
}

const MOP_HIT = [0.05, 0.05, 0.06, 0.07, 0.07, 0.08]
const MOP_ATTACK = [0.08, 0.09, 0.1, 0.11, 0.04, 0.04, 0.04, 0.04, 0.05, 0.09, 0.09, 0.09, 0.09]

function mop(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  out: FoeStep,
): void {
  settleFoe(world, rival, rivals)
  if (rival.act === 'hit') {
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, MOP_HIT)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  if (rival.act === 'wind' || rival.act === 'arc' || rival.act === 'recover') {
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, MOP_ATTACK)
    rival.actMs -= dt
    if (rival.act === 'arc' && rival.aim === 0 && edgeDist(player, rival) < 28 && dot(rival, player) > -0.34) {
      rival.aim = 1
      hit(out, rival, player, rival.contact)
      out.slow = 3
      out.wet.push({ x: rival.x, y: rival.y })
    }
    if (rival.actMs > 0) return
    if (rival.act === 'wind') {
      rival.act = 'arc'
      rival.actMs = 0.21
      rival.aim = 0
      return
    }
    if (rival.act === 'arc') {
      rival.act = 'recover'
      rival.actMs = 0.36
      return
    }
    rival.act = 'idle'
    rival.cool = 1.1
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  chase(rival, dt, world, player, rival.speed, true, out)
  rival.dustMs += dt
  rival.frame = Math.floor(rival.dustMs / 0.08) % 6
  rival.cool -= dt
  if (rival.cool > 0) return
  rival.facing = facingFrom(player.x - rival.x, player.y - rival.y, rival.facing)
  rival.act = 'wind'
  rival.actMs = 0.38
  rival.dustMs = 0
  rival.frame = 0
  rival.aim = 0
}

export const TOAST_FLIGHT = 2.1
const TOAST_HIT = [0.05, 0.05, 0.06, 0.07, 0.07, 0.08]
const TOAST_ATTACK = [0.08, 0.1, 0.1, 0.1, 0.1, 0.04, 0.04, 0.06, 0.09, 0.09, 0.09, 0.1]
const TOAST_SLOT = { x: 0, y: -32 }

function toaster(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  out: FoeStep,
): void {
  settleFoe(world, rival, rivals)
  if (rival.act === 'hit') {
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, TOAST_HIT)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  if (rival.act === 'wind') {
    rival.facing = facingFrom(player.x - rival.x, player.y - rival.y, rival.facing)
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, TOAST_ATTACK)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    const sx = rival.x + TOAST_SLOT.x
    const sy = rival.y + TOAST_SLOT.y
    const dx = player.x - sx
    const dy = player.y - sy
    const len = Math.hypot(dx, dy) || 1
    rival.phase = Math.min(288, Math.max(120, len * 3))
    rival.dir = Math.atan2(dy, dx)
    rival.act = 'toast'
    rival.actMs = TOAST_FLIGHT
    rival.markOn = true
    rival.markX = sx
    rival.markY = sy
    rival.aim = 0
    return
  }
  if (rival.act === 'toast') {
    const speed = rival.phase / TOAST_FLIGHT
    rival.markX += Math.cos(rival.dir) * speed * dt
    rival.markY += Math.sin(rival.dir) * speed * dt
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, TOAST_ATTACK)
    rival.actMs -= dt
    if (rival.aim === 0 && Math.hypot(player.x - rival.markX, player.y - rival.markY) <= 12) {
      rival.aim = 1
      hit(out, rival, player, rival.contact)
    }
    if (rival.actMs > 0) return
    rival.markOn = false
    rival.act = 'idle'
    rival.cool = 2.6
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  chase(rival, dt, world, player, rival.speed, false, out)
  rival.dustMs += dt
  rival.frame = Math.floor(rival.dustMs / 0.09) % 8
  rival.cool -= dt
  if (rival.cool > 0) return
  rival.facing = facingFrom(player.x - rival.x, player.y - rival.y, rival.facing)
  rival.act = 'wind'
  rival.actMs = 0.48
  rival.dustMs = 0
  rival.frame = 0
  rival.aim = 0
}

const SOLDIER_HIT = [0.05, 0.05, 0.06, 0.07, 0.07, 0.08]
const SOLDIER_ATTACK = [0.08, 0.11, 0.11, 0.14, 0.04, 0.05, 0.07, 0.09, 0.09, 0.09, 0.1]
const MUZZLE: Record<Facing, { x: number; y: number }> = {
  down: { x: -3, y: -7 },
  left: { x: -16, y: -21 },
  right: { x: 16, y: -17 },
  up: { x: 3, y: -31 },
}

function frameIndex(t: number, ms: readonly number[]): number {
  let left = t
  for (let i = 0; i < ms.length; i++) {
    const step = ms[i] ?? 0
    if (left < step) return i
    left -= step
  }
  return Math.max(0, ms.length - 1)
}

function soldier(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  out: FoeStep,
): void {
  settleFoe(world, rival, rivals)
  if (rival.act === 'hit') {
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs, SOLDIER_HIT)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'march'
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  if (rival.act === 'winddown') {
    rival.vuln = 1.5
    rival.dustMs += dt
    rival.frame = Math.floor(rival.dustMs / 0.15) % 4
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.vuln = 1
    rival.act = 'march'
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  if (rival.act === 'aim') {
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs * 2, SOLDIER_ATTACK)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    const muzzle = MUZZLE[rival.facing]
    rival.act = 'cork'
    rival.actMs = 1.05
    rival.markOn = true
    rival.markX = rival.x + muzzle.x
    rival.markY = rival.y + muzzle.y
    rival.aim = 0
    return
  }
  if (rival.act === 'cork') {
    const face = vec(rival.facing)
    rival.markX += face.x * 280 * dt
    rival.markY += face.y * 280 * dt
    rival.dustMs += dt
    rival.frame = frameIndex(rival.dustMs * 2, SOLDIER_ATTACK)
    rival.actMs -= dt
    if (rival.aim === 0 && Math.hypot(player.x - rival.markX, player.y - rival.markY) <= 12) {
      rival.aim = 1
      hit(out, rival, player, rival.contact)
    }
    if (rival.actMs > 0) return
    rival.markOn = false
    rival.act = 'march'
    rival.cool = 1.5
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  seek(rival, dt, world, player.x, player.y, rival.speed)
  rival.dustMs += dt
  rival.frame = Math.floor(rival.dustMs / 0.09) % 8
  rival.cool -= dt
  rival.frameMs += dt
  if (rival.frameMs >= 7) {
    rival.frameMs = 0
    rival.act = 'winddown'
    rival.actMs = 2
    rival.vuln = 1.5
    rival.dustMs = 0
    rival.frame = 0
    return
  }
  if (rival.cool > 0 || !lined(rival, player)) return
  rival.act = 'aim'
  rival.actMs = 0.22
  rival.dustMs = 0
  rival.frame = 0
}

export function settleFoe(world: FloorWorld, rival: Rival, rivals: Rival[]): void {
  freeSoldier(world, rival)
  let px = 0
  let py = 0
  for (const other of rivals) {
    if (other === rival || !other.alive || other.hang) continue
    const dx = rival.x - other.x
    const dy = rival.y - other.y
    const dist = Math.hypot(dx, dy)
    const gap = rival.reach + (other.plain ? other.reach : 16)
    if (dist === 0) {
      px += 8
      continue
    }
    if (dist >= gap) continue
    const push = (gap - dist) / dist
    px += dx * push
    py += dy * push
  }
  if (px === 0 && py === 0) return
  if (!stepFree(world, rival, rival.x + px, rival.y + py)) {
    stepFree(world, rival, rival.x + px, rival.y)
    stepFree(world, rival, rival.x, rival.y + py)
  }
}

function freeSoldier(world: FloorWorld, rival: Rival): void {
  if (!blockedAt(world, rival.x, rival.y, 0, 0)) return
  for (let dist = 2; dist <= 32; dist += 2) {
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4
      const nx = rival.x + Math.cos(ang) * dist
      const ny = rival.y + Math.sin(ang) * dist
      if (!stepFree(world, rival, nx, ny)) continue
      return
    }
  }
}

function stepFree(world: FloorWorld, rival: Rival, nx: number, ny: number): boolean {
  const dx = nx - rival.x
  const dy = ny - rival.y
  if (dx === 0 && dy === 0) return true
  if (blockedAt(world, nx, ny, dx, dy)) return false
  rival.x = nx
  rival.y = ny
  return true
}

function ghost(rival: Rival, dt: number, world: FloorWorld, player: { x: number; y: number }, out: FoeStep): void {
  if (rival.act === 'drop') {
    rival.vuln = 0
    drift(rival, dt, 32 / 1.2)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.vuln = 1
    rival.act = 'idle'
    rival.cool = 0
    return
  }
  if (rival.act === 'rise') {
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'lunge'
    rival.actMs = 0.12
    return
  }
  if (rival.act === 'lunge') {
    chase(rival, dt, world, player, 24 / 0.12, true, out)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.cool = 1.2
    return
  }
  chase(rival, dt, world, player, rival.speed, true, out)
  rival.cool -= dt
  rival.aim += dt
  if (rival.aim >= 4) {
    rival.aim = 0
    rival.act = 'drop'
    rival.actMs = 1.2
    rival.vuln = 0
    return
  }
  if (rival.cool > 0) return
  rival.act = 'rise'
  rival.actMs = 0.42
}

function brute(rival: Rival, dt: number, world: FloorWorld, player: { x: number; y: number }, out: FoeStep): void {
  if (rival.act === 'wind') {
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'pull'
    rival.actMs = 0.48
    return
  }
  if (rival.act === 'pull') {
    pull(player, rival.x, rival.y, 70 * dt)
    out.pull = true
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'slam'
    rival.actMs = 0.18
    return
  }
  if (rival.act === 'slam') {
    if (edgeDist(player, rival) < 36) hit(out, rival, player, rival.contact)
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.cool = 1.2
    return
  }
  chase(rival, dt, world, player, rival.speed, true, out)
  rival.cool -= dt
  if (rival.cool > 0) return
  rival.act = 'wind'
  rival.actMs = 0.41
}

function butler(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  rivals: Rival[],
  art: Art,
  foeArt: Record<string, Texture>,
  out: FoeStep,
): void {
  const ratio = rival.maxHp <= 0 ? 1 : rival.hp / rival.maxHp
  if (rival.phase < 3 && ratio < 0.3) {
    rival.act = 'phase'
    rival.actMs = 0.95
    rival.vuln = 0
    rival.phase = 3
  } else if (rival.phase < 2 && ratio < 0.6) {
    rival.phase = 2
  }
  if (rival.act === 'phase') {
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.vuln = 1.5
    rival.cool = 0.4
    return
  }
  const speed = rival.speed * (rival.phase >= 3 ? 1.25 : 1)
  if (rival.act === 'wind') {
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = rival.aim === 1 ? 'spin' : rival.aim === 2 ? 'slam' : rival.aim === 3 ? 'summon' : 'lunge'
    rival.actMs = rival.act === 'spin' ? 0.45 : rival.act === 'slam' ? 0.18 : rival.act === 'summon' ? 0.2 : 0.17
    rival.cool = 0
    return
  }
  if (rival.act === 'lunge') {
    chase(rival, dt, world, player, speed * 3.2, false, out)
    if (rival.cool === 0 && touching(player, rival)) {
      rival.cool = 1
      hit(out, rival, player, 24)
    }
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.cool = 0.5
    return
  }
  if (rival.act === 'spin') {
    pull(player, rival.x, rival.y, 90 * dt)
    out.pull = true
    rival.cool -= dt
    if (rival.cool <= 0 && Math.hypot(player.x - rival.x, player.y - rival.y) < 48) {
      rival.cool = 0.25
      hit(out, rival, player, 14)
    }
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.cool = 0.5
    return
  }
  if (rival.act === 'slam') {
    if (rival.cool === 0 && Math.hypot(player.x - rival.x, player.y - rival.y) < 48) {
      rival.cool = 1
      hit(out, rival, player, 28)
    }
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.cool = 0.5
    return
  }
  if (rival.act === 'summon') {
    if (rival.cool === 0) {
      rival.cool = 1
      summon(rival, rivals, art, foeArt, out)
    }
    rival.actMs -= dt
    if (rival.actMs > 0) return
    rival.act = 'idle'
    rival.cool = 0.7
    return
  }
  chase(rival, dt, world, player, speed, true, out)
  rival.cool -= dt
  if (rival.cool > 0) return
  rival.act = 'wind'
  rival.aim = nextAttack(rival)
  rival.actMs = rival.aim === 1 ? 0.33 : rival.aim === 3 ? 0.45 : 0.53
}

function nextAttack(rival: Rival): number {
  rival.frame = (rival.frame + 1) % (rival.phase >= 3 ? 2 : rival.phase >= 2 ? 3 : 2)
  if (rival.phase >= 3) return rival.frame === 0 ? 2 : 0
  if (rival.phase >= 2) return rival.frame
  return rival.frame === 0 ? 0 : 3
}

function summon(rival: Rival, rivals: Rival[], art: Art, foeArt: Record<string, Texture>, out: FoeStep): void {
  let alive = 0
  for (const other of rivals) if (other.alive && other.breed === 'dust_bunny') alive += 1
  for (const extra of out.summons) if (extra.breed === 'dust_bunny') alive += 1
  const room = rival.room
  const corners = [
    { x: rival.x - 80, y: rival.y - 48 },
    { x: rival.x + 80, y: rival.y - 48 },
    { x: rival.x - 80, y: rival.y + 36 },
    { x: rival.x + 80, y: rival.y + 36 },
  ]
  for (const corner of corners) {
    if (alive >= 6) return
    const foe = makeFoe(art, foeArt, 'dust_bunny', 5, room, corner.x, corner.y, { theme: 'panic', x: 0, y: 0, w: 1, h: 1, role: 'boss', doors: [] })
    foe.x = corner.x
    foe.y = corner.y
    staggerBunny(foe, alive)
    out.summons.push(foe)
    alive += 1
    if (alive >= 6 || out.summons.filter((item) => item.breed === 'dust_bunny').length >= 3) return
  }
}

function seek(rival: Rival, dt: number, world: FloorWorld, x: number, y: number, speed: number): void {
  approach(rival, dt, world, x, y, speed)
}

function nudgeBunnies(rival: Rival, rivals: Rival[], world: FloorWorld): void {
  let px = 0
  let py = 0
  for (const other of rivals) {
    if (other === rival || !other.alive || other.breed !== 'dust_bunny') continue
    const dx = rival.x - other.x
    const dy = rival.y - other.y
    const dist = Math.hypot(dx, dy)
    if (dist === 0) {
      px += Math.cos(rival.phase) * 8
      py += Math.sin(rival.phase) * 8
      continue
    }
    if (dist >= 20) continue
    const push = (20 - dist) / dist
    px += dx * push
    py += dy * push
  }
  if (px !== 0 || py !== 0) move(world, rival, rival.x + px, rival.y + py)
}

function chase(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  speed: number,
  contact: boolean,
  out: FoeStep,
): void {
  approach(rival, dt, world, player.x, player.y, speed)
  if (contact && touching(player, rival)) hit(out, rival, player, rival.contact)
}

/** Step toward a point. A blocked heading tries the open side and keeps that side until the straight line is clear. */
function approach(rival: Rival, dt: number, world: FloorWorld, tx: number, ty: number, speed: number): void {
  const dx = tx - rival.x
  const dy = ty - rival.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const step = Math.min(speed * dt, len)
  if (rival.breed === 'sheet_ghost') {
    move(world, rival, rival.x + (dx / len) * step, rival.y + (dy / len) * step)
    return
  }
  const base = Math.atan2(dy, dx)
  const fan = [0, 0.5, 0.95, 1.4, 1.9, 2.4, Math.PI]
  const order: number[] = []
  for (const turn of fan) {
    if (turn === 0) order.push(0)
    else if (rival.steer < 0) order.push(-turn, turn)
    else order.push(turn, -turn)
  }
  const look = Math.min(16, len)
  const picked = pickHeading(rival, world, tx, ty, base, step, order, look)
    ?? pickHeading(rival, world, tx, ty, base, step, order, step)
  if (!picked) return
  rival.steer = Math.abs(picked.ang) < 0.2 ? 0 : picked.ang > 0 ? 1 : -1
  move(world, rival, picked.nx, picked.ny)
}

function pickHeading(
  rival: Rival,
  world: FloorWorld,
  tx: number,
  ty: number,
  base: number,
  step: number,
  order: number[],
  look: number,
): { nx: number; ny: number; ang: number } | null {
  let best: { nx: number; ny: number; ang: number; score: number } | null = null
  for (const ang of order) {
    const h = base + ang
    const hx = Math.cos(h)
    const hy = Math.sin(h)
    const nx = rival.x + hx * step
    const ny = rival.y + hy * step
    if (!openAt(world, rival, nx, ny)) continue
    if (look > step + 0.5) {
      const lx = rival.x + hx * look
      const ly = rival.y + hy * look
      if (!openAt(world, rival, lx, ly)) continue
    }
    const remain = Math.hypot(tx - nx, ty - ny)
    const side = Math.abs(ang) < 0.2 ? 0 : ang > 0 ? 1 : -1
    const commit = side !== 0 && side === rival.steer ? 0.4 : 0
    const score = -remain + commit
    if (!best || score > best.score) best = { nx, ny, ang, score }
  }
  return best
}

function openAt(world: FloorWorld, rival: Rival, nx: number, ny: number): boolean {
  const dx = nx - rival.x
  const dy = ny - rival.y
  if (dx === 0 && dy === 0) return true
  return !blockedAt(world, nx, ny, dx, dy)
}

function move(world: FloorWorld, rival: Rival, nx: number, ny: number): boolean {
  if (rival.hang) return false
  const dx = nx - rival.x
  const dy = ny - rival.y
  if (dx === 0 && dy === 0) return true
  const ghost = rival.breed === 'sheet_ghost'
  if (!ghost && blockedAt(world, nx, ny, dx, dy)) return false
  rival.facing = facingFrom(dx, dy, rival.facing)
  rival.x = nx
  rival.y = ny
  return true
}

function drift(rival: Rival, dt: number, speed: number): void {
  const face = vec(rival.facing)
  rival.x += face.x * speed * dt
  rival.y += face.y * speed * dt
}

function hit(out: FoeStep, rival: Rival, player: { x: number; y: number }, damage: number): void {
  out.hits.push({ damage, x: (rival.x + player.x) / 2, y: (rival.y + player.y) / 2 })
}

function touching(player: { x: number; y: number }, rival: Rival): boolean {
  return edgeDist(player, rival) <= 0
}

function edgeDist(player: { x: number; y: number }, rival: Rival): number {
  const cy = rival.plain ? rival.y - rival.reach : rival.y
  const dx = player.x - rival.x
  const dy = player.y - cy
  return Math.hypot(dx, dy) - bodyRim(dx, dy) - rival.reach
}

function inFront(rival: Rival, player: { x: number; y: number }): boolean {
  return dot(rival, player) > 0
}

function dot(rival: Rival, player: { x: number; y: number }): number {
  const face = vec(rival.facing)
  const dx = player.x - rival.x
  const dy = player.y - rival.y
  const len = Math.hypot(dx, dy) || 1
  return (dx / len) * face.x + (dy / len) * face.y
}

function lined(rival: Rival, player: { x: number; y: number }): boolean {
  const dx = player.x - rival.x
  const dy = player.y - rival.y
  if (dot(rival, player) <= 0) return false
  if (rival.facing === 'left' || rival.facing === 'right') return Math.abs(dy) < 12
  return Math.abs(dx) < 12
}

function pull(player: { x: number; y: number }, x: number, y: number, dist: number): void {
  const dx = x - player.x
  const dy = y - player.y
  const len = Math.hypot(dx, dy) || 1
  player.x += (dx / len) * dist
  player.y += (dy / len) * dist
}

function vec(facing: Facing): { x: number; y: number } {
  if (facing === 'left') return { x: -1, y: 0 }
  if (facing === 'right') return { x: 1, y: 0 }
  if (facing === 'up') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}
