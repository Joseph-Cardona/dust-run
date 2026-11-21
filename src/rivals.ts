import { Sprite, Texture } from 'pixi.js'
import type { Art } from './assets.ts'
import {
  HIT_R, PLATE, circleRect, type Facing, type Rival, type RivalSpawn,
} from './spec.ts'

export function blankRival(texture: Texture | undefined, x: number, y: number): Rival {
  const sprite = new Sprite(texture ?? Texture.EMPTY)
  sprite.roundPixels = true
  return {
    kind: 'std',
    breed: '47m3',
    x,
    y,
    hp: 1,
    maxHp: 1,
    contact: 10,
    xp: 6,
    lootCoins: 0,
    lootBolts: 0,
    iframe: 0,
    facing: 'down',
    frame: 0,
    frameMs: 0,
    settling: false,
    alive: true,
    react: null,
    rewarded: false,
    fx: blankFx(),
    axis: 'x',
    min: 0,
    max: 1,
    dir: 1,
    speed: 36,
    dustMs: 0,
    sprite,
    vuln: 1,
    act: 'idle',
    actMs: 0,
    cool: 0.4,
    room: 0,
    hang: false,
    key: false,
    smudge: 0,
    smudgeStage: 0,
    markX: 0,
    markY: 0,
    markOn: false,
    plain: false,
    reach: HIT_R,
    aim: 0,
    phase: 1,
    steer: 0,
  }
}

const SETTLE_MS = [100, 120, 120, 100]

export function makeRival(art: Art, spec: RivalSpawn): Rival {
  const facing: Facing = spec.axis === 'x' ? (spec.dir > 0 ? 'right' : 'left') : (spec.dir > 0 ? 'down' : 'up')
  const rival = blankRival(art.rival[spec.kind].glide[facing][0], spec.x, spec.y)
  rival.kind = spec.kind
  rival.breed = spec.kind === 'elite' ? '48m2' : '47m3'
  rival.hp = spec.hp
  rival.maxHp = spec.hp
  rival.contact = spec.kind === 'elite' ? 15 : 10
  rival.xp = spec.kind === 'elite' ? 18 : 6
  rival.lootCoins = spec.kind === 'elite' ? 25 : 5
  rival.lootBolts = spec.kind === 'elite' ? 1 : 0
  rival.key = spec.kind === 'elite'
  rival.facing = facing
  rival.axis = spec.axis
  rival.min = spec.min
  rival.max = spec.max
  rival.dir = spec.dir
  rival.speed = spec.speed
  return rival
}

function blankFx(): Sprite {
  const fx = new Sprite(Texture.EMPTY)
  fx.roundPixels = true
  fx.visible = false
  return fx
}

function turn(rival: Rival): void {
  rival.dir *= -1
  rival.facing = rival.axis === 'x'
    ? (rival.dir > 0 ? 'right' : 'left')
    : (rival.dir > 0 ? 'down' : 'up')
  rival.settling = true
  rival.frame = 0
  rival.frameMs = 0
}

/** Returns true while the rival is gliding. */
export function stepRival(rival: Rival, dt: number, rate = 1): boolean {
  if (!rival.alive || rival.react) return false
  if (rival.settling) {
    rival.frameMs += dt * 1000
    while (rival.frame < 4 && rival.frameMs >= SETTLE_MS[rival.frame]) {
      rival.frameMs -= SETTLE_MS[rival.frame]
      rival.frame += 1
    }
    if (rival.frame >= 4) {
      rival.settling = false
      rival.frame = 0
      rival.frameMs = 0
    }
    return false
  }

  const delta = rival.dir * rival.speed * rate * dt
  if (rival.axis === 'x') {
    const next = rival.x + delta
    if (next > rival.max || next < rival.min) {
      rival.x = next > rival.max ? rival.max : rival.min
      turn(rival)
      return false
    }
    rival.x = next
    rival.facing = rival.dir > 0 ? 'right' : 'left'
  } else {
    const next = rival.y + delta
    if (next > rival.max || next < rival.min) {
      rival.y = next > rival.max ? rival.max : rival.min
      turn(rival)
      return false
    }
    rival.y = next
    rival.facing = rival.dir > 0 ? 'down' : 'up'
  }

  rival.frameMs += dt * 1000
  while (rival.frameMs >= 100) {
    rival.frameMs -= 100
    rival.frame = (rival.frame + 1) % 6
  }
  return true
}

export function bumpDock(rival: Rival): void {
  if (!rival.alive || rival.react || rival.settling) return
  if (!circleRect(rival.x, rival.y, HIT_R, PLATE.x, PLATE.y, PLATE.w, PLATE.h)) return
  if (rival.axis === 'x') rival.x += rival.dir > 0 ? -6 : 6
  else rival.y += rival.dir > 0 ? -6 : 6
  turn(rival)
}
