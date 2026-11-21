import {
  CELL_H, CELL_W, MANSION_TILE, THEMES,
  type DoorState, type FloorPlan, type MansionRoom, type Side,
} from './mansion.ts'
import { makeRng, type Rng } from './rng.ts'

export interface PropDef {
  fw: number
  fd: number
  wall: boolean
}

export const PROPS: Record<string, PropDef> = {
  dining_table: { fw: 6, fd: 2, wall: false },
  chair: { fw: 1, fd: 1, wall: false },
  sofa: { fw: 3, fd: 2, wall: false },
  armchair: { fw: 2, fd: 2, wall: false },
  bed: { fw: 3, fd: 4, wall: false },
  wardrobe: { fw: 2, fd: 1, wall: true },
  desk: { fw: 3, fd: 2, wall: false },
  bookshelf: { fw: 2, fd: 1, wall: true },
  fireplace: { fw: 3, fd: 1, wall: true },
  painting: { fw: 2, fd: 0, wall: true },
  window: { fw: 2, fd: 0, wall: true },
  pillar: { fw: 1, fd: 1, wall: false },
  statue: { fw: 2, fd: 2, wall: false },
  plant: { fw: 1, fd: 1, wall: false },
  palm: { fw: 2, fd: 2, wall: false },
  hedge: { fw: 2, fd: 1, wall: false },
  fountain: { fw: 4, fd: 3, wall: false },
  piano: { fw: 4, fd: 3, wall: false },
  bathtub: { fw: 3, fd: 2, wall: false },
  vanity: { fw: 2, fd: 1, wall: true },
  counter: { fw: 4, fd: 1, wall: true },
  stove: { fw: 2, fd: 1, wall: true },
  fridge: { fw: 1, fd: 1, wall: true },
  island: { fw: 4, fd: 2, wall: false },
  washer: { fw: 1, fd: 1, wall: true },
  basket: { fw: 1, fd: 1, wall: false },
  wine_rack: { fw: 3, fd: 1, wall: true },
  barrel: { fw: 1, fd: 1, wall: false },
  barrel_stack: { fw: 2, fd: 1, wall: false },
  crate: { fw: 1, fd: 1, wall: false },
  sheet_furniture: { fw: 2, fd: 2, wall: false },
  trunk: { fw: 2, fd: 1, wall: false },
  trophy_case: { fw: 2, fd: 1, wall: true },
  trophy_stand: { fw: 1, fd: 1, wall: false },
  server_rack: { fw: 1, fd: 1, wall: true },
  boiler: { fw: 2, fd: 2, wall: false },
  metal_shelf: { fw: 2, fd: 1, wall: true },
  bench: { fw: 3, fd: 1, wall: false },
  globe: { fw: 1, fd: 1, wall: false },
  clock: { fw: 1, fd: 1, wall: true },
  coat_rack: { fw: 1, fd: 1, wall: false },
  stairs_down: { fw: 3, fd: 2, wall: false },
  stairs_up: { fw: 3, fd: 2, wall: false },
  shrine: { fw: 2, fd: 2, wall: false },
  shop_counter: { fw: 4, fd: 2, wall: false },
  treasure_chest: { fw: 2, fd: 1, wall: false },
  coin_pile: { fw: 2, fd: 1, wall: false },
  dock: { fw: 3, fd: 2, wall: true },
  boss_seal: { fw: 6, fd: 4, wall: false },
}

const HALL: Record<number, { floor: string; wall: string; runner: string | null }> = {
  1: { floor: 'marble', wall: 'plaster', runner: 'carpet_terra' },
  2: { floor: 'hardwood', wall: 'wallpaper', runner: 'carpet_ice' },
  3: { floor: 'flagstone', wall: 'stone', runner: null },
  4: { floor: 'concrete', wall: 'concrete', runner: null },
  5: { floor: 'grate', wall: 'server', runner: null },
}

/** Player body. Wider than tall, centered on the player point. */
export const BODY_RX = 10
export const BODY_RY = 7

/** Distance from the player point to the oval rim along (dx, dy). */
export function bodyRim(dx: number, dy: number): number {
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return BODY_RX
  return Math.hypot((dx / dist) * BODY_RX, (dy / dist) * BODY_RY)
}

export interface PlacedProp {
  name: string
  x: number
  y: number
  fw: number
  fd: number
}

export interface FloorStamp {
  x: number
  y: number
  kind: string
}

export interface WallStamp {
  x: number
  y: number
  theme: string
  cls: string
}

export interface Gate {
  tiles: number[]
  state: DoorState
  side: Side
  x: number
  y: number
  /** Hall join. The leaf stays hidden until a combat seal. */
  bare: boolean
}

export interface FloorWorld {
  plan: FloorPlan
  cols: number
  rows: number
  solid: Uint8Array
  /** Gate tiles and the open floor beside them. A free one never blocks. */
  mouth: Uint8Array
  gates: Gate[]
  floors: FloorStamp[]
  walls: WallStamp[]
  props: PlacedProp[]
  deco: PlacedProp[]
  seals: { x: number; y: number; w: number; h: number }[]
  hazards: { kind: string; x: number; y: number; w: number; h: number }[]
  /** Canonical room index. Connected hallway cells share one index. */
  groups: number[]
  spawnX: number
  spawnY: number
}

