import grandfatherFile from './data/bosses/grandfather.json' with { type: 'json' }
import golemFile from './data/bosses/laundry_golem.json' with { type: 'json' }
import boilerFile from './data/bosses/old_boiler.json' with { type: 'json' }
import sentryFile from './data/bosses/sentry_prime.json' with { type: 'json' }
import { blockedAt, bodyRim, type FloorWorld } from './rooms.ts'
import { facingFrom, type Facing, type Rival } from './spec.ts'

interface BossFile {
  canvas: [number, number]
  foot: [number, number]
  rows: { row: number; anim: string; frames: number; ms: number[] }[]
}

export interface BossRow {
  anim: string
  row: number
  frames: number
  ms: number[]
}

export interface BossProfile {
  hp: number
  dmg: number
  speed: number
  xp: number
  coins: number
  bolts: number
}

export interface BossShot {
  kind: 'gear' | 'sock' | 'coal' | 'bolt' | 'foam' | 'ember' | 'chime' | 'grid'
  x: number
  y: number
  vx: number
  vy: number
  life: number
  age: number
  dmg: number
  r: number
  r0: number
  r1: number
  delay: number
  hit: boolean
  fromX: number
  fromY: number
  landX: number
  landY: number
  tick: number
  homing: boolean
  arc: boolean
  ember: boolean
  alive: boolean
}

interface BossSink {
  hits: { damage: number; x: number; y: number; stun?: number }[]
  shots: BossShot[]
  pull: boolean
}

const FILES: Record<string, BossFile> = {
  grandfather: grandfatherFile as unknown as BossFile,
  laundry_golem: golemFile as unknown as BossFile,
  old_boiler: boilerFile as unknown as BossFile,
  sentry_prime: sentryFile as unknown as BossFile,
}

const PROFILE: Record<string, BossProfile> = {
  grandfather: { hp: 160, dmg: 14, speed: 40, xp: 40, coins: 60, bolts: 2 },
  laundry_golem: { hp: 200, dmg: 16, speed: 36, xp: 50, coins: 80, bolts: 2 },
  old_boiler: { hp: 240, dmg: 18, speed: 0, xp: 60, coins: 100, bolts: 3 },
  sentry_prime: { hp: 280, dmg: 20, speed: 56, xp: 70, coins: 120, bolts: 3 },
}

/** Stairs guard on floors 1–4. Floor 5 stays head_butler. */
export const FLOOR_BOSS: Record<number, string> = {
  1: 'grandfather',
  2: 'laundry_golem',
  3: 'old_boiler',
  4: 'sentry_prime',
}

const ROWS = new Map<string, BossRow>()
for (const [breed, file] of Object.entries(FILES)) {
  for (const row of file.rows) {
    ROWS.set(`${breed}:${row.anim}`, {
      anim: row.anim,
      row: row.row,
      frames: row.frames,
      ms: row.ms,
    })
  }
}

const DOWN_ONLY: Record<string, Record<string, string>> = {
  laundry_golem: {
    attack_spin: 'attack_spin',
    phase2: 'phase2-down',
    phase3: 'phase3-down',
    death: 'death-down',
  },
  sentry_prime: {
    attack_lockdown: 'attack_lockdown-down',
    phase2: 'phase2-down',
    phase3: 'phase3-down',
    death: 'death-down',
  },
}

const ACTIVE: Record<string, [number, number]> = {
  'grandfather:attack_slam': [4, 12],
  'grandfather:attack_gears': [3, 8],
  'grandfather:attack_chime': [4, 10],
  'laundry_golem:attack_slam': [7, 11],
  'laundry_golem:attack_throw': [5, 8],
  'laundry_golem:attack_spin': [2, 13],
  'laundry_golem:attack_foam': [4, 9],
  'old_boiler:attack_steam': [4, 10],
  'old_boiler:attack_coal': [4, 9],
  'old_boiler:attack_blast': [6, 11],
  'sentry_prime:attack_laser': [5, 10],
  'sentry_prime:attack_taser': [4, 8],
  'sentry_prime:attack_bolts': [3, 7],
  'sentry_prime:attack_lockdown': [6, 10],
}

const TICK = new Set(['attack_spin', 'attack_steam', 'attack_laser'])

export function isFloorBoss(id: string): boolean {
  return id in PROFILE
}

