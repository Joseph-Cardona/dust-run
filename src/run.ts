import loopFile from './data/68-runloop.json' with { type: 'json' }
import { CELL_H, CELL_W, MANSION_TILE, type DoorState, type MansionRoom } from './mansion.ts'
import { BODY_RX, BODY_RY, type FloorWorld, type Gate } from './rooms.ts'
import { clamp } from './spec.ts'

export interface FloorSpec {
  floor: number
  name: string
  hp_mult: number
  dmg_mult: number
  enemies_per_room: number
  waves: number
  treasure_coins: number
  shop_price_mult: number
  enemy_hp: Record<string, number>
  enemy_damage: Record<string, number>
}

const FLOORS = (loopFile as { floors: FloorSpec[] }).floors

export function floorSpec(floor: number): FloorSpec {
  return FLOORS[Math.min(FLOORS.length, Math.max(1, floor)) - 1] ?? FLOORS[0]
}

export interface GateSave {
  gate: Gate
  state: DoorState
}

export class Run {
  floor = 1
  seed = 360
  locked = -1
  wavesLeft = 0
  entered = new Set<number>()
  cleared = new Set<number>()
  seen = new Set<number>()
  explored = new Set<number>()
  looted = new Set<number>()
  shrineUsed = false
  hasKey = false
  bannerMs = 0
  downMs = 0
  cardMs = 0
  kills = 0
  roomsCleared = 0
  dirt = 0
  timeMs = 0
  cause = ''
  banked = false
  won = false
  mop = 0
  strain = 0
  vx = 0
  vy = 0
  panel: '' | 'level' | 'shop' | 'shrine' = ''
  prices: number[] = []
  sold = [false, false, false]
  gifted = false
  saves: GateSave[] = []
}

export function hostile(role: string | null, floor: number): boolean {
  if (role === 'combat' || role === 'elite' || role === 'boss') return true
  return role === 'stairs' && floor >= 1 && floor <= 4
}

export function waveCount(role: string | null, floor: number): number {
  if (role === 'boss' || role === 'stairs') return 1
  return floorSpec(floor).waves
}

export function roomTileRect(room: MansionRoom): { x: number; y: number; w: number; h: number } {
  return {
    x: room.x * (CELL_W - 1),
    y: room.y * (CELL_H - 1),
    w: (room.w - 1) * (CELL_W - 1) + CELL_W,
    h: (room.h - 1) * (CELL_H - 1) + CELL_H,
  }
}

export function roomPixelRect(room: MansionRoom): { x: number; y: number; w: number; h: number } {
  const tile = roomTileRect(room)
  return {
    x: tile.x * MANSION_TILE,
    y: tile.y * MANSION_TILE,
    w: tile.w * MANSION_TILE,
    h: tile.h * MANSION_TILE,
  }
}

/** Cells that count as one room. A connected hallway returns every cell in that hall. */
export function roomMembers(world: FloorWorld, index: number): number[] {
  const groups = world.groups
  if (index < 0 || !groups || index >= groups.length) return []
  const canon = groups[index]
  const out: number[] = []
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === canon) out.push(i)
  }
  return out
}

/** Last room whose interior holds the point. The shared seam is outside the inset. */
export function roomAt(world: FloorWorld, x: number, y: number): number {
  const rooms = world.plan.rooms
  let hit = -1
  for (let i = 0; i < rooms.length; i++) {
    const rect = roomPixelRect(rooms[i])
    if (x < rect.x + 8 || y < rect.y + 8) continue
    if (x >= rect.x + rect.w - 8 || y >= rect.y + rect.h - 8) continue
    hit = i
  }
  return hit
}

export function neighborRooms(world: FloorWorld, index: number): number[] {
  const rooms = world.plan.rooms
  const room = rooms[index]
  if (!room) return []
  const a = roomPixelRect(room)
  const out: number[] = []
  for (let i = 0; i < rooms.length; i++) {
    if (i === index) continue
    const b = roomPixelRect(rooms[i])
    const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (iw > 0 && ih > 0 && (iw <= MANSION_TILE || ih <= MANSION_TILE)) out.push(i)
  }
  return out
}

export function gateInRoom(world: FloorWorld, gate: Gate, index: number): boolean {
  const room = world.plan.rooms[index]
  if (!room) return false
  const rect = roomTileRect(room)
  for (const tile of gate.tiles) {
    const x = tile % world.cols
    const y = Math.floor(tile / world.cols)
    if (x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h) return true
  }
  return false
}

export function clampRoom(world: FloorWorld, index: number, x: number, y: number): { x: number; y: number } {
  const room = world.plan.rooms[index]
  if (!room) return { x, y }
  const rect = roomPixelRect(room)
  return {
    x: clamp(x, rect.x + BODY_RX, rect.x + rect.w - BODY_RX),
    y: clamp(y, rect.y + BODY_RY, rect.y + rect.h - BODY_RY),
  }
}