export function assemble(plan: FloorPlan): FloorWorld {
  const cols = (plan.cols - 1) * (CELL_W - 1) + CELL_W
  const rows = (plan.rows - 1) * (CELL_H - 1) + CELL_H
  const solid = new Uint8Array(cols * rows).fill(1)
  const floorAt = new Map<string, FloorStamp>()
  const wallAt = new Map<string, WallStamp>()
  const props: PlacedProp[] = []
  const deco: PlacedProp[] = []
  const seals: FloorWorld['seals'] = []
  const hazards: FloorWorld['hazards'] = []
  const gates: Gate[] = []
  const carve = new Set<string>()
  const grid = cellGrid(plan)
  for (const room of plan.rooms) {
    const built = furnish(room, plan.floor, plan.seed * 100 + plan.rooms.indexOf(room))
    for (const tile of built.floor) {
      const placed = worldTile(room, tile.x, tile.y)
      const id = key(placed.x, placed.y)
      if (!floorAt.has(id)) floorAt.set(id, { x: placed.x, y: placed.y, kind: tile.kind })
      solid[placed.x + placed.y * cols] = 0
    }
    for (const tile of built.walls) {
      const placed = worldTile(room, tile.x, tile.y)
      const id = key(placed.x, placed.y)
      if (!wallAt.has(id)) wallAt.set(id, { x: placed.x, y: placed.y, theme: tile.theme, cls: tile.cls })
    }
    for (const prop of built.props) {
      const origin = worldTile(room, prop.x, prop.y)
      const far = worldTile(room, prop.x + prop.fw - 1, prop.y + prop.fd - 1)
      props.push({ ...prop, x: origin.x, y: origin.y, fw: far.x - origin.x + 1, fd: far.y - origin.y + 1 })
      for (let j = 0; j < prop.fd; j++) {
        for (let i = 0; i < prop.fw; i++) {
          const placed = worldTile(room, prop.x + i, prop.y + j)
          if (placed.x >= 0 && placed.y >= 0 && placed.x < cols && placed.y < rows) solid[placed.x + placed.y * cols] = 1
        }
      }
    }
    for (const item of built.deco) {
      const placed = worldTile(room, item.x, item.y)
      deco.push({ ...item, x: placed.x, y: placed.y })
    }
    for (const seal of built.seals) seals.push(span(room, seal.x, seal.y, seal.w, seal.h))
    for (const hazard of built.hazards) hazards.push({ ...hazard, ...span(room, hazard.x, hazard.y, hazard.w, hazard.h) })
    for (const door of room.doors) {
      const placed = doorTiles(room, door.cx, door.cy, door.side).map(([x, y]) => worldTile(room, x, y))
      let minX = cols
      let minY = rows
      for (const tile of placed) {
        minX = Math.min(minX, tile.x)
        minY = Math.min(minY, tile.y)
        carve.add(key(tile.x, tile.y))
        solid[tile.x + tile.y * cols] = 0
      }
      for (const [x, y] of throatTiles(door.cx, door.side)) {
        const tile = worldTile(room, x, y)
        carve.add(key(tile.x, tile.y))
        solid[tile.x + tile.y * cols] = 0
      }
      if (coveredDoor(room, door, grid)) continue
      const tiles = placed.map((tile) => tile.x + tile.y * cols)
      const neighbor = doorNeighbor(plan, room, door, grid)
      const hallJoin = (room.theme === 'hallway' || neighbor?.theme === 'hallway')
        && (door.state === 'arch' || door.state === 'open' || door.state === 'closed')
      gates.push({
        tiles,
        state: hallJoin ? 'arch' : door.state,
        side: door.side,
        x: minX,
        y: minY,
        bare: hallJoin,
      })
    }
  }
  for (const id of carve) wallAt.delete(id)
  openHallSeams(plan, floorAt, wallAt, solid, cols, rows, grid)
  const classFloor = new Set<string>()
  for (const id of floorAt.keys()) if (!carve.has(id)) classFloor.add(id)
  const classSolid = new Set<string>(wallAt.keys())
  for (const id of carve) classSolid.add(id)
  const mask: Mask = { solid: classSolid, floor: classFloor }
  for (const wall of wallAt.values()) wall.cls = wallClass(mask, wall.x, wall.y)
  retileMouths(plan, floorAt, grid)
  const floors = [...floorAt.values()]
  const walls = [...wallAt.values()]
  const mouth = new Uint8Array(cols * rows)
  for (const gate of gates) {
    for (const tile of gate.tiles) {
      mouth[tile] = 1
      const x = tile % cols
      const y = Math.floor(tile / cols)
      if (x > 0) mouth[tile - 1] = 1
      if (x + 1 < cols) mouth[tile + 1] = 1
      if (y > 0) mouth[tile - cols] = 1
      if (y + 1 < rows) mouth[tile + cols] = 1
    }
  }
  const start = plan.rooms[plan.start]
  const spawn = findSpawn(solid, cols, rows, gates, start)
  return {
    plan, cols, rows, solid, mouth, gates, floors, walls, props, deco, seals, hazards,
    groups: hallGroups(plan, grid),
    spawnX: (spawn.x + 0.5) * MANSION_TILE,
    spawnY: (spawn.y + 0.85) * MANSION_TILE,
  }
}

/** True when the player oval still covers a gate tile. */
export function bodyOnGate(world: FloorWorld, x: number, y: number, gate: Gate): boolean {
  const tiles = bodyTiles(world, x, y)
  return gate.tiles.some((tile) => tiles.includes(tile))
}

export function blockedAt(world: FloorWorld, x: number, y: number, dx: number, dy: number): boolean {
  const cx = Math.floor(x / MANSION_TILE)
  const cy = Math.floor(y / MANSION_TILE)
  if (cx >= 0 && cy >= 0 && cx < world.cols && cy < world.rows) {
    const center = cx + cy * world.cols
    // Doorway floor with no hitbox stays walkable. The oval may cross the frame.
    if (world.mouth[center] === 1 && world.solid[center] !== 1 && !gateCovers(world, center, dx, dy)) return false
  }
  const tiles = bodyTiles(world, x, y)
  for (const tile of tiles) {
    if (tile < 0 || world.solid[tile] === 1) return true
  }
  for (const gate of world.gates) {
    if (!gate.tiles.some((tile) => tiles.includes(tile))) continue
    if (gateBlocks(gate, dx, dy)) return true
  }
  return false
}

/** True when a blocking gate owns this tile. Open and arch do not. */
function gateCovers(world: FloorWorld, tile: number, dx: number, dy: number): boolean {
  for (const gate of world.gates) {
    if (!gate.tiles.includes(tile)) continue
    if (gateBlocks(gate, dx, dy)) return true
  }
  return false
}

export function openTouched(world: FloorWorld, x: number, y: number): Gate[] {
  const opened: Gate[] = []
  const tiles = new Set(bodyTiles(world, x, y))
  const extra = bodyTiles(world, x, y, 16)
  for (const tile of extra) tiles.add(tile)
  for (const gate of world.gates) {
    if (gate.state !== 'closed') continue
    if (!gate.tiles.some((tile) => tiles.has(tile))) continue
    gate.state = 'open'
    opened.push(gate)
  }
  return opened
}