export function floorBoss(floor: number): string | null {
  return FLOOR_BOSS[floor] ?? null
}

export function bossProfile(id: string): BossProfile | null {
  return PROFILE[id] ?? null
}

export function bossCanvas(id: string): { w: number; h: number; footX: number; footY: number } | null {
  const file = FILES[id]
  if (!file) return null
  return { w: file.canvas[0], h: file.canvas[1], footX: file.foot[0], footY: file.foot[1] }
}

export function bossRows(id: string): BossRow[] {
  const file = FILES[id]
  if (!file) return []
  return file.rows.map((row) => ({
    anim: row.anim,
    row: row.row,
    frames: row.frames,
    ms: row.ms,
  }))
}

export function clipName(breed: string, act: string, facing: Facing, phase: number): string {
  let name = act === 'intro' ? 'idle' : act
  if (name === 'idle') {
    if (breed === 'grandfather') name = phase >= 2 ? 'idle_p2' : 'idle'
    else if (phase >= 3) name = 'idle_p3'
    else if (phase >= 2) name = 'idle_p2'
  }
  const fixed = DOWN_ONLY[breed]?.[name]
  if (fixed) return fixed
  if (breed === 'laundry_golem' || breed === 'sentry_prime') {
    if (
      name === 'idle' || name === 'move' || name === 'hit'
      || name.startsWith('idle_p') || name.startsWith('attack_')
    ) return `${name}-${facing}`
  }
  return name
}

/** Continue a damaged floor boss without replaying the intro card. */
export function wakeBoss(rival: Rival): void {
  rival.phase = wantedPhase(rival)
  rival.act = 'idle'
  rival.cool = 0.3
  rival.vuln = rival.breed === 'grandfather' && rival.phase >= 2 ? 1.5 : 1
  rival.frame = 0
  rival.frameMs = 0
  rival.aim = 0
}

export function stepBoss(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  out: BossSink,
): void {
  if (rival.act === 'death') {
    playDeath(rival, dt)
    return
  }
  if (rival.act === 'intro') {
    playIntro(rival, dt)
    return
  }
  if (busy(rival.act)) {
    playBusy(rival, dt, world, player, out)
    return
  }
  const next = wantedPhase(rival)
  if (next > rival.phase) {
    rival.phase += 1
    rival.vuln = 0
    setAct(rival, phaseAct(rival.breed, rival.phase))
    return
  }
  if (rival.cool > 0) {
    rival.cool -= dt
    roam(rival, dt, world, player)
    paintVuln(rival)
    return
  }
  const dx = player.x - rival.x
  const dy = player.y - rival.y
  const dist = Math.hypot(dx, dy)
  if (rival.breed === 'laundry_golem' || rival.breed === 'sentry_prime') {
    rival.facing = facingFrom(dx, dy, rival.facing)
  }
  rival.max += 1
  setAct(rival, pickAttack(rival, dist))
  paintVuln(rival)
}

function playDeath(rival: Rival, dt: number): void {
  rival.vuln = 0
  const row = rowOf(rival.breed, clipName(rival.breed, 'death', rival.facing, rival.phase))
  if (!row || advance(rival, row, dt, false)) {
    rival.alive = false
    rival.settling = true
  }
}

function playIntro(rival: Rival, dt: number): void {
  rival.vuln = 0
  if (rival.breed === 'grandfather' || rival.breed === 'old_boiler') rival.facing = 'down'
  const row = rowOf(rival.breed, clipName(rival.breed, 'intro', rival.facing, 1))
  if (row) advance(rival, row, dt, true)
  rival.cool -= dt
  if (rival.cool > 0) return
  setAct(rival, 'idle')
  rival.cool = 0.4
  paintVuln(rival)
}

function playBusy(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
  out: BossSink,
): void {
  const row = rowOf(rival.breed, clipName(rival.breed, rival.act, rival.facing, rival.phase))
  if (!row) {
    setAct(rival, 'idle')
    rival.cool = 0.4
    paintVuln(rival)
    return
  }
  const prev = rival.frame
  const done = advance(rival, row, dt, false)
  const window = ACTIVE[`${rival.breed}:${rival.act}`]
  if (window && rival.frame >= window[0] && rival.frame <= window[1]) {
    if (rival.act === 'attack_spin') pullSpin(rival, player, dt, out)
    const entered = rival.aim === 0 && prev < window[0]
    if (entered) rival.aim = 1
    if (entered && !TICK.has(rival.act)) fireOnce(rival, world, player, out)
    if (TICK.has(rival.act)) {
      if (entered) rival.actMs = 0
      rival.actMs -= dt
      if (rival.actMs <= 0) {
        rival.actMs = 0.25
        fireTick(rival, player, out)
      }
    }
  }
  if (done) {
    const rest = rival.act === 'hit' ? 0.25 : 0.5
    setAct(rival, 'idle')
    rival.cool = rest
  }
  paintVuln(rival)
}

