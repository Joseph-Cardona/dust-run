import { Sprite } from 'pixi.js'
import type { Art } from './assets.ts'
import {
  DECAL_SIZE, HIT_R, PLAYER_SPEED, ROOM_H, ROOM_W, SWEEP_PX, SWEEPS_PER_STAGE,
  circleRect, clamp, type Decal, type DecalId, type Player,
} from './spec.ts'

export function makeDecal(art: Art, id: DecalId, x: number, y: number): Decal {
  const sprite = new Sprite(art.dirt[id][0])
  sprite.position.set(x, y)
  sprite.roundPixels = true
  return { id, x, y, stage: 0, dist: 0, sweeps: 0, sprite }
}

export function fitDecal(id: DecalId, x: number, y: number): { x: number; y: number } {
  const size = DECAL_SIZE[id]
  return {
    x: clamp(Math.round(x), 2, ROOM_W - size.w - 2),
    y: clamp(Math.round(y), 28, ROOM_H - size.h - 2),
  }
}

export interface SweepPop {
  x: number
  y: number
  gone: boolean
}

export interface SweepTune {
  radius: number
  step: number
}

export function sweep(
  decals: Decal[],
  player: Player,
  dist: number,
  art: Art,
  tune: SweepTune = { radius: HIT_R, step: SWEEP_PX },
  dt = 0,
): SweepPop[] {
  const pops: SweepPop[] = []
  const stepPx = Math.max(dist, dt * PLAYER_SPEED)
  if (stepPx <= 0) return pops
  for (const decal of decals) {
    if (decal.stage >= 3) continue
    const size = DECAL_SIZE[decal.id]
    if (!circleRect(player.x, player.y, tune.radius, decal.x, decal.y, size.w, size.h)) continue
    decal.dist += stepPx
    while (decal.dist >= tune.step && decal.stage < 3) {
      decal.dist -= tune.step
      decal.sweeps += 1
      if (decal.sweeps < SWEEPS_PER_STAGE) continue
      decal.sweeps = 0
      pops.push(advance(decal, art))
    }
  }
  return pops
}

export function forceStage(decal: Decal, art: Art): SweepPop | null {
  if (decal.stage >= 3) return null
  return advance(decal, art)
}

export interface Spill {
  kind: 'coffee' | 'water'
  x: number
  y: number
  w: number
  h: number
  stage: 0 | 1 | 2 | 3
  dist: number
  sweeps: number
  sprite: Sprite
}

const SPILL_ALPHA = [1, 2 / 3, 1 / 3] as const

export function sweepSpills(
  spills: Spill[],
  player: Player,
  dist: number,
  tune: SweepTune = { radius: HIT_R, step: SWEEP_PX },
  dt = 0,
): SweepPop[] {
  const pops: SweepPop[] = []
  const stepPx = Math.max(dist, dt * PLAYER_SPEED)
  if (stepPx <= 0) return pops
  for (const spill of spills) {
    if (spill.stage >= 3) continue
    if (!circleRect(player.x, player.y, tune.radius, spill.x, spill.y, spill.w, spill.h)) continue
    spill.dist += stepPx
    while (spill.dist >= tune.step && spill.stage < 3) {
      spill.dist -= tune.step
      spill.sweeps += 1
      if (spill.sweeps < SWEEPS_PER_STAGE) continue
      spill.sweeps = 0
      pops.push(advanceSpill(spill))
    }
  }
  return pops
}

export function forceSpill(spill: Spill): SweepPop | null {
  if (spill.stage >= 3) return null
  return advanceSpill(spill)
}

function advanceSpill(spill: Spill): SweepPop {
  const next = spill.stage + 1
  if (next >= 3) {
    spill.stage = 3
    spill.sprite.visible = false
  } else {
    spill.stage = next as 1 | 2
    spill.sprite.alpha = SPILL_ALPHA[next]
  }
  return {
    x: spill.x + spill.w / 2,
    y: spill.y + spill.h / 2,
    gone: next >= 3,
  }
}

function advance(decal: Decal, art: Art): SweepPop {
  const next = decal.stage + 1
  const size = DECAL_SIZE[decal.id]
  if (next >= 3) {
    decal.stage = 3
    decal.sprite.visible = false
  } else {
    decal.stage = next as 1 | 2
    decal.sprite.texture = art.dirt[decal.id][next as 1 | 2]
  }
  return {
    x: decal.x + size.w / 2,
    y: decal.y + size.h / 2,
    gone: next >= 3,
  }
}