/** Opens the first locked gate the body touches. Sealed combat doors stay shut. */
export function useKey(world: FloorWorld, x: number, y: number): Gate | null {
  const tiles = new Set(bodyTiles(world, x, y, 16))
  for (const gate of world.gates) {
    if (gate.state !== 'locked') continue
    if (!gate.tiles.some((tile) => tiles.has(tile))) continue
    gate.state = 'open'
    return gate
  }
  return null
}

export function nearProp(world: FloorWorld, name: string, x: number, y: number, pad = 20): boolean {
  for (const prop of world.props) {
    if (prop.name !== name) continue
    const left = prop.x * MANSION_TILE - pad
    const top = prop.y * MANSION_TILE - pad
    const right = (prop.x + prop.fw) * MANSION_TILE + pad
    const bottom = (prop.y + Math.max(prop.fd, 1)) * MANSION_TILE + pad
    if (x >= left && x <= right && y >= top && y <= bottom) return true
  }
  return false
}

function gateBlocks(gate: Gate, dx: number, dy: number): boolean {
  if (gate.state === 'open' || gate.state === 'arch') return false
  if (gate.state === 'closed' || gate.state === 'locked' || gate.state === 'front' || gate.state === 'sealed') return true
  const normal = gate.side === 'n' ? [0, -1] : gate.side === 's' ? [0, 1] : gate.side === 'e' ? [1, 0] : [-1, 0]
  const dot = dx * normal[0] + dy * normal[1]
  if (gate.state === 'oneway_out') return dot < 0
  if (gate.state === 'oneway_in') return dot > 0
  return true
}

function hitsEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const nx = Math.max(x0, Math.min(cx, x1))
  const ny = Math.max(y0, Math.min(cy, y1))
  const dx = (nx - cx) / rx
  const dy = (ny - cy) / ry
  return dx * dx + dy * dy <= 1
}

function ovalTiles(cols: number, rows: number, x: number, y: number, pad = 0): number[] {
  const rx = BODY_RX + pad
  const ry = BODY_RY + pad
  const x0 = Math.floor((x - rx) / MANSION_TILE)
  const x1 = Math.floor((x + rx) / MANSION_TILE)
  const y0 = Math.floor((y - ry) / MANSION_TILE)
  const y1 = Math.floor((y + ry) / MANSION_TILE)
  const out: number[] = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const left = tx * MANSION_TILE
      const top = ty * MANSION_TILE
      if (!hitsEllipse(x, y, rx, ry, left, top, left + MANSION_TILE, top + MANSION_TILE)) continue
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) out.push(-1)
      else out.push(tx + ty * cols)
    }
  }
  return out
}

function bodyTiles(world: FloorWorld, x: number, y: number, pad = 0): number[] {
  return ovalTiles(world.cols, world.rows, x, y, pad)
}

function spawnClear(solid: Uint8Array, cols: number, rows: number, gates: Gate[], x: number, y: number): boolean {
  const tiles = ovalTiles(cols, rows, x, y)
  for (const tile of tiles) {
    if (tile < 0 || solid[tile] === 1) return false
  }
  for (const gate of gates) {
    if (gate.state === 'open' || gate.state === 'arch') continue
    if (gate.tiles.some((tile) => tiles.includes(tile))) return false
  }
  return tiles.length > 0
}

function findSpawn(solid: Uint8Array, cols: number, rows: number, gates: Gate[], room: MansionRoom): { x: number; y: number } {
  const mid = worldTile(room, Math.floor(room.w * CELL_W / 2), Math.floor(room.h * CELL_H / 2))
  const cx = mid.x
  const cy = mid.y
  for (let ring = 0; ring < 24; ring++) {
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue
        if (solid[x + y * cols] !== 0) continue
        const px = (x + 0.5) * MANSION_TILE
        const py = (y + 0.85) * MANSION_TILE
        if (spawnClear(solid, cols, rows, gates, px, py)) return { x, y }
      }
    }
  }
  return { x: cx, y: cy }
}

function doorTiles(room: MansionRoom, cx: number, cy: number, side: Side): [number, number][] {
  const width = room.w * CELL_W
  const height = room.h * CELL_H
  if (side === 'n') return [[cx * CELL_W + 9, 1], [cx * CELL_W + 10, 1], [cx * CELL_W + 9, 2], [cx * CELL_W + 10, 2]]
  if (side === 's') return [[cx * CELL_W + 9, height - 1], [cx * CELL_W + 10, height - 1]]
  if (side === 'w') return [[0, cy * CELL_H + 6], [0, cy * CELL_H + 7]]
  return [[width - 1, cy * CELL_H + 6], [width - 1, cy * CELL_H + 7]]
}

/** Connected hallway cells share the lowest room index. Other rooms stay alone. */
function hallGroups(plan: FloorPlan, grid: Map<string, number>): number[] {
  const parent = plan.rooms.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parent[root] !== root) root = parent[root]
    let at = index
    while (at !== root) {
      const next = parent[at]
      parent[at] = root
      at = next
    }
    return root
  }
  const unite = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    if (ra < rb) parent[rb] = ra
    else parent[ra] = rb
  }
  for (let index = 0; index < plan.rooms.length; index++) {
    const room = plan.rooms[index]
    if (room.theme !== 'hallway') continue
    for (const door of room.doors) {
      const neighbor = doorNeighbor(plan, room, door, grid)
      if (neighbor?.theme !== 'hallway') continue
      const other = grid.get(key(
        room.x + door.cx + (door.side === 'e' ? 1 : door.side === 'w' ? -1 : 0),
        room.y + door.cy + (door.side === 's' ? 1 : door.side === 'n' ? -1 : 0),
      ))
      if (other !== undefined) unite(index, other)
    }
  }
  return parent.map((_, index) => find(index))
}

function cellGrid(plan: FloorPlan): Map<string, number> {
  const grid = new Map<string, number>()
  plan.rooms.forEach((room, index) => {
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) grid.set(key(room.x + x, room.y + y), index)
    }
  })
  return grid
}

/** Neighbors share the edge tile. A 2-wide room also loses the empty column where its cells meet. */
function worldTile(room: MansionRoom, x: number, y: number): { x: number; y: number } {
  return {
    x: (room.x + Math.floor(x / CELL_W)) * (CELL_W - 1) + (x % CELL_W),
    y: (room.y + Math.floor(y / CELL_H)) * (CELL_H - 1) + (y % CELL_H),
  }
}

function span(room: MansionRoom, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const origin = worldTile(room, x, y)
  const far = worldTile(room, x + w - 1, y + h - 1)
  return { x: origin.x, y: origin.y, w: far.x - origin.x + 1, h: far.y - origin.y + 1 }
}