function roam(
  rival: Rival,
  dt: number,
  world: FloorWorld,
  player: { x: number; y: number },
): void {
  const dx = player.x - rival.x
  const dy = player.y - rival.y
  const dist = Math.hypot(dx, dy)
  if (rival.breed === 'grandfather' || rival.breed === 'old_boiler') rival.facing = 'down'
  else if (dist > 1) rival.facing = facingFrom(dx, dy, rival.facing)
  const speed = speedOf(rival)
  let moved = false
  if (speed > 0 && rival.breed === 'sentry_prime') {
    if (dist > 110) moved = stepToward(rival, world, player.x, player.y, speed, dt)
    else if (dist < 70 && dist > 1) {
      moved = stepToward(rival, world, rival.x - (dx / dist) * 80, rival.y - (dy / dist) * 80, speed, dt)
    }
  } else if (speed > 0) {
    const stop = rival.breed === 'grandfather' ? 56 : 48
    if (dist > stop) moved = stepToward(rival, world, player.x, player.y, speed, dt)
  }
  setAct(rival, moved ? 'move' : 'idle')
  const row = rowOf(rival.breed, clipName(rival.breed, rival.act, rival.facing, rival.phase))
  if (row) advance(rival, row, dt, true)
}

function fireOnce(
  rival: Rival,
  world: FloorWorld,
  player: { x: number; y: number },
  out: BossSink,
): void {
  const act = rival.act
  if (act === 'attack_slam' && rival.breed === 'grandfather') {
    disc(out, player, rival.x, rival.y, 48, 14, 0)
    return
  }
  if (act === 'attack_slam') {
    const face = facingVec(rival.facing)
    const dx = player.x - rival.x
    const dy = player.y - rival.y
    const dist = Math.hypot(dx, dy)
    if (dist <= 40 + bodyRim(dx, dy) && dx * face.x + dy * face.y > 0) {
      out.hits.push({ damage: 14, x: player.x, y: player.y })
    }
    return
  }
  if (act === 'attack_gears') {
    const face = facingVec(rival.facing)
    for (const turn of [-0.4, 0, 0.4]) {
      const dir = rot(face, turn)
      out.shots.push(makeShot('gear', rival.x + dir.x * 18, rival.y - 24 + dir.y * 8, dir.x * 120, dir.y * 120, 8, 8, 1.3))
    }
    return
  }
  if (act === 'attack_chime') {
    for (let i = 0; i < 3; i++) {
      const ring = makeShot('chime', rival.x, rival.y - 16, 0, 0, 10, 8, 0.55)
      ring.delay = i * 0.16
      ring.r0 = 8
      ring.r1 = 72
      ring.r = 8
      out.shots.push(ring)
    }
    return
  }
  if (act === 'attack_throw') {
    const dx = player.x - rival.x
    const dy = player.y - (rival.y - 28)
    const len = Math.hypot(dx, dy) || 1
    out.shots.push(makeShot('sock', rival.x + (dx / len) * 16, rival.y - 28, (dx / len) * 140, (dy / len) * 140, 8, 8, 1.1))
    return
  }
  if (act === 'attack_foam') {
    const face = facingVec(rival.facing)
    const puddle = makeShot('foam', rival.x + face.x * 36, rival.y + face.y * 16, 0, 0, 4, 18, 5)
    puddle.tick = 0.6
    out.shots.push(puddle)
    return
  }
  if (act === 'attack_coal') {
    for (const ox of [-28, 0, 28]) {
      const coal = makeShot('coal', rival.x, rival.y - 40, 0, 0, 14, 12, 0.55)
      coal.arc = true
      coal.fromX = rival.x
      coal.fromY = rival.y - 40
      coal.landX = player.x + ox
      coal.landY = player.y
      coal.ember = rival.phase >= 3
      out.shots.push(coal)
    }
    return
  }
  if (act === 'attack_blast') {
    disc(out, player, rival.x, rival.y, 48, 16, 0)
    return
  }
  if (act === 'attack_taser') {
    const face = facingVec(rival.facing)
    const nx = rival.x + face.x * 24
    const ny = rival.y + face.y * 24
    if (!blockedAt(world, nx, rival.y, face.x, 0)) rival.x = nx
    if (!blockedAt(world, rival.x, ny, 0, face.y)) rival.y = ny
    disc(out, player, rival.x, rival.y, 18, 16, 0.4)
    return
  }
  if (act === 'attack_bolts') {
    const face = facingVec(rival.facing)
    for (const side of [-0.7, 0.7]) {
      const dir = rot(face, side)
      const bolt = makeShot('bolt', rival.x + dir.x * 14, rival.y - 30, dir.x * 70, dir.y * 70, 10, 8, 2.4)
      bolt.homing = true
      out.shots.push(bolt)
    }
    return
  }
  if (act === 'attack_lockdown') {
    const dx = player.x - rival.x
    const dy = player.y - rival.y
    const near = Math.abs(dy) < 12 || Math.abs(dy - 28) < 12 || Math.abs(dy + 28) < 12
    if (Math.abs(dx) < 110 && near) out.hits.push({ damage: 14, x: player.x, y: player.y })
    for (const oy of [-28, 0, 28]) {
      const line = makeShot('grid', rival.x, rival.y + oy, 0, 0, 0, 8, 0.45)
      out.shots.push(line)
    }
  }
}

