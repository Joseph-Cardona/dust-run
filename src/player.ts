import { Sprite } from 'pixi.js'
import type { Art } from './assets.ts'
import {
  PLAYER_HP, PLAYER_SPEED, SPAWN, TANK_P0,
  facingFrom, type Player,
} from './spec.ts'

export function makePlayer(art: Art): Player {
  const sprite = new Sprite(art.player.p0[0])
  sprite.roundPixels = true
  return {
    x: SPAWN.x,
    y: SPAWN.y,
    hp: PLAYER_HP,
    maxHp: PLAYER_HP,
    iframe: 0,
    facing: 'down',
    frame: 0,
    frameMs: 0,
    form: 'p0',
    tank: 0,
    capacity: TANK_P0,
    coins: 0,
    bolts: 0,
    dustMs: 0,
    settling: false,
    wasMoving: false,
    bruise: 0,
    healAcc: 0,
    sprite,
  }
}

const SETTLE_MS = [100, 120, 120, 100]

/** Returns pixels traveled this step. `glide` keeps the brushes turning. */
export function stepPlayer(
  player: Player,
  dt: number,
  axisX: number,
  axisY: number,
  move: boolean,
  glide: boolean,
  speedMul: number,
): number {
  let dist = 0
  if (move && (axisX !== 0 || axisY !== 0)) {
    const speed = PLAYER_SPEED * speedMul
    dist = speed * dt
    player.x += axisX * dist
    player.y += axisY * dist
    player.facing = facingFrom(axisX, axisY, player.facing)
  }
  if (!glide) return dist
  if (dist > 0) {
    player.settling = false
    player.wasMoving = true
    player.frameMs += dt * 1000
    while (player.frameMs >= 55) {
      player.frameMs -= 55
      player.frame = (player.frame + 1) % 6
    }
    return dist
  }
  if (player.wasMoving && player.form === 'p0') {
    player.wasMoving = false
    player.settling = true
    player.frame = 0
    player.frameMs = 0
  } else {
    player.wasMoving = false
  }
  if (player.settling) {
    player.frameMs += dt * 1000
    while (player.frame < 4 && player.frameMs >= SETTLE_MS[player.frame]) {
      player.frameMs -= SETTLE_MS[player.frame]
      player.frame += 1
    }
    if (player.frame >= 4) {
      player.settling = false
      player.frame = 0
      player.frameMs = 0
    }
    return dist
  }
  player.frameMs += dt * 1000
  while (player.frameMs >= 100) {
    player.frameMs -= 100
    player.frame = (player.frame + 1) % 6
  }
  return dist
}