/** East door already occupies this column. A second west leaf would stack on the same pixels. */
function coveredDoor(room: MansionRoom, door: { side: Side; cx: number; cy: number }, grid: Map<string, number>): boolean {
  return door.side === 'w' && grid.has(key(room.x - 1, room.y + door.cy))
}

function doorNeighbor(
  plan: FloorPlan,
  room: MansionRoom,
  door: { cx: number; cy: number; side: Side },
  grid: Map<string, number>,
): MansionRoom | undefined {
  const nx = room.x + door.cx + (door.side === 'e' ? 1 : door.side === 'w' ? -1 : 0)
  const ny = room.y + door.cy + (door.side === 's' ? 1 : door.side === 'n' ? -1 : 0)
  const index = grid.get(key(nx, ny))
  return index === undefined ? undefined : plan.rooms[index]
}

/** Drop the wall posts that pinch a hall-to-hall joint down to the door. Room joins stay. */
function openHallSeams(
  plan: FloorPlan,
  floorAt: Map<string, FloorStamp>,
  wallAt: Map<string, WallStamp>,
  solid: Uint8Array,
  cols: number,
  rows: number,
  grid: Map<string, number>,
): void {
  const kind = HALL[plan.floor]?.floor ?? 'marble'
  for (const room of plan.rooms) {
    if (room.theme !== 'hallway') continue
    for (const door of room.doors) {
      const neighbor = doorNeighbor(plan, room, door, grid)
      if (neighbor?.theme !== 'hallway') continue
      for (const [x, y] of hallSeamTiles(door)) {
        const placed = worldTile(room, x, y)
        if (placed.x < 0 || placed.y < 0 || placed.x >= cols || placed.y >= rows) continue
        const id = key(placed.x, placed.y)
        wallAt.delete(id)
        solid[placed.x + placed.y * cols] = 0
        if (!floorAt.has(id)) floorAt.set(id, { x: placed.x, y: placed.y, kind })
      }
    }
  }
}

/** Corridor band across one hall cell edge. The 2-tile door is already open. */
function hallSeamTiles(door: { cx: number; cy: number; side: Side }): [number, number][] {
  const x0 = door.cx * CELL_W
  const y0 = door.cy * CELL_H
  const tiles: [number, number][] = []
  if (door.side === 'w' || door.side === 'e') {
    const x = door.side === 'w' ? x0 : x0 + CELL_W - 1
    for (let y = y0 + 5; y <= y0 + 8; y++) tiles.push([x, y])
    return tiles
  }
  if (door.side === 'n') {
    for (let y = y0; y <= y0 + 2; y++) {
      for (let x = x0 + 8; x <= x0 + 11; x++) tiles.push([x, y])
    }
    return tiles
  }
  const y = y0 + CELL_H - 1
  for (let x = x0 + 8; x <= x0 + 11; x++) tiles.push([x, y])
  return tiles
}

/** Hallway mouth before the runner. Room joins use that room's floor. Hall joins use carpet. */
function retileMouths(plan: FloorPlan, floorAt: Map<string, FloorStamp>, grid: Map<string, number>): void {
  const carpet = HALL[plan.floor]?.runner ?? 'carpet_terra'
  for (const room of plan.rooms) {
    if (room.theme !== 'hallway') continue
    for (const door of room.doors) {
      const nx = room.x + door.cx + (door.side === 'e' ? 1 : door.side === 'w' ? -1 : 0)
      const ny = room.y + door.cy + (door.side === 's' ? 1 : door.side === 'n' ? -1 : 0)
      const index = grid.get(key(nx, ny))
      if (index === undefined) continue
      const neighbor = plan.rooms[index]
      const kind = neighbor.theme === 'hallway' ? carpet : (THEMES[neighbor.theme].floor ?? carpet)
      for (const [x, y] of mouthTiles(door.side)) {
        const placed = worldTile(room, x, y)
        const stamp = floorAt.get(key(placed.x, placed.y))
        if (stamp) stamp.kind = kind
      }
    }
  }
}

function mouthTiles(side: Side): [number, number][] {
  if (side === 'n') return [[9, 0], [10, 0], [9, 1], [10, 1], [9, 2], [10, 2]]
  if (side === 's') return [[9, 11], [10, 11]]
  if (side === 'w') return [[0, 6], [1, 6], [0, 7], [1, 7]]
  return [[18, 6], [19, 6], [18, 7], [19, 7]]
}

/** North cap is outside the 32px door sprite and would seal the mouth. */
function throatTiles(cx: number, side: Side): [number, number][] {
  if (side !== 'n') return []
  return [[cx * CELL_W + 9, 0], [cx * CELL_W + 10, 0]]
}

interface Built {
  floor: FloorStamp[]
  walls: WallStamp[]
  props: PlacedProp[]
  deco: PlacedProp[]
  seals: { x: number; y: number; w: number; h: number }[]
  hazards: { kind: string; x: number; y: number; w: number; h: number }[]
}

function furnish(room: MansionRoom, floorNo: number, seed: number): Built {
  const draft = new DraftRoom(room, floorNo, seed)
  const doorSet = new Set(room.doors.flatMap((door) => (
    [...doorTiles(room, door.cx, door.cy, door.side), ...throatTiles(door.cx, door.side)].map(([x, y]) => key(x, y))
  )))
  const floor: FloorStamp[] = []
  for (const raw of draft.floor) {
    const tile = at(raw)
    const override = draft.overrides.find((item) => tile.x >= item.x && tile.y >= item.y && tile.x < item.x + item.w && tile.y < item.y + item.h)
    const rug = draft.rugs.find((item) => item.kind !== 'seal' && tile.x >= item.x && tile.y >= item.y && tile.x < item.x + item.w && tile.y < item.y + item.h)
    floor.push({ x: tile.x, y: tile.y, kind: override?.kind ?? rug?.kind ?? draft.floorKind })
  }
  for (const raw of doorSet) {
    if (draft.floor.has(raw)) continue
    const tile = at(raw)
    floor.push({ x: tile.x, y: tile.y, kind: draft.floorKind })
  }
  const walls: WallStamp[] = []
  for (const raw of draft.solid) {
    const tile = at(raw)
    if (doorSet.has(raw)) continue
    walls.push({ x: tile.x, y: tile.y, theme: draft.wallTheme, cls: wallClass(draft, tile.x, tile.y) })
  }
  return {
    floor,
    walls,
    props: draft.props.map(([name, x, y]) => ({ name, x, y, fw: PROPS[name].fw, fd: PROPS[name].fd })),
    deco: draft.deco.map(([x, y, name]) => ({ name, x, y, fw: PROPS[name].fw, fd: 0 })),
    seals: draft.rugs.filter((rug) => rug.kind === 'seal').map(({ x, y, w, h }) => ({ x, y, w, h })),
    hazards: draft.hazards,
  }
}