function fireTick(rival: Rival, player: { x: number; y: number }, out: BossSink): void {
  if (rival.act === 'attack_spin') {
    const dx = player.x - rival.x
    const dy = player.y - rival.y
    if (Math.hypot(dx, dy) <= 40 + bodyRim(dx, dy)) {
      out.hits.push({ damage: 6, x: player.x, y: player.y })
    }
    return
  }
  if (rival.act === 'attack_steam') {
    const dx = player.x - rival.x
    const dy = player.y - rival.y
    if (Math.abs(dx) > 8 && Math.abs(dx) < 56 + bodyRim(dx, dy) && Math.abs(dy) < 16 + bodyRim(dx, dy)) {
      out.hits.push({ damage: 12, x: player.x, y: player.y })
    }
    return
  }
  if (rival.act === 'attack_laser') {
    const face = facingVec(rival.facing)
    const dx = player.x - rival.x
    const dy = player.y - rival.y
    const dist = Math.hypot(dx, dy)
    const dot = dist > 0 ? (dx * face.x + dy * face.y) / dist : 1
    if (dist < 90 + bodyRim(dx, dy) && dot > Math.cos(24 * Math.PI / 180)) {
      out.hits.push({ damage: 12, x: player.x, y: player.y })
    }
  }
}

function pullSpin(rival: Rival, player: { x: number; y: number }, dt: number, out: BossSink): void {
  const dx = rival.x - player.x
  const dy = rival.y - player.y
  const dist = Math.hypot(dx, dy)
  if (dist > 48 || dist < 1) return
  player.x += (dx / dist) * 70 * dt
  player.y += (dy / dist) * 70 * dt
  out.pull = true
}

function disc(
  out: BossSink,
  player: { x: number; y: number },
  x: number,
  y: number,
  radius: number,
  damage: number,
  stun: number,
): void {
  const dx = player.x - x
  const dy = player.y - y
  if (Math.hypot(dx, dy) > radius + bodyRim(dx, dy)) return
  out.hits.push({ damage, x: player.x, y: player.y, stun: stun > 0 ? stun : undefined })
}

function makeShot(
  kind: BossShot['kind'],
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  radius: number,
  life: number,
): BossShot {
  return {
    kind,
    x,
    y,
    vx,
    vy,
    life,
    age: 0,
    dmg,
    r: radius,
    r0: radius,
    r1: radius,
    delay: 0,
    hit: false,
    fromX: x,
    fromY: y,
    landX: x,
    landY: y,
    tick: 1,
    homing: false,
    arc: false,
    ember: false,
    alive: true,
  }
}

