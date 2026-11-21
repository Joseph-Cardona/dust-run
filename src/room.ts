import { Sprite, TilingSprite, type Container } from 'pixi.js'
import type { Art } from './assets.ts'
import { COLS, GLARE_AT, ROWS, ROOM_W, TILE, type FloorId } from './spec.ts'

const WEIGHTS: { id: FloorId; w: number }[] = [
  { id: 'a', w: 6 },
  { id: 'b', w: 3 },
  { id: 'c', w: 3 },
  { id: 'd', w: 2 },
  { id: 'e', w: 1.5 },
  { id: 'f', w: 1 },
]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng: () => number, ban: Set<FloorId>): FloorId {
  let total = 0
  const opts: { id: FloorId; w: number }[] = []
  for (const item of WEIGHTS) {
    if (item.id !== 'a' && ban.has(item.id)) continue
    opts.push(item)
    total += item.w
  }
  let r = rng() * total
  for (const item of opts) {
    r -= item.w
    if (r <= 0) return item.id
  }
  return 'a'
}

export function makeFloor(seed: number): FloorId[][] {
  const rng = mulberry32(seed)
  const grid: FloorId[][] = []
  for (let y = 0; y < ROWS; y++) {
    const row: FloorId[] = []
    for (let x = 0; x < COLS; x++) {
      const ban = new Set<FloorId>()
      const left = x > 0 ? row[x - 1] : undefined
      const up = y > 0 ? grid[y - 1][x] : undefined
      if (left && left !== 'a') ban.add(left)
      if (up && up !== 'a') ban.add(up)
      row.push(pick(rng, ban))
    }
    grid.push(row)
  }
  return grid
}

export const FLOOR_GRID = makeFloor(20261116)

export function addFloor(world: Container, art: Art, grid: FloorId[][]): void {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = new Sprite(art.floor[grid[y][x]])
      tile.position.set(x * TILE, y * TILE)
      tile.roundPixels = true
      world.addChild(tile)
    }
  }
  const wall = new TilingSprite({
    texture: art.wall,
    width: ROOM_W,
    height: 23,
    roundPixels: true,
  })
  const shade = new TilingSprite({
    texture: art.shade,
    width: ROOM_W,
    height: 2,
    roundPixels: true,
  })
  shade.y = 23
  world.addChild(wall, shade)
}

export function addGlare(world: Container, art: Art): void {
  for (const spot of GLARE_AT) {
    const glare = new Sprite(art.glare)
    glare.position.set(spot.x, spot.y)
    glare.roundPixels = true
    world.addChild(glare)
  }
}