interface Mask {
  solid: Set<string>
  floor: Set<string>
}

function wallClass(room: Mask, x: number, y: number): string {
  const kind = kindAt(room, x, y)
  if (kind === 'ft') return 'face_upper'
  if (kind === 'fb') {
    const west = kindAt(room, x - 1, y) !== 'fb'
    const east = kindAt(room, x + 1, y) !== 'fb'
    if (west && !east) return 'face_end_west'
    if (east && !west) return 'face_end_east'
    return 'face_lower'
  }
  const cap = (tx: number, ty: number): boolean => kindAt(room, tx, ty) === 'cap'
  const n = cap(x, y - 1)
  const s = cap(x, y + 1)
  const w = cap(x - 1, y)
  const e = cap(x + 1, y)
  const northFace = kindAt(room, x, y - 1)
  const southFace = kindAt(room, x, y + 1)
  if (!w && !e && (n || s || northFace === 'ft' || northFace === 'fb' || southFace === 'ft' || southFace === 'fb')) return 'side_left'
  if (!n && !w) return 'outer_nw'
  if (!n && !e) return 'outer_ne'
  if (!s && !w) return 'outer_sw'
  if (!s && !e) return 'outer_se'
  if (!w && n && s) return 'side_left'
  if (!e && n && s) return 'side_right'
  if (!s && w && e) return 'bottom'
  if (n && w && !cap(x - 1, y - 1)) return 'inner_corner_cap'
  if (n && e && !cap(x + 1, y - 1)) return 'inner_corner_cap'
  if (!n && w && e) return 'cap_top'
  return 'end_cap_notch'
}

function kindAt(room: Mask, x: number, y: number, join = true): 'fb' | 'ft' | 'cap' | null {
  if (!room.solid.has(key(x, y))) return null
  if (room.floor.has(key(x, y + 1))) return 'fb'
  if (room.solid.has(key(x, y + 1)) && room.floor.has(key(x, y + 2))) return 'ft'
  if (join) {
    const west = kindAt(room, x - 1, y, false)
    const east = kindAt(room, x + 1, y, false)
    if (west === 'ft' && east === 'ft') return 'ft'
    if (west === 'fb' && east === 'fb') return 'fb'
  }
  return 'cap'
}

function key(x: number, y: number): string {
  return `${x},${y}`
}

function at(value: string): { x: number; y: number } {
  const [x, y] = value.split(',')
  return { x: Number(x), y: Number(y) }
}

class DraftRoom {
  readonly width: number
  readonly height: number
  readonly floorKind: string
  readonly wallTheme: string
  readonly floor = new Set<string>()
  readonly solid = new Set<string>()
  readonly props: [string, number, number][] = []
  readonly deco: [number, number, string][] = []
  readonly rugs: { kind: string; x: number; y: number; w: number; h: number }[] = []
  readonly hazards: { kind: string; x: number; y: number; w: number; h: number }[] = []
  readonly overrides: { kind: string; x: number; y: number; w: number; h: number }[] = []
  readonly blocked = new Set<string>()
  readonly arms: Set<Side>
  readonly iw: number
  readonly ih: number
  private readonly rng: Rng
  private readonly room: MansionRoom