function pickAttack(rival: Rival, dist: number): string {
  const n = rival.max
  const phase = rival.phase
  if (rival.breed === 'grandfather') {
    if (phase >= 2 && n % 3 === 0) return 'attack_chime'
    return dist < 56 ? 'attack_slam' : 'attack_gears'
  }
  if (rival.breed === 'laundry_golem') {
    if (phase >= 3) return ['attack_spin', 'attack_foam', 'attack_throw'][n % 3] ?? 'attack_throw'
    if (phase >= 2 && n % 3 === 0) return 'attack_spin'
    return dist < 48 ? 'attack_slam' : 'attack_throw'
  }
  if (rival.breed === 'old_boiler') {
    if (phase >= 3) return ['attack_blast', 'attack_coal', 'attack_steam'][n % 3] ?? 'attack_steam'
    if (phase >= 2 && n % 3 === 0) return 'attack_blast'
    return n % 2 === 0 ? 'attack_steam' : 'attack_coal'
  }
  if (phase >= 3) return ['attack_lockdown', 'attack_bolts', 'attack_taser'][n % 3] ?? 'attack_taser'
  if (phase >= 2 && n % 3 === 0) return 'attack_bolts'
  return dist < 52 ? 'attack_taser' : 'attack_laser'
}

function wantedPhase(rival: Rival): number {
  const ratio = rival.maxHp <= 0 ? 1 : rival.hp / rival.maxHp
  if (rival.breed === 'grandfather') return ratio < 0.5 ? 2 : 1
  if (ratio < 0.3) return 3
  if (ratio < 0.6) return 2
  return 1
}

function phaseAct(breed: string, phase: number): string {
  if (breed === 'grandfather') return 'phase'
  return phase >= 3 ? 'phase3' : 'phase2'
}

function speedOf(rival: Rival): number {
  const base = PROFILE[rival.breed]?.speed ?? 0
  if (rival.breed === 'grandfather') return rival.phase >= 2 ? base * 1.25 : base
  if (rival.phase >= 3) return base * 1.3
  return base
}

function paintVuln(rival: Rival): void {
  if (
    rival.act === 'intro' || rival.act === 'death'
    || rival.act === 'phase' || rival.act === 'phase2' || rival.act === 'phase3'
  ) {
    rival.vuln = 0
    return
  }
  if (rival.breed === 'sentry_prime' && rival.act === 'attack_bolts') {
    rival.vuln = 0.5
    return
  }
  rival.vuln = rival.breed === 'grandfather' && rival.phase >= 2 ? 1.5 : 1
}

function busy(act: string): boolean {
  return act === 'hit' || act === 'phase' || act === 'phase2' || act === 'phase3' || act.startsWith('attack_')
}

function setAct(rival: Rival, act: string): void {
  if (rival.act === act) return
  rival.act = act
  rival.frame = 0
  rival.frameMs = 0
  rival.aim = 0
  rival.actMs = 0.25
}

function advance(rival: Rival, row: BossRow, dt: number, loop: boolean): boolean {
  const last = Math.max(0, row.frames - 1)
  const ms = row.ms[Math.min(rival.frame, Math.max(0, row.ms.length - 1))] ?? 80
  rival.frameMs += dt * 1000
  if (rival.frameMs < ms) return false
  if (rival.frame >= last) {
    rival.frame = loop ? 0 : last
    rival.frameMs = loop ? 0 : ms
    return !loop
  }
  rival.frameMs -= ms
  rival.frame += 1
  return false
}

function rowOf(breed: string, anim: string): BossRow | null {
  return ROWS.get(`${breed}:${anim}`) ?? null
}

function stepToward(
  rival: Rival,
  world: FloorWorld,
  tx: number,
  ty: number,
  speed: number,
  dt: number,
): boolean {
  const dx = tx - rival.x
  const dy = ty - rival.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return false
  const step = Math.min(speed * dt, len)
  const nx = rival.x + (dx / len) * step
  const ny = rival.y + (dy / len) * step
  let moved = false
  if (!blockedAt(world, nx, rival.y, nx - rival.x, 0)) {
    rival.x = nx
    moved = true
  }
  if (!blockedAt(world, rival.x, ny, 0, ny - rival.y)) {
    rival.y = ny
    moved = true
  }
  return moved
}

function facingVec(facing: Facing): { x: number; y: number } {
  if (facing === 'left') return { x: -1, y: 0 }
  if (facing === 'right') return { x: 1, y: 0 }
  if (facing === 'up') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

function rot(v: { x: number; y: number }, angle: number): { x: number; y: number } {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}
