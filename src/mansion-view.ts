import { Assets, Container, Sprite, Texture } from 'pixi.js'
import { auditSamples, bootFloor, buildFloor, MANSION_TILE } from './mansion.ts'
import type { DoorState, Side } from './mansion.ts'
import { assemble, blockedAt, BODY_RX, BODY_RY, openTouched, PROPS, type FloorWorld, type Gate } from './rooms.ts'
import { worldSize } from './spec.ts'

const FLOORS: Record<string, [number, number]> = {
  attic: [8, 8],
  concrete: [8, 8],
  grass: [8, 8],
  hardwood: [8, 8],
  marble: [8, 8],
  flagstone: [2, 2],
  ballroom: [2, 2],
  bath: [1, 1],
  brick: [1, 1],
  carpet_ice: [1, 1],
  carpet_olive: [1, 1],
  carpet_terra: [1, 1],
  checker: [1, 1],
  grate: [1, 1],
  linoleum: [1, 1],
  parquet: [1, 1],
  terratile: [1, 1],
}

const WALLS = ['attic', 'brick', 'concrete', 'glass', 'library', 'plaster', 'server', 'stone', 'tile', 'wallpaper', 'wood']
const WALL_CLASS = [
  'bottom', 'cap_top', 'end_cap_notch', 'face_end_east', 'face_end_west', 'face_lower', 'face_upper',
  'inner_corner_cap', 'inner_corner_face', 'outer_ne', 'outer_nw', 'outer_se', 'outer_sw',
  'side_left', 'side_right',
]
const DOOR_SIDES: Side[] = ['n', 's', 'e', 'w']
const DOOR_STATES = ['open', 'closed', 'locked', 'oneway_in', 'oneway_out']
const HAZARDS = ['coffee', 'juice', 'oil', 'soot', 'water']

export class MansionTiles {
  private readonly cache = new Map<string, Texture>()

  constructor(textures: Map<string, Texture>) {
    this.cache = textures
  }

  floor(kind: string, x: number, y: number): Texture {
    const [w, h] = FLOORS[kind] ?? [1, 1]
    return this.take(`floor-${kind}-${mod(x, w)}-${mod(y, h)}`)
  }

  wall(theme: string, cls: string): Texture {
    return this.take(`wall-${theme}-${cls}`)
  }

  prop(name: string): Texture {
    return this.take(`prop-${name}`)
  }

  door(side: Side, state: DoorState): Texture {
    if (state === 'front') return this.take('door-front')
    const frame = state === 'arch' ? 'open' : state === 'sealed' ? 'locked' : state
    return this.take(`door-${side}-${frame}`)
  }

  hazard(kind: string): Texture {
    return this.take(`hazard-${kind}`)
  }

  wire(kind: 'e' | 'w' | 'ew'): Texture {
    return this.take(`wire-${kind}`)
  }

  private take(alias: string): Texture {
    const tex = this.cache.get(alias)
    if (!tex) throw new Error(`missing mansion tile ${alias}`)
    return tex
  }
}

export interface MansionView {
  world: FloorWorld
  doors: Map<Gate, Sprite>
  texture: Texture
  /** Floor dirt sits here, under the y-sorted actors. */
  cast: Container
}

let audited = false

export async function loadMansionArt(): Promise<MansionTiles> {
  const jobs: { alias: string; src: string }[] = []
  const add = (alias: string, src: string) => jobs.push({ alias, src })
  for (const [kind, [w, h]] of Object.entries(FLOORS)) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) add(`floor-${kind}-${x}-${y}`, `assets/addon2/tiles/77a-floor_${kind}_${x}_${y}.png`)
    }
  }
  for (const theme of WALLS) {
    for (const cls of WALL_CLASS) add(`wall-${theme}-${cls}`, `assets/addon2/tiles/77b-wall_${theme}_${cls}.png`)
  }
  for (const name of Object.keys(PROPS)) add(`prop-${name}`, `assets/addon2/tiles/77d-prop_${name}.png`)
  for (const side of DOOR_SIDES) {
    for (const state of DOOR_STATES) add(`door-${side}-${state}`, `assets/addon2/tiles/77c-door_${side}_${state}.png`)
  }
  add('door-front', 'assets/addon2/tiles/77c-door_front.png')
  for (const kind of HAZARDS) add(`hazard-${kind}`, `assets/addon2/tiles/77e-hazard_${kind}.png`)
  for (const kind of ['e', 'w', 'ew'] as const) add(`wire-${kind}`, `assets/addon2/tiles/77e-wire_${kind}.png`)

  await Assets.load(jobs.map((job) => ({
    alias: job.alias,
    src: job.src,
    data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
  })))

  const textures = new Map<string, Texture>()
  for (const job of jobs) {
    const tex = Assets.get<Texture>(job.alias)
    tex.source.scaleMode = 'nearest'
    tex.source.autoGenerateMipmaps = false
    textures.set(job.alias, tex)
  }
  return new MansionTiles(textures)
}