  constructor(room: MansionRoom, floorNo: number, seed: number) {
    this.room = room
    this.rng = makeRng(seed)
    this.width = room.w * CELL_W
    this.height = room.h * CELL_H
    const theme = THEMES[room.theme]
    if (room.theme === 'hallway') {
      const hall = HALL[floorNo]
      this.floorKind = hall.floor
      this.wallTheme = hall.wall
      this.arms = new Set(room.doors.map((door) => door.side))
      if (this.arms.size === 0) this.arms = new Set(['n', 's'])
    } else {
      this.floorKind = theme.floor ?? 'marble'
      this.wallTheme = theme.wall ?? 'plaster'
      this.arms = new Set()
    }
    this.shape()
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.floor.has(key(x, y))) continue
        let near = false
        for (let dy = -1; dy <= 3 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (this.floor.has(key(x + dx, y + dy))) near = true
          }
        }
        if (near) this.solid.add(key(x, y))
      }
    }
    this.iw = this.width - 2
    this.ih = this.height - 4
    if (room.theme === 'hallway') {
      this.hallDecor(HALL[floorNo].runner)
      return
    }
    if (room.role) this.applyRole()
    LAYOUT[room.theme]?.(this)
  }

  private shape(): void {
    if (this.room.theme !== 'hallway') {
      for (let y = 3; y < this.height - 1; y++) {
        for (let x = 1; x < this.width - 1; x++) this.floor.add(key(x, y))
      }
      return
    }
    const fill = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) this.floor.add(key(x, y))
      }
    }
    fill(8, 5, 11, 8)
    if (this.arms.has('n')) fill(8, 3, 11, 8)
    if (this.arms.has('s')) fill(8, 5, 11, 10)
    if (this.arms.has('w')) fill(1, 5, 11, 8)
    if (this.arms.has('e')) fill(8, 5, 18, 8)
  }

  private applyRole(): void {
    const role = this.room.role
    const cx = Math.floor(this.iw / 2)
    const cy = Math.floor(this.ih / 2)
    if (role === 'shrine') this.place('shrine', cx - 1, cy - 1, true)
    else if (role === 'shop') {
      if (this.room.w > 1) this.place('shop_counter', cx - 2, 0, true)
      else this.place('shop_counter', cx - 2, cy - 1, true)
    } else if (role === 'start' && this.room.theme !== 'foyer') this.place('stairs_up', cx - 1, cy - 1, true)
    else if (role === 'stairs') this.place('stairs_down', cx - 1, cy - 1, true)
    else if (role === 'boss') this.rugs.push({ kind: 'seal', x: 1 + cx - 3, y: 3 + cy - 2, w: 6, h: 4 })
  }

  private hallDecor(runner: string | null): void {
    if (runner) {
      if (this.arms.has('n') || this.arms.has('s')) {
        const y0 = this.arms.has('n') ? 3 : 6
        const y1 = this.arms.has('s') ? 10 : 7
        this.rugs.push({ kind: runner, x: 9, y: y0, w: 2, h: y1 - y0 + 1 })
      }
      if (this.arms.has('w') || this.arms.has('e')) {
        const x0 = this.arms.has('w') ? 2 : 9
        const x1 = this.arms.has('e') ? 17 : 10
        this.rugs.push({ kind: runner, x: x0, y: 6, w: x1 - x0 + 1, h: 2 })
      }
    }
    if (this.arms.has('w')) this.deco.push([3, 3, 'painting'])
    if (this.arms.has('e')) this.deco.push([14, 3, 'painting'])
    if (!this.arms.has('w')) {
      this.props.push(['plant', 8, 5])
      this.blocked.add(key(8, 5))
    }
    if (!this.arms.has('e')) {
      this.props.push(['plant', 11, 5])
      this.blocked.add(key(11, 5))
    }
  }

  place(name: string, x: number, y: number, force = false): boolean {
    const prop = PROPS[name]
    if (!prop || prop.fd === 0) return false
    const gx = 1 + x
    const gy = 3 + y
    const tiles: string[] = []
    for (let j = 0; j < prop.fd; j++) {
      for (let i = 0; i < prop.fw; i++) tiles.push(key(gx + i, gy + j))
    }
    if (tiles.some((tile) => !this.floor.has(tile) || this.blocked.has(tile))) return false
    if (!force && !this.reach(tiles)) return false
    for (const tile of tiles) this.blocked.add(tile)
    this.props.push([name, gx, gy])
    return true
  }

  private reach(extra: string[]): boolean {
    const blocked = new Set(this.blocked)
    for (const tile of extra) blocked.add(tile)
    const ok = (x: number, y: number): boolean => {
      for (let b = 0; b < 2; b++) {
        for (let a = 0; a < 2; a++) {
          const tile = key(x + a, y + b)
          if (!this.floor.has(tile) || blocked.has(tile)) return false
        }
      }
      return true
    }
    const starts: [number, number][][] = []
    for (const socket of this.sockets()) {
      const entry = this.entry(socket.cx, socket.cy, socket.side)
      const x = Math.min(...entry.map((tile) => tile[0]))
      const y = Math.min(...entry.map((tile) => tile[1]))
      const cand: [number, number][] = socket.side === 'e' || socket.side === 's'
        ? [[x, y], [x, y - 1], [x - 1, y], [x - 1, y - 1]]
        : [[x, y]]
      const open = cand.filter((tile) => ok(tile[0], tile[1]))
      starts.push(open)
    }
    if (starts.some((items) => items.length === 0)) return false
    const seen = new Set<string>([key(starts[0][0][0], starts[0][0][1])])
    const queue = [starts[0][0]]
    while (queue.length > 0) {
      const [x, y] = queue.pop()!
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nx = x + dx
        const ny = y + dy
        const id = key(nx, ny)
        if (seen.has(id) || !ok(nx, ny)) continue
        seen.add(id)
        queue.push([nx, ny])
      }
    }
    return starts.every((items) => items.some((tile) => seen.has(key(tile[0], tile[1]))))
  }

  private sockets(): { cx: number; cy: number; side: Side }[] {
    if (this.room.theme === 'hallway') return [...this.arms].map((side) => ({ cx: 0, cy: 0, side }))
    const out: { cx: number; cy: number; side: Side }[] = []
    for (let cx = 0; cx < this.room.w; cx++) {
      out.push({ cx, cy: 0, side: 'n' }, { cx, cy: this.room.h - 1, side: 's' })
    }
    for (let cy = 0; cy < this.room.h; cy++) {
      out.push({ cx: 0, cy, side: 'w' }, { cx: this.room.w - 1, cy, side: 'e' })
    }
    return out
  }

  private entry(cx: number, cy: number, side: Side): [number, number][] {
    if (side === 'n') return [[cx * CELL_W + 9, 3], [cx * CELL_W + 10, 3]]
    if (side === 's') return [[cx * CELL_W + 9, this.height - 2], [cx * CELL_W + 10, this.height - 2]]
    if (side === 'w') return [[1, cy * CELL_H + 6], [1, cy * CELL_H + 7]]
    return [[this.width - 2, cy * CELL_H + 6], [this.width - 2, cy * CELL_H + 7]]
  }

  sym(name: string, x: number, y: number): boolean {
    const placed = this.place(name, x, y)
    const mx = this.iw - x - PROPS[name].fw
    const other = mx === x ? placed : this.place(name, mx, y)
    return placed && other
  }

  wall(name: string, x: number): boolean {
    return this.place(name, x, 0)
  }

  wsym(name: string, x: number): boolean {
    return this.sym(name, x, 0)
  }

  face(name: string, x: number): boolean {
    const prop = PROPS[name]
    const gx = 1 + x
    const cols = new Set<number>()
    for (let i = 0; i < prop.fw; i++) cols.add(gx + i)
    for (let cx = 0; cx < this.room.w; cx++) {
      for (const col of [8, 9, 10, 11]) {
        if (cols.has(cx * CELL_W + col)) return false
      }
    }
    if (gx < 1 || gx + prop.fw > this.width - 1) return false
    for (const [dx, , existing] of this.deco) {
      const fw = PROPS[existing].fw
      for (let i = 0; i < fw; i++) {
        if (cols.has(dx + i)) return false
      }
    }
    this.deco.push([gx, 1, name])
    return true
  }

  fsym(name: string, x: number): void {
    this.face(name, x)
    this.face(name, this.iw - x - PROPS[name].fw)
  }

  rug(kind: string, x: number, y: number, w: number, h: number): void {
    this.rugs.push({ kind, x: 1 + x, y: 3 + y, w, h })
  }

  patch(kind: string, x: number, y: number, w: number, h: number): void {
    this.overrides.push({ kind, x: 1 + x, y: 3 + y, w, h })
  }

  hazard(kind: string, x: number, y: number, w = 2, h = 1): boolean {
    const gx = 1 + x
    const gy = 3 + y
    const tiles: string[] = []
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) tiles.push(key(gx + i, gy + j))
    }
    if (tiles.some((tile) => !this.floor.has(tile) || this.blocked.has(tile))) return false
    this.hazards.push({ kind, x: gx, y: gy, w, h })
    return true
  }

  get role(): string | null {
    return this.room.role
  }

  scatter(kind: string, count: number, w = 2, h = 1): void {
    let left = count
    for (let n = 0; n < count * 6 && left > 0; n++) {
      const x = this.rng.randrange(0, Math.max(1, this.iw - w))
      const y = this.rng.randrange(1, Math.max(2, this.ih - h))
      if (this.hazard(kind, x, y, w, h)) left -= 1
    }
  }
}

