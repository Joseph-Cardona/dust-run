import { Sprite, type Texture } from 'pixi.js'
import type { Art, ComboId } from './assets.ts'
import comboFile from './data/combos.json' with { type: 'json' }
import { type Facing, type Rival } from './spec.ts'

export const VEC: Record<Facing, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
}

const HIT_MS = [50, 50, 60, 80, 100]
const DEATH_MS = [50, 60, 70, 70, 70, 70, 70, 70]

const ATTACK_MS: Record<string, number[]> = {
  'dash-ram': [70, 70, 70, 70, 50, 50, 50, 50, 80, 80, 80, 80],
  'suction-pull': [80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
  'shield-parry': [60, 60, 60, 60, 60, 80, 80, 80],
}

const DASH_BOX: Record<Facing, [number, number, number, number]> = {
  right: [8, 2, 46, 30],
  left: [-14, 2, 24, 30],
  down: [2, 8, 30, 46],
  up: [2, -14, 30, 24],
}

interface ComboHit {
  hit: number
  kind: string
  contact_frame: number
  recovery: number[]
  damage_mult: number
  hitstop_ms: number
  enemy_knockback_px: number
  hitbox: Record<string, number[]>
  input_buffer?: number[]
  end_branch?: number[]
  end_root_px?: number
  screen_shake_px?: number[][]
  root_px?: number
}

interface ComboDef {
  frames_main: number
  ms: number[]
  hits: ComboHit[]
}

const COMBOS = (comboFile as { combos: Record<string, ComboDef> }).combos

export type MoveId =
  | 'brush-combo'
  | 'ram-combo'
  | 'mixed-combo'
  | 'dash-ram'
  | 'suction-pull'
  | 'shield-parry'

export interface HitEmit {
  rect: { x: number; y: number; w: number; h: number }
  mult: number
  kind: string
  knock: number
  stop: number
}

export interface CombatTick {
  hits: HitEmit[]
  pull: boolean
  chip: boolean
  rootX: number
  rootY: number
  ended: boolean
  shakeX: number
  shakeY: number
}

interface Swing {
  move: MoveId
  facing: Facing
  frame: number
  ms: number
  buffered: boolean
  did: boolean[]
  inEnd: boolean
  endAt: number
  exitRoot: number
  shakes: [number, number][]
  shakeFrom: number
  chipped: boolean
}

export function inCone(
  px: number, py: number, facing: Facing,
  x: number, y: number, radius: number,
): boolean {
  const dx = x - px
  const dy = y - py
  const dist = Math.hypot(dx, dy)
  if (dist > radius || dist < 0.001) return false
  const vec = VEC[facing]
  return (dx / dist) * vec.x + (dy / dist) * vec.y > 0.45
}

export function startReaction(rival: Rival, kind: 'hit' | 'death', px: number, py: number): void {
  if (rival.react?.kind === 'death') return
  rival.react = { kind, frame: 0, frameMs: 0, px, py, dropped: false }
  rival.settling = false
}

export function tickReaction(rival: Rival, dtMs: number): { drop: boolean; ended: 'hit' | 'death' | null; px: number; py: number } | null {
  const react = rival.react
  if (!react || dtMs <= 0) return null
  const ms = react.kind === 'hit' ? HIT_MS : DEATH_MS
  react.frameMs += dtMs
  let drop = false
  while (react.frame < ms.length && react.frameMs >= ms[react.frame]) {
    react.frameMs -= ms[react.frame]
    react.frame += 1
    if (react.kind === 'death' && react.frame === 2 && !react.dropped) {
      react.dropped = true
      drop = true
    }
  }
  if (react.frame < ms.length) return { drop, ended: null, px: 0, py: 0 }
  if (react.kind === 'death') {
    rival.react = null
    rival.alive = false
    rival.sprite.visible = false
    rival.fx.visible = false
    return { drop, ended: 'death', px: 0, py: 0 }
  }
  const px = react.px
  const py = react.py
  rival.react = null
  return { drop, ended: 'hit', px, py }
}

function isCombo(move: MoveId): move is ComboId {
  return move === 'brush-combo' || move === 'ram-combo' || move === 'mixed-combo'
}

export class Combat {
  fx: Sprite
  hold = false
  swing: Swing | null = null
  private px = 0
  private py = 0
  private emits: HitEmit[] = []
  private chipPending = false
  private endedRootX = 0
  private endedRootY = 0

  constructor(private art: Art) {
    this.fx = new Sprite()
    this.fx.roundPixels = true
    this.fx.visible = false
  }

  reset(): void {
    this.swing = null
    this.hold = false
    this.emits = []
    this.chipPending = false
    if (!this.fx.destroyed) this.fx.destroy()
    this.fx = new Sprite()
    this.fx.roundPixels = true
    this.fx.visible = false
  }

  cancel(): void {
    this.swing = null
    this.fx.visible = false
  }

  parryHot(): boolean {
    const swing = this.swing
    return swing?.move === 'shield-parry' && swing.frame >= 2 && swing.frame <= 4
  }

  /** Active attack rects. Contact frame, plus any hit this tick already stepped past. */
  boxes(): HitEmit['rect'][] {
    const out: HitEmit['rect'][] = []
    const seen = new Set<string>()
    const add = (rect: HitEmit['rect']): void => {
      const key = `${rect.x},${rect.y},${rect.w},${rect.h}`
      if (seen.has(key)) return
      seen.add(key)
      out.push(rect)
    }
    const swing = this.swing
    if (swing?.move === 'dash-ram' && swing.frame === 6) add(this.rect(DASH_BOX[swing.facing]))
    if (swing && isCombo(swing.move)) {
      for (const hit of COMBOS[swing.move].hits) {
        if (hit.contact_frame !== swing.frame) continue
        const box = hit.hitbox[swing.facing]
        if (!box || box.length < 4) continue
        add(this.rect([box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0]))
      }
    }
    for (const emit of this.emits) add(emit.rect)
    return out
  }

  /** Starts the move, or buffers the next hit when that combo is already playing. */
  press(move: MoveId, facing: Facing): boolean {
    if (this.swing) {
      if (this.swing.move !== move || !this.inBuffer(this.swing)) return false
      this.swing.buffered = true
      return true
    }
    this.swing = {
      move,
      facing,
      frame: isCombo(move) ? 1 : 0,
      ms: 0,
      buffered: false,
      did: [false, false, false, false],
      inEnd: false,
      endAt: 0,
      exitRoot: 0,
      shakes: [],
      shakeFrom: -1,
      chipped: false,
    }
    this.fx.visible = true
    return true
  }

  tick(dtMs: number, attackRate: number, x: number, y: number): CombatTick {
    const blank: CombatTick = {
      hits: [], pull: false, chip: false, rootX: 0, rootY: 0, ended: false, shakeX: 0, shakeY: 0,
    }
    if (!this.swing) return blank
    this.px = x
    this.py = y
    this.emits = []
    this.chipPending = false
    this.endedRootX = 0
    this.endedRootY = 0
    this.swing.ms += dtMs
    let guard = 0
    while (this.swing && guard++ < 12) {
      const dur = this.frameDur(attackRate)
      if (this.swing.ms < dur) break
      this.swing.ms -= dur
      this.advance()
    }
    if (!this.swing) {
      return {
        ...blank,
        hits: this.emits,
        chip: this.chipPending,
        rootX: this.endedRootX,
        rootY: this.endedRootY,
        ended: true,
      }
    }
    const shake = this.takeShake()
    return {
      hits: this.emits,
      pull: this.swing.move === 'suction-pull' && this.swing.frame >= 2 && this.swing.frame <= 7,
      chip: this.chipPending,
      rootX: 0,
      rootY: 0,
      ended: false,
      shakeX: shake[0],
      shakeY: shake[1],
    }
  }

  place(x: number, y: number, sprite: Sprite): void {
    const swing = this.swing
    if (!swing) {
      this.fx.visible = false
      return
    }
    const clip = this.clip(swing.move, swing.facing)
    const frame = Math.min(swing.frame, clip.body.length - 1)
    sprite.texture = clip.body[frame]
    sprite.visible = true
    sprite.roundPixels = true
    sprite.position.set(Math.round(x - clip.ax), Math.round(y - clip.ay))
    sprite.zIndex = y
    this.fx.texture = clip.fx[frame]
    this.fx.visible = true
    this.fx.position.copyFrom(sprite.position)
    this.fx.roundPixels = true
  }

  private inBuffer(swing: Swing): boolean {
    if (!isCombo(swing.move)) return false
    return COMBOS[swing.move].hits.some((hit) => {
      const buffer = hit.input_buffer
      return !!buffer && swing.frame >= buffer[0] && swing.frame <= buffer[1]
    })
  }

  private frameDur(rate: number): number {
    const swing = this.swing
    if (!swing) return 60
    if (isCombo(swing.move)) {
      const ms = COMBOS[swing.move].ms[swing.frame] ?? 60
      const scaled = swing.move === 'brush-combo' ? ms / Math.max(0.25, rate) : ms
      return Math.max(16, scaled)
    }
    return Math.max(16, ATTACK_MS[swing.move]?.[swing.frame] ?? 60)
  }

  private advance(): void {
    const swing = this.swing
    if (!swing) return
    if (swing.move === 'suction-pull') {
      if (swing.frame >= 9) {
        this.finish(0)
        return
      }
      if (swing.frame >= 2 && swing.frame <= 7) {
        if (this.hold) swing.frame = swing.frame === 7 ? 2 : swing.frame + 1
        else swing.frame = 8
        this.note()
        return
      }
      swing.frame += 1
      this.note()
      return
    }
    if (!isCombo(swing.move)) {
      const last = (ATTACK_MS[swing.move]?.length ?? 1) - 1
      if (swing.frame >= last) {
        this.finish(swing.move === 'dash-ram' ? 14 : 0)
        return
      }
      swing.frame += 1
      this.note()
      return
    }
    const spec = COMBOS[swing.move]
    if (swing.inEnd) {
      if (swing.frame >= swing.endAt) {
        this.finish(swing.exitRoot)
        return
      }
      swing.frame += 1
      this.note()
      return
    }
    const ending = spec.hits.find((hit) => hit.hit < 3 && hit.end_branch && hit.recovery[1] === swing.frame)
    if (ending?.end_branch) {
      if (swing.buffered) {
        swing.buffered = false
        swing.frame += 1
      } else {
        swing.frame = ending.end_branch[0]
        swing.endAt = ending.end_branch[1]
        swing.exitRoot = ending.end_root_px ?? 0
        swing.inEnd = true
      }
      this.note()
      return
    }
    if (swing.frame >= spec.frames_main - 1) {
      this.finish(spec.hits[2]?.root_px ?? 0)
      return
    }
    swing.frame += 1
    this.note()
  }

  private note(): void {
    const swing = this.swing
    if (!swing) return
    if (swing.move === 'dash-ram' && swing.frame === 6 && !swing.did[0]) {
      swing.did[0] = true
      this.emits.push({
        rect: this.rect(DASH_BOX[swing.facing]),
        mult: 1,
        kind: 'ram',
        knock: 8,
        stop: 40,
      })
    }
    if (swing.move === 'suction-pull' && swing.frame === 2 && !swing.chipped) {
      swing.chipped = true
      this.chipPending = true
    }
    if (!isCombo(swing.move)) return
    for (const hit of COMBOS[swing.move].hits) {
      if (hit.contact_frame !== swing.frame || swing.did[hit.hit]) continue
      swing.did[hit.hit] = true
      const box = hit.hitbox[swing.facing]
      if (!box || box.length < 4) continue
      this.emits.push({
        rect: this.rect([box[0], box[1], box[2], box[3]]),
        mult: hit.damage_mult,
        kind: hit.kind,
        knock: hit.enemy_knockback_px,
        stop: hit.hitstop_ms,
      })
      if (hit.screen_shake_px) {
        swing.shakes = hit.screen_shake_px.map((pair) => [pair[0] ?? 0, pair[1] ?? 0])
        swing.shakeFrom = swing.frame
      }
    }
  }

  private rect(box: [number, number, number, number]): HitEmit['rect'] {
    const left = this.px - 16
    const top = this.py - 17
    return { x: left + box[0], y: top + box[1], w: box[2] - box[0], h: box[3] - box[1] }
  }

  private takeShake(): [number, number] {
    const swing = this.swing
    if (!swing || swing.shakes.length === 0 || swing.frame <= swing.shakeFrom) return [0, 0]
    return swing.shakes.shift() ?? [0, 0]
  }

  private finish(root: number): void {
    const swing = this.swing
    if (!swing) return
    const vec = VEC[swing.facing]
    this.endedRootX = vec.x * root
    this.endedRootY = vec.y * root
    this.swing = null
    this.fx.visible = false
  }

  private clip(move: MoveId, facing: Facing): { body: Texture[]; fx: Texture[]; ax: number; ay: number } {
    if (isCombo(move)) {
      const clip = this.art.addon.combo[move][facing]
      return { body: clip.body, fx: clip.fx, ax: 48, ay: 49 }
    }
    const clip = this.art.addon.attack[move][facing]
    return { body: clip.body, fx: clip.fx, ax: 40, ay: 41 }
  }
}