/** Bake the floor. Each wall tile sorts by its bottom edge so a body covers only the tiles it stands in front of. */
export function mountMansion(
  bg: Container,
  actors: Container,
  tiles: MansionTiles,
  floor?: number,
  seed?: number,
): MansionView {
  if (!audited) {
    try {
      auditSamples()
    } catch (error) {
      audited = false
      throw error
    }
    audited = true
  }
  const boot = floor === undefined ? bootFloor() : { floor, seed: seed ?? 360 }
  const world = assemble(buildFloor(boot.floor, boot.seed))
  worldSize.w = world.cols * MANSION_TILE
  worldSize.h = world.rows * MANSION_TILE

  const canvas = document.createElement('canvas')
  canvas.width = worldSize.w
  canvas.height = worldSize.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingEnabled = false
  for (const tile of world.floors) paint(ctx, tiles.floor(tile.kind, tile.x, tile.y), tile.x * MANSION_TILE, tile.y * MANSION_TILE)
  for (const hazard of world.hazards) paintHazard(ctx, tiles, hazard)
  for (const seal of world.seals) {
    const tex = tiles.prop('boss_seal')
    const x = seal.x * MANSION_TILE + Math.floor((seal.w * MANSION_TILE - tex.width) / 2)
    const y = seal.y * MANSION_TILE + Math.floor((seal.h * MANSION_TILE - tex.height) / 2)
    paint(ctx, tex, x, y)
  }
  for (const item of world.deco) {
    const tex = tiles.prop(item.name)
    const x = item.x * MANSION_TILE + Math.floor((item.fw * MANSION_TILE - tex.width) / 2)
    const y = item.y * MANSION_TILE + Math.floor((2 * MANSION_TILE - tex.height) / 2)
    paint(ctx, tex, x, y)
  }

  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  texture.source.autoGenerateMipmaps = false
  const sprite = new Sprite(texture)
  sprite.roundPixels = true
  bg.addChild(sprite)

  const cast = new Container()
  bg.addChild(cast)

  for (const tile of world.walls) {
    const wall = new Sprite(tiles.wall(tile.theme, tile.cls))
    wall.roundPixels = true
    wall.position.set(tile.x * MANSION_TILE, tile.y * MANSION_TILE)
    wall.zIndex = (tile.y + 1) * MANSION_TILE
    actors.addChild(wall)
  }

  const doors = new Map<Gate, Sprite>()
  for (const gate of world.gates) {
    const door = new Sprite(tiles.door(gate.side, gate.state))
    door.roundPixels = true
    door.position.set(gate.x * MANSION_TILE, gate.y * MANSION_TILE)
    door.zIndex = gate.y * MANSION_TILE + door.texture.height
    door.visible = !gate.bare
    actors.addChild(door)
    doors.set(gate, door)
  }

  for (const prop of world.props) {
    const tex = tiles.prop(prop.name)
    const propSprite = new Sprite(tex)
    propSprite.roundPixels = true
    const foot = Math.max(prop.fd, 1)
    propSprite.position.set(
      Math.round(prop.x * MANSION_TILE + (prop.fw * MANSION_TILE - tex.width) / 2),
      Math.round((prop.y + foot) * MANSION_TILE - tex.height + 1),
    )
    propSprite.zIndex = (prop.y + prop.fd) * MANSION_TILE
    actors.addChild(propSprite)
  }

  return { world, doors, texture, cast }
}

export function slidePlayer(
  world: FloorWorld,
  doors: Map<Gate, Sprite>,
  tiles: MansionTiles,
  x: number,
  y: number,
  prevX: number,
  prevY: number,
): { x: number; y: number } {
  let nextX = x
  let nextY = y
  const dx = nextX - prevX
  const dy = nextY - prevY
  if (dx !== 0 && blockedAt(world, nextX, prevY, dx, 0)) nextX = prevX
  if (dy !== 0 && blockedAt(world, nextX, nextY, 0, nextY - prevY)) nextY = prevY
  nextX = Math.max(BODY_RX, Math.min(worldSize.w - BODY_RX, nextX))
  nextY = Math.max(BODY_RY, Math.min(worldSize.h - BODY_RY, nextY))
  for (const gate of openTouched(world, nextX, nextY)) {
    const sprite = doors.get(gate)
    if (sprite) sprite.texture = tiles.door(gate.side, 'open')
  }
  return { x: nextX, y: nextY }
}

function paintHazard(
  ctx: CanvasRenderingContext2D,
  tiles: MansionTiles,
  hazard: FloorWorld['hazards'][number],
): void {
  // Coffee and water are sweep sprites. Painting them would leave a stain after the vacuum.
  if (hazard.kind === 'coffee' || hazard.kind === 'water') return
  if (hazard.kind === 'wire') {
    for (let i = 0; i < hazard.w; i++) {
      const kind = i === 0 ? 'e' : i === hazard.w - 1 ? 'w' : 'ew'
      paint(ctx, tiles.wire(kind), (hazard.x + i) * MANSION_TILE, hazard.y * MANSION_TILE)
    }
    return
  }
  paint(ctx, tiles.hazard(hazard.kind), hazard.x * MANSION_TILE, hazard.y * MANSION_TILE)
}

function paint(ctx: CanvasRenderingContext2D, tex: Texture, x: number, y: number): void {
  const resource = tex.source.resource
  if (!isDrawable(resource)) throw new Error('tile source is not drawable')
  ctx.drawImage(resource, Math.round(x), Math.round(y))
}

function isDrawable(resource: unknown): resource is CanvasImageSource {
  return resource instanceof HTMLImageElement
    || resource instanceof HTMLCanvasElement
    || resource instanceof ImageBitmap
    || (typeof OffscreenCanvas !== 'undefined' && resource instanceof OffscreenCanvas)
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}