const LAYOUT: Record<string, (room: DraftRoom) => void> = {
  foyer(room) {
    const c = Math.floor(room.iw / 2)
    room.rug('carpet_ice', c - 6, Math.floor(room.ih / 2) - 3, 12, 7)
    room.wall('clock', c - 3)
    room.wall('clock', c + 2)
    for (const y of [2, room.ih - 4]) room.sym('pillar', c - 8, y)
    room.sym('plant', 1, 1)
    room.sym('plant', 1, room.ih - 2)
    room.sym('coat_rack', 3, room.ih - 2)
    room.sym('statue', c - 12, Math.floor(room.ih / 2) - 1)
    room.fsym('window', 2)
    room.fsym('painting', 13)
    room.fsym('window', 22)
  },
  dining(room) {
    const c = Math.floor(room.iw / 2)
    room.rug('carpet_terra', c - 6, 1, 12, 6)
    room.place('dining_table', c - 3, 3)
    for (const x of [c - 3, c - 1, c + 1, c + 2]) {
      room.place('chair', x, 2)
      room.place('chair', x, 5)
    }
    if (!room.wall('fireplace', c - 1)) room.wall('fireplace', c - 2)
    room.sym('plant', 0, 1)
    room.sym('plant', 0, room.ih - 1)
    room.wsym('wardrobe', 3)
    room.fsym('painting', 5)
    room.fsym('painting', 13)
  },
  kitchen(room) {
    room.wall('counter', 1)
    room.wall('stove', 5)
    room.wall('fridge', 7)
    if (room.width > CELL_W) {
      room.wall('counter', 23)
      room.wall('stove', 27)
      room.wall('fridge', 33)
      room.wall('counter', 13)
    } else {
      room.wall('counter', 12)
      room.wall('fridge', 16)
    }
    const c = Math.floor(room.iw / 2)
    room.place('island', c - 2, 4)
    room.place('barrel', 0, room.ih - 1)
    room.place('basket', room.iw - 1, room.ih - 1)
    room.scatter('coffee', 1)
    room.scatter('water', 1)
    room.fsym('window', 3)
  },
  library(room) {
    for (let x = 0; x < room.iw - 1; x += 2) room.wall('bookshelf', x)
    const c = Math.floor(room.iw / 2)
    const cy = Math.floor(room.ih / 2)
    room.rug('carpet_olive', c - 5, cy - 2, 10, 5)
    room.place('desk', c - 1, cy - 1)
    room.place('chair', c, cy + 1)
    room.sym('armchair', c - 5, cy - 1)
    room.place('globe', c + 3, cy - 2)
    if (room.height > CELL_H) {
      for (const y of [4, room.ih - 4]) {
        for (const x of [3, 7, room.iw - 9, room.iw - 5]) room.place('bookshelf', x, y)
      }
    }
    room.sym('plant', 0, room.ih - 1)
    room.sym('clock', 1, room.ih - 2)
  },
  ballroom(room) {
    const c = Math.floor(room.iw / 2)
    for (let y = 2; y < room.ih - 1; y += 4) room.sym('pillar', 2, y)
    for (let x = 6; x < c - 2; x += 5) {
      room.sym('pillar', x, 1)
      room.sym('pillar', x, room.ih - 2)
    }
    room.place('piano', 3, Math.floor(room.ih / 2) - 2)
    room.sym('plant', 0, 0)
    room.sym('palm', 0, room.ih - 2)
    room.fsym('window', 2)
    room.fsym('window', 13)
    room.fsym('painting', 6)
    room.fsym('window', 22)
  },
  bathroom(room) {
    room.place('bathtub', 1, 0)
    room.wall('vanity', 13)
    room.wall('vanity', 15)
    room.place('basket', room.iw - 2, room.ih - 1)
    room.place('plant', 0, room.ih - 1)
    room.rug('carpet_ice', 2, 3, 4, 2)
    room.scatter('water', 2)
    room.face('window', 5)
  },
  bedroom(room) {
    if (!room.place('bed', 2, 0)) room.place('bed', 4, 0)
    room.wall('wardrobe', 13)
    room.place('desk', room.iw - 4, room.ih - 2)
    room.place('chair', room.iw - 3, room.ih - 3)
    room.place('plant', 0, room.ih - 1)
    room.rug('carpet_terra', 5, 3, 6, 3)
    room.face('painting', 5)
    room.face('window', 14)
    if (room.width > CELL_W) {
      room.place('bed', 21, 0)
      room.wall('wardrobe', 31)
      room.place('armchair', Math.floor(room.iw / 2) - 1, 3)
      room.face('window', 24)
    }
  },
  conservatory(room) {
    const c = Math.floor(room.iw / 2)
    const cy = Math.floor(room.ih / 2)
    for (const [x, y, w, h] of [[0, 0, 5, 3], [room.iw - 5, 0, 5, 3], [0, room.ih - 3, 5, 3], [room.iw - 5, room.ih - 3, 5, 3]] as [number, number, number, number][]) {
      room.patch('grass', x, y, w, h)
    }
    if (room.height > CELL_H) room.place('fountain', c - 2, cy - 1)
    else room.place('fountain', c - 2, cy - 2)
    room.sym('palm', 1, 0)
    room.sym('hedge', 1, room.ih - 1)
    room.sym('plant', 4, 1)
    room.sym('bench', c - 7, cy)
    room.scatter('water', 1)
    if (room.height > CELL_H) {
      room.sym('palm', 1, cy - 1)
      room.sym('hedge', 6, room.ih - 1)
      room.sym('plant', 8, 3)
    }
  },
  gallery(room) {
    const c = Math.floor(room.iw / 2)
    if (room.width > CELL_W) {
      for (const x of [3, 9]) room.sym('statue', x, 2)
      room.place('bench', c - 1, 4)
      room.rug('carpet_ice', 2, 5, room.iw - 4, 2)
      for (let x = 1; x < room.iw - 2; x += 4) room.face('painting', x)
    } else {
      for (const y of [2, 8, 14]) room.sym('statue', 2, y)
      room.rug('carpet_ice', c - 1, 1, 2, room.ih - 2)
      room.fsym('painting', 2)
      room.sym('pillar', 5, Math.floor(room.ih / 2) - 1)
      room.sym('bench', 3, room.ih - 3)
    }
  },
  wine_cellar(room) {
    for (let x = 0; x < room.iw - 2; x += 3) room.wall('wine_rack', x)
    room.sym('barrel_stack', 1, room.ih - 2)
    room.sym('barrel', 4, room.ih - 1)
    room.sym('crate', 1, 3)
    room.scatter('juice', 2)
    if (room.width > CELL_W) room.place('barrel_stack', Math.floor(room.iw / 2) - 1, 4)
  },
  basement(room) {
    room.place('boiler', 1, 0)
    room.wall('metal_shelf', 5)
    room.wall('metal_shelf', 13)
    room.sym('crate', 1, room.ih - 1)
    room.place('crate', 2, room.ih - 1)
    room.place('barrel', room.iw - 3, room.ih - 2)
    room.scatter('water', 1)
    room.scatter('wire', 1, 3, 1)
    if (room.width > CELL_W) {
      room.place('boiler', 22, 0)
      room.wall('metal_shelf', 30)
      room.place('crate', Math.floor(room.iw / 2), 4)
    }
    if (room.height > CELL_H) {
      for (const y of [6, 13]) room.sym('pillar', 9, y)
      room.sym('metal_shelf', 3, 8)
      room.sym('crate', 4, 14)
      room.sym('crate', 5, 14)
      room.sym('barrel', 6, 16)
      room.place('boiler', Math.floor(room.iw / 2) - 1, 9)
      room.scatter('wire', 2, 3, 1)
      room.scatter('water', 2)
    }
  },
  laundry(room) {
    for (const x of [1, 3, 5]) room.wall('washer', x)
    room.wall('metal_shelf', 13)
    room.place('basket', 2, 4)
    room.place('basket', room.iw - 3, room.ih - 1)
    room.scatter('water', 2)
    room.scatter('wire', 1, 2, 1)
  },
  study(room) {
    const c = Math.floor(room.iw / 2)
    room.wall('bookshelf', 1)
    room.wall('bookshelf', 3)
    room.wall('bookshelf', 13)
    room.wall('bookshelf', 15)
    room.rug('carpet_terra', c - 4, 3, 8, 4)
    if (room.role) room.place('desk', c - 1, room.ih - 3)
    else room.place('desk', c - 1, 3)
    room.place('globe', 1, room.ih - 2)
    room.place('armchair', room.iw - 3, room.ih - 3)
    room.place('plant', 0, 3)
    room.wall('clock', 11)
  },
  attic(room) {
    room.place('sheet_furniture', 1, 0)
    room.place('trunk', 5, room.ih - 1)
    room.place('crate', 12, 0)
    room.place('crate', 13, 0)
    room.place('crate', 12, 1)
    room.place('coat_rack', room.iw - 2, room.ih - 2)
    room.place('sheet_furniture', room.iw - 4, 1)
    room.scatter('soot', 2)
    if (room.width > CELL_W) {
      room.place('sheet_furniture', 22, room.ih - 3)
      room.place('trunk', 27, 1)
      room.place('crate', 33, room.ih - 1)
    }
  },
  trophy(room) {
    room.wsym('trophy_case', 1)
    room.wsym('trophy_case', 4)
    room.rug('carpet_ice', Math.floor(room.iw / 2) - 4, 2, 8, 5)
    room.sym('trophy_stand', 4, 4)
    room.sym('trophy_stand', 6, room.ih - 2)
    room.sym('plant', 0, room.ih - 1)
    if (!room.role) room.place('statue', Math.floor(room.iw / 2) - 1, 3)
  },
  server(room) {
    for (let x = 0; x < room.iw;) {
      if (!inRange(x, 7, 11) && !inRange(x, 27, 31)) room.wall('server_rack', x)
      x += x % 4 === 0 ? 2 : 1
    }
    for (let y = 3; y < room.ih - 1; y += 3) {
      for (const x of [2, 4, room.iw - 5, room.iw - 3]) room.place('server_rack', x, y)
    }
    room.scatter('wire', 2, 3, 1)
  },
  panic(room) {
    for (const y of [2, room.ih - 4]) room.sym('pillar', 3, y)
    for (const x of [0, 1, 2, 3, room.iw - 4, room.iw - 3, room.iw - 2, room.iw - 1]) room.wall('server_rack', x)
    room.scatter('wire', 4, 3, 1)
  },
  stairwell(room) {
    if (!room.role) room.place('stairs_up', Math.floor(room.iw / 2) - 1, 2)
    room.sym('plant', 0, 0)
    room.sym('plant', 0, room.ih - 1)
    room.fsym('window', 2)
  },
  storage(room) {
    for (let x = 0; x < room.iw - 1; x += 3) {
      if (!inRange(x, 6, 11) && !inRange(x, 26, 31)) room.wall('metal_shelf', x)
    }
    for (let y = 2; y < room.ih - 1; y += 3) {
      room.sym('crate', 2, y)
      room.sym('barrel', 4, y)
    }
    room.place('trunk', Math.floor(room.iw / 2) - 1, room.ih - 2)
    room.scatter('soot', 1)
    if (room.height > CELL_H) {
      for (const y of [6, 12]) {
        room.sym('barrel_stack', 7, y)
        room.sym('crate', 11, y)
      }
    }
  },
  boiler(room) {
    room.place('boiler', 1, 0)
    room.place('boiler', room.iw - 3, 0)
    room.wall('metal_shelf', 13)
    if (room.width > CELL_W) {
      room.place('boiler', Math.floor(room.iw / 2) - 1, 0)
      room.place('boiler', 22, 0)
    }
    room.scatter('wire', 2, 3, 1)
    room.scatter('water', 2)
    room.sym('barrel', 1, room.ih - 1)
  },
}

function inRange(n: number, from: number, until: number): boolean {
  return n >= from && n < until
}
