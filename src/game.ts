import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { audio } from './audio.ts'
import { MAP_KINDS, type Art, type BossArt, type FoeSheet, type MapState } from './assets.ts'
import { clipName, isFloorBoss, wakeBoss, type BossShot } from './bosses.ts'
import {
  Combat, inCone, startReaction, tickReaction, VEC,
  type HitEmit,
} from './combat.ts'
import { forceSpill, forceStage, makeDecal, sweep, sweepSpills, type Spill } from './dirt.ts'
import { TOAST_FLIGHT, floorPixels, placeFoe, settleFoe, spawnRoom, stepFoes } from './foes.ts'
import { textSprite } from './font.ts'
import { Fx } from './fx.ts'
import { Hud, type MapCell, type MapKind, type MapLink } from './hud.ts'
import { LevelUp } from './levelup.ts'
import { HUB_PERKS, perkRank, playOptions, StartMenu, type MenuArt, type MenuBack, type MenuPage } from './menu.ts'
import { bootFloor, MANSION_TILE, type MansionRoom, type Side } from './mansion.ts'
import { mountMansion, slidePlayer, type Inside, type MansionTiles } from './mansion-view.ts'
import { loadMeta, saveMeta, type Meta } from './meta.ts'
import { clearRun, loadRun, saveRun, hasSavedRun, type PuddleSnap, type RunFile } from './save.ts'
import { makePlayer, stepPlayer } from './player.ts'
import { BODY_RX, BODY_RY, blockedAt, bodyOnGate, bodyRim, nearProp, useKey, type FloorWorld, type Gate } from './rooms.ts'
import {
  clampRoom, floorSpec, gateInRoom, hostile, neighborRooms, roomAt, roomMembers, roomTileRect, Run, waveCount,
} from './run.ts'
import {
  COIN_VALUE, DECAL_IDS, DECAL_SIZE, DUST_AT, DUST_EVERY,
  HIT_R, IFRAME, PICKUP_BOX, PICKUP_R, PIVOT, SWEEP_PX,
  VIEW_H, VIEW_W, worldSize,
  clamp, type DecalId, type Facing, type Pickup, type PickupKind,
  type Player, type Rival, type State,
} from './spec.ts'
import { Progress, type Rarity } from './upgrades.ts'

function axis(keys: Set<string>): { x: number; y: number } {
  let x = 0
  let y = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1
  const len = Math.hypot(x, y)
  if (len === 0) return { x: 0, y: 0 }
  return { x: x / len, y: y / len }
}

function mapKind(room: MansionRoom): MapKind {
  if (room.theme === 'hallway' || room.role == null) return 'hall'
  for (const kind of MAP_KINDS) {
    if (room.role === kind) return kind
  }
  return 'combat'
}

function doorAt(rooms: MansionRoom[], index: number, gx: number, gy: number, side: Side): boolean {
  const room = rooms[index]
  const cx = gx - room.x
  const cy = gy - room.y
  for (const door of room.doors) {
    if (door.cx === cx && door.cy === cy && door.side === side) return true
  }
  return false
}

function glide(current: number, target: number, vel: number, dt: number): { value: number; vel: number } {
  const omega = 2 / 0.28
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel + omega * change) * dt
  const nextVel = (vel - omega * temp) * exp
  return { value: target + (change + temp) * exp, vel: nextVel }
}

function blink(iframe: number): number {
  if (iframe <= 0) return 1
  return Math.floor(iframe / 0.08) % 2 === 0 ? 0.4 : 1
}

function anchored(breed: string): boolean {
  return breed === 'tin_soldier' || breed === 'rogue_mop' || breed === 'snap_trap' || breed === 'toaster'
}

const FLOOR_MUSIC = [
  '',
  'music/floor1_clock_hall',
  'music/floor2_laundry',
  'music/floor3_boiler_basement',
  'music/floor4_security_wing',
  'music/floor5_butlers_quarters',
]

const CUE: Record<string, string> = {
  'snap_trap:snap': 'enemies/snap_trap_snap',
  'rogue_mop:arc': 'enemies/rogue_mop_wet_slap',
  'toaster:wind': 'enemies/toaster_turret_toast_pop',
  'toaster:toast': 'enemies/toaster_turret_fire',
  'tin_soldier:cork': 'enemies/tin_soldier_clank',
  'sheet_ghost:rise': 'enemies/sheet_ghost_moan',
  'sheet_ghost:lunge': 'enemies/sheet_ghost_swish',
  'vacuum_brute:wind': 'enemies/vacuum_brute_roar',
  'grandfather:attack_slam': 'bosses/grandfather_toll_slam',
  'grandfather:attack_gears': 'bosses/grandfather_gear_spit',
  'grandfather:attack_chime': 'bosses/grandfather_midnight_chime',
  'laundry_golem:attack_slam': 'bosses/laundry_golem_slam',
  'laundry_golem:attack_throw': 'bosses/laundry_golem_sock_shot',
  'laundry_golem:attack_foam': 'bosses/laundry_golem_foam_belch',
  'laundry_golem:attack_spin': 'bosses/laundry_golem_spin_cycle',
  'old_boiler:attack_coal': 'bosses/old_boiler_coal_lob',
  'old_boiler:attack_blast': 'bosses/old_boiler_pressure_blast',
  'old_boiler:attack_steam': 'bosses/old_boiler_steam_vent',
  'sentry_prime:attack_bolts': 'bosses/sentry_prime_homing_bolts',
  'sentry_prime:attack_laser': 'bosses/sentry_prime_laser_sweep',
  'sentry_prime:attack_lockdown': 'bosses/sentry_prime_lockdown_grid',
  'sentry_prime:attack_taser': 'bosses/sentry_prime_taser_lunge',
  'head_butler:spin': 'bosses/head_butler_spin',
  'head_butler:slam': 'bosses/head_butler_slam',
  'head_butler:summon': 'bosses/head_butler_minion_summon',
}

function bossMusic(rival: Rival): string {
  if (rival.breed === 'head_butler') {
    const ratio = rival.maxHp > 0 ? rival.hp / rival.maxHp : 1
    const phase = ratio < 0.3 ? 3 : ratio < 0.6 ? 2 : 1
    return `music/boss_head_butler_phase${phase}`
  }
  if (rival.breed === 'grandfather') return 'music/boss_grandfather'
  if (rival.breed === 'laundry_golem') return 'music/boss_laundry_golem'
  if (rival.breed === 'old_boiler') return 'music/boss_old_boiler'
  if (rival.breed === 'sentry_prime') return 'music/boss_sentry_prime'
  return ''
}

function gateKey(gate: Gate): string {
  return `${gate.side}:${gate.tiles.join('.')}`
}

const CLEAN_HEAL = 10
const DEATH_MS = [60, 50, 50, 60, 60, 60, 70, 70, 80, 90, 100, 110, 120, 140, 160, 200, 240, 400]
const DEATH_LEN = 2120

function deathFrame(elapsed: number): number {
  let left = elapsed
  for (let i = 0; i < DEATH_MS.length; i++) {
    const ms = DEATH_MS[i] ?? 0
    if (left < ms) return i
    left -= ms
  }
  return DEATH_MS.length - 1
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isSettingsNudge(code: string): boolean {
  return code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown'
    || code === 'KeyA' || code === 'KeyD' || code === 'KeyW' || code === 'KeyS'
}



function clampRival(rival: Rival): void {
  if (rival.hang) return
  rival.x = clamp(rival.x, BODY_RX, worldSize.w - BODY_RX)
  rival.y = clamp(rival.y, BODY_RY, worldSize.h - BODY_RY)
}

function bodiesOverlap(
  rect: { x: number; y: number; w: number; h: number },
  rival: Rival,
): boolean {
  const reach = rival.plain ? rival.reach : 16
  const rx = rival.x - reach
  const ry = rival.plain ? rival.y - reach * 2 : rival.y - 17
  const rw = reach * 2
  const rh = rival.plain ? reach * 2 : 32
  return rect.x < rx + rw && rect.x + rect.w > rx && rect.y < ry + rh && rect.y + rect.h > ry
}

const SHOP_PRICE: Record<Rarity, number> = { common: 25, rare: 50, epic: 90, legendary: 150 }

export class Game {
  private readonly world = new Container()
  private readonly hud: Hud
  private readonly levelup: LevelUp
  private readonly combat: Combat
  private readonly keys = new Set<string>()
  private readonly edges = new Set<string>()
  private progress!: Progress
  private fx!: Fx
  private state!: State
  private flashG!: Graphics
  private readonly washG = new Graphics()
  private dirtLayer!: Container
  private pickLayer!: Container
  private shake = 0
  private hitStop = 0
  private washA = 0
  private washColor = 0xffffff
  private lookX = 0
  private lookY = 0
  private lookVX = 0
  private lookVY = 0
  private scriptX = 0
  private scriptY = 0
  private viewW = VIEW_W
  private viewH = VIEW_H
  private mansion: FloorWorld | null = null
  private readonly doorSprites = new Map<Gate, Sprite>()
  private baked: Texture | null = null
  private playerShadow!: Sprite
  private deathFx!: Sprite
  private debugLayer!: Container
  private insides: Inside[] = []
  private readonly heard = new WeakMap<Rival, string>()
  private onGate = false
  private hopAt = 0
  private marchAt = 0
  private musicPhase = 0
  private run = new Run()
  private meta: Meta
  private actors!: Container
  private bars: Graphics[] = []
  private corks: Sprite[] = []
  private toasts: Sprite[] = []
  private readonly floats: { sprite: Sprite; life: number }[] = []
  private mapKey = ''
  private menuBack: MenuBack = 'title'
  private titleLaid = false
  private puddles: Spill[] = []
  private readonly menu: StartMenu
  private bossShots: BossShot[] = []
  private bossSprites: Sprite[] = []
  private bossChest: { x: number; y: number; open: boolean; sprite: Sprite } | null = null
  private bossShadow: Graphics | null = null
  private readonly bossCard: Sprite
  private readonly bossBar: Container
  private readonly bossBarBody: Sprite
  private readonly bossBarName: Sprite
  private readonly bossBarGems: Sprite[]
  private stun = 0

  constructor(
    stage: Container,
    private art: Art,
    private tiles: MansionTiles,
    private foeArt: Record<string, Texture>,
    private bossArt: BossArt,
    menuArt: MenuArt,
  ) {
    this.meta = loadMeta()
    this.hud = new Hud(art)
    this.hud.onResults = {
      again: () => this.newRun(true),
      home: () => this.newRun(false),
    }
    this.levelup = new LevelUp(art)
    this.combat = new Combat(art)
    this.menu = new StartMenu(art, menuArt)
    this.bossCard = new Sprite(Texture.EMPTY)
    this.bossCard.visible = false
    this.bossCard.eventMode = 'none'
    this.bossCard.roundPixels = true
    this.bossBar = new Container()
    this.bossBar.visible = false
    this.bossBar.eventMode = 'none'
    this.bossBar.pivot.set(94, 30)
    this.bossBarBody = new Sprite(Texture.EMPTY)
    this.bossBarBody.position.set(1, 1)
    this.bossBarBody.roundPixels = true
    this.bossBarBody.eventMode = 'none'
    this.bossBarName = new Sprite(Texture.EMPTY)
    this.bossBarName.position.set(4, 0)
    this.bossBarName.roundPixels = true
    this.bossBarName.eventMode = 'none'
    this.bossBarGems = [0, 1, 2].map((slot) => {
      const gem = new Sprite(Texture.EMPTY)
      gem.position.set(172 - slot * 10, 2)
      gem.roundPixels = true
      gem.eventMode = 'none'
      return gem
    })
    this.bossBar.addChild(this.bossBarBody, this.bossBarName, ...this.bossBarGems)
    this.hud.root.addChild(this.bossCard, this.bossBar)
    this.levelup.hooks = {
      take: (index) => this.onTake(index),
      skip: () => this.onSkip(),
      reroll: () => this.onReroll(),
      repair: () => this.repair(),
    }
    this.menu.hooks = {
      go: (page, back) => this.openMenu(page, back),
      buy: (index) => this.hubBuyIndex(index),
      toggleForm: () => this.toggleForm(),
      start: () => this.startRun(),
      hasRun: () => hasSavedRun(),
      continue: () => this.continueRun(),
      resume: () => {
        this.keys.clear()
        this.state.mode = 'play'
        this.menu.root.visible = false
        this.hud.root.visible = true
        audio.ui('unpause')
      },
      quit: () => this.quitToTitle(),
      abandon: () => {
        this.run.won = false
        this.bank()
        this.newRun(false)
        this.menu.sync('title', this.meta, 'title')
      },
    }
    stage.addChild(this.world, this.washG, this.hud.root, this.levelup.root, this.menu.root)
    addEventListener('keydown', (event) => this.onKey(event))
    addEventListener('pointerdown', () => audio.wake())
    addEventListener('keyup', (event) => this.keys.delete(event.code))
    this.mount()
    this.hud.root.visible = false
    this.titleLaid = this.state.mode === 'title'
  }

  /** Title page uses a tight 320×180 integer scale. Play keeps the zoom-out. */
  titleFull(): boolean {
    return this.state.mode === 'title'
  }

  setView(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    this.hud.setView(w, h)
    this.levelup.setView(w, h)
    this.menu.setView(w, h)
  }

  update(dtMs: number): void {
    const state = this.state
    if (state.mode === 'down') {
      this.run.downMs -= dtMs
      if (this.run.downMs <= 0) {
        this.bank()
        state.mode = 'results'
      }
    }
    if (this.run.bannerMs > 0) this.run.bannerMs = Math.max(0, this.run.bannerMs - dtMs)
    if (this.run.cardMs > 0) this.run.cardMs = Math.max(0, this.run.cardMs - dtMs)
    const title = state.mode === 'title'
    if (title !== this.titleLaid) {
      this.titleLaid = title
      dispatchEvent(new Event('resize'))
    }
    if (state.mode === 'play' && this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dtMs)
    if (
      this.hitStop === 0 && this.progress.pending > 0 && state.mode === 'play'
      && state.player.hp > 0 && !this.combat.swing
    ) this.openLevel(true)
    const menuOn = state.mode === 'title' || state.mode === 'hub' || state.mode === 'settings'
      || state.mode === 'brief' || state.mode === 'pause'
    this.menu.root.visible = menuOn
    this.hud.root.visible = !menuOn
    if (
      state.mode === 'title' || state.mode === 'hub' || state.mode === 'settings'
      || state.mode === 'brief' || state.mode === 'pause'
    ) this.menu.sync(state.mode, this.meta, this.menuBack, this.runCard())
    const paused = state.mode === 'levelup' || state.mode === 'shop' || menuOn
      || state.mode === 'results' || state.mode === 'down'
    const frozen = !paused && this.hitStop > 0
    const simMs = paused || frozen ? 0 : Math.min(dtMs, 50)
    if (state.mode === 'play' && simMs > 0) this.run.timeMs += simMs
    const dt = simMs / 1000
    const player = state.player
    if (state.mode === 'levelup' || state.mode === 'shop') this.levelup.update(dtMs)
    if (state.mode === 'play' && this.run.mop > 0) this.run.mop = Math.max(0, this.run.mop - dt)

    player.iframe = Math.max(0, player.iframe - dt)
    for (const rival of state.rivals) rival.iframe = Math.max(0, rival.iframe - dt)

    const moving = state.mode === 'play'
    const stick = axis(this.keys)
    const stats = this.progress.stats

    if (!paused && moving) {
      if (this.stun > 0) this.stun = Math.max(0, this.stun - dt)
      if (this.stun <= 0) this.readAttacks()
      const prevX = player.x
      const prevY = player.y
      let speedMul = this.progress.speedMul()
      let ax = stick.x
      let ay = stick.y
      if (this.stun > 0) {
        ax = 0
        ay = 0
      }
      if (moving && this.run.mop > 0) {
        if (ax === 0 && ay === 0) {
          ax = this.run.vx
          ay = this.run.vy
          speedMul *= 0.45
        } else speedMul *= 0.7
      }
      if (moving && (stick.x !== 0 || stick.y !== 0)) {
        this.run.vx = stick.x
        this.run.vy = stick.y
      }
      const dist = stepPlayer(player, dt, ax, ay, moving, true, speedMul)
      if (moving) this.slide(player, prevX, prevY)

      const swing = this.combat.tick(simMs, stats.attackRate, player.x, player.y)
      this.scriptX = swing.shakeX
      this.scriptY = swing.shakeY
      if (swing.rootX !== 0 || swing.rootY !== 0) {
        const rootX = player.x
        const rootY = player.y
        player.x += swing.rootX
        player.y += swing.rootY
        this.slide(player, rootX, rootY)
      }
      if (swing.ended) {
        player.frame = 0
        player.frameMs = 0
        player.settling = false
        player.wasMoving = false
      }
      for (const hit of swing.hits) this.applyHit(hit)
      if (swing.chip) this.suctionChip()
      if (swing.pull) this.vacuum(30 + stats.cleanWidth + stats.pullRadius)

      for (const rival of state.rivals) {
        const react = tickReaction(rival, simMs)
        if (react?.drop) this.dropLoot(rival)
        if (react?.ended === 'hit') {
          this.shiftSoldier(rival, react.px, react.py)
          clampRival(rival)
          if (rival.hp <= 0) this.beginDeath(rival, 0, 0)
        }
      }

      if (moving && this.mansion) {
        const holdX = player.x
        const holdY = player.y
        const stepped = stepFoes(state.rivals, dt, this.mansion, player, this.art, this.foeArt)
        if (stepped.pull) this.slide(player, holdX, holdY)
        this.applyFoeHits(stepped.hits)
        for (const shot of stepped.shots) this.bossShots.push(shot)
        this.finishBosses()
        this.tickBossShots(dt)
        this.tickChest()
        for (const foe of stepped.summons) this.addFoe(foe)
        if (stepped.slow > 0) this.run.mop = Math.max(this.run.mop, stepped.slow)
        for (const wet of stepped.wet) this.spillAt('57c', wet.x, wet.y, 1)
        const ramX = player.x
        const ramY = player.y
        this.separate()
        this.slide(player, ramX, ramY)
        for (const rival of state.rivals) {
          clampRival(rival)
          if (rival.alive && !rival.hang && rival.breed !== 'dust_bunny' && rival.act !== 'death' && rival.act !== 'intro') {
            settleFoe(this.mansion, rival, state.rivals)
          }
        }
        this.visit(true)
        this.cueFoes()
        const pops = sweep(state.decals, player, dist, this.art, {
          radius: HIT_R + stats.cleanWidth,
          step: Math.max(4, SWEEP_PX / stats.dirtRate),
        }, dt)
        for (const pop of pops) this.tookClean(pop)
        const spills = sweepSpills(this.puddles, player, dist, {
          radius: HIT_R + stats.cleanWidth,
          step: Math.max(4, SWEEP_PX / stats.dirtRate),
        }, dt)
        for (const pop of spills) this.tookClean(pop)
        this.collect()
        this.emitDust(player, dist > 0, simMs, PIVOT[player.form].x, PIVOT[player.form].y)
        const pulse = this.progress.tick(dt)
        if (player.hp > 0) {
          player.healAcc += stats.regen * dt
          while (player.healAcc >= 1 && player.hp < player.maxHp) {
            player.hp += 1
            player.healAcc -= 1
          }
        }
        if (pulse.whirl && stats.whirl) this.pulseDamage(stats.whirl.radius, stats.whirlHit)
        if (pulse.cyclone && stats.cyclone) {
          this.pulseDamage(stats.cyclone.radius, stats.cycloneHit)
          this.pulseClean(stats.cyclone.radius)
        }
        if (pulse.drone && stats.drone) this.pulseFetch(stats.drone.radius)
      } else {
        this.progress.tick(dt)
      }
    } else if (!paused) {
      this.scriptX = 0
      this.scriptY = 0
    } else if (menuOn) {
      this.visit(false)
    }

    state.flash = Math.max(0, state.flash - dt)
    this.syncActors()
    this.animatePickups(simMs)
    this.fx.update(simMs)
    this.tickFloats(simMs)

    this.flashG.clear()
    if (playOptions.flash && state.flash > 0) {
      this.flashG.circle(player.x, player.y, 18).fill({ color: 0xffffff, alpha: 0.9 })
    }

    const driving = moving && !paused && (stick.x !== 0 || stick.y !== 0) && !this.combat.swing
    const reach = 22
    const leadX = driving ? stick.x * reach : 0
    const leadY = driving ? stick.y * reach : 0
    const leanedX = glide(this.lookX, leadX, this.lookVX, simMs / 1000)
    const leanedY = glide(this.lookY, leadY, this.lookVY, simMs / 1000)
    this.lookX = leanedX.value
    this.lookY = leanedY.value
    this.lookVX = leanedX.vel
    this.lookVY = leanedY.vel
    if (!frozen && !paused) this.shake = Math.max(0, this.shake - Math.min(dtMs, 50) * 0.018)
    const camX = clamp(
      Math.round(player.x) - Math.round(this.viewW / 2) + Math.round(this.lookX),
      0,
      Math.max(0, worldSize.w - this.viewW),
    )
    const camY = clamp(
      Math.round(player.y) - Math.round(this.viewH / 2) + Math.round(this.lookY),
      0,
      Math.max(0, worldSize.h - this.viewH),
    )
    const jolt = this.shake > 0.2
    const ox = (jolt ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0) + this.scriptX
    const oy = (jolt ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0) + this.scriptY
    this.world.position.set(-camX + ox, -camY + oy)

    this.washG.clear()
    if (this.washA > 0) {
      this.washG.rect(0, 0, this.viewW, this.viewH).fill({ color: this.washColor, alpha: this.washA })
      if (!frozen && !paused) this.washA = Math.max(0, this.washA - Math.min(dtMs, 50) * 0.0025)
    }

    const banner = this.bannerText()
    this.hud.update(
      Math.max(0, player.hp),
      player.maxHp,
      player.coins,
      player.bolts,
      this.hintText(),
      this.progress.level,
      this.progress.xp,
      this.progress.need(),
      banner.title,
      banner.sub,
    )
    this.paintMap()
    this.hud.showResults(state.mode === 'results' ? this.resultsInfo() : null)
    this.syncAudio(driving)
    this.edges.clear()
  }

  private slide(player: Player, prevX: number, prevY: number): void {
    const world = this.mansion
    if (!world) return
    const next = slidePlayer(world, this.doorSprites, this.tiles, player.x, player.y, prevX, prevY)
    if (this.run.hasKey) {
      const gate = useKey(world, next.x, next.y)
      if (gate) {
        this.run.hasKey = false
        const sprite = this.doorSprites.get(gate)
        if (sprite) sprite.texture = this.tiles.door(gate.side, 'open')
        audio.sfx('world/door_open')
      }
    }
    const held = this.run.locked >= 0 ? clampRoom(world, this.run.locked, next.x, next.y) : next
    player.x = held.x
    player.y = held.y
  }

  private mount(keep = false): void {
    for (const item of this.floats) {
      const texture = item.sprite.texture
      item.sprite.destroy()
      texture.destroy(true)
    }
    this.floats.length = 0
    this.bossShots = []
    this.bossSprites = []
    this.bossChest = null
    this.bossShadow = null
    this.onGate = false
    this.hopAt = 0
    this.marchAt = 0
    this.musicPhase = 0
    this.stun = 0
    this.bossCard.visible = false
    this.bossBar.visible = false
    const kept = keep && this.state ? {
      hp: this.state.player.hp,
      coins: this.state.player.coins,
      bolts: this.state.player.bolts,
      tank: this.state.player.tank,
      form: this.state.player.form,
      maxHp: this.state.player.maxHp,
    } : null
    for (const child of this.world.removeChildren()) child.destroy({ children: true })
    this.doorSprites.clear()
    this.baked?.destroy(true)
    this.baked = null
    this.fx = new Fx(this.art)
    this.combat.reset()
    this.levelup.hide()
    if (!keep) this.progress = new Progress()
    this.keys.clear()
    this.edges.clear()
    this.dirtLayer = new Container()
    this.pickLayer = new Container()
    const actors = new Container()
    actors.sortableChildren = true
    this.flashG = new Graphics()

    const boot = kept ? { floor: this.run.floor, seed: this.run.seed } : bootFloor()
    const view = mountMansion(this.world, actors, this.tiles, boot.floor, boot.seed)
    this.actors = actors
    this.mansion = view.world
    this.baked = view.texture
    this.playerShadow = new Sprite(Texture.EMPTY)
    this.playerShadow.visible = false
    this.playerShadow.roundPixels = true
    this.playerShadow.eventMode = 'none'
    for (const [gate, sprite] of view.doors) this.doorSprites.set(gate, sprite)
    this.debugLayer = new Container()
    this.debugLayer.eventMode = 'none'
    this.bars = []
    this.corks = []
    this.toasts = []
    this.mapKey = ''
    this.floats.length = 0
    view.cast.addChild(this.dirtLayer)
    this.bossShadow = new Graphics().ellipse(0, 0, 30, 7).fill({ color: 0x0f1317, alpha: 0.45 })
    this.bossShadow.eventMode = 'none'
    this.bossShadow.visible = false
    actors.addChild(this.bossShadow, this.playerShadow)
    this.world.addChild(this.pickLayer, actors, this.fx.layer, this.flashG, this.debugLayer)
    this.fx.layer.addChild(this.combat.fx)
    this.insides = view.insides

    const player = makePlayer(this.art)
    player.x = view.world.spawnX
    player.y = view.world.spawnY
    this.deathFx = new Sprite(Texture.EMPTY)
    this.deathFx.visible = false
    this.deathFx.roundPixels = true
    this.deathFx.eventMode = 'none'
    actors.addChild(player.sprite, this.deathFx)

    if (kept) {
      player.hp = kept.hp
      player.coins = kept.coins
      player.bolts = kept.bolts
      player.tank = kept.tank
      player.form = kept.form
    } else {
      this.run = new Run()
      this.run.floor = boot.floor
      this.run.seed = boot.seed
      player.bolts = this.meta.bolts
      player.coins = 0
      player.form = this.meta.form === 'p1' && this.meta.bolts >= 10 ? 'p1' : 'p0'
    }
    this.state = {
      mode: kept ? 'play' : 'title',
      player,
      rivals: [],
      decals: [],
      pickups: [],
      dockMs: 0,
      dockStartPct: 0,
      afterEmpty: false,
      flash: 0,
    }
    this.syncStats(kept ? kept.maxHp : player.maxHp)
    this.spawnPuddles()
    if (this.run.explored.size === 0) {
      const id = roomAt(view.world, player.x, player.y)
      if (this.markExplored(id)) this.scatter(id)
    }
    this.showInsides()
    dispatchEvent(new Event('resize'))
    this.shake = 0
    this.hitStop = 0
    this.washA = 0
    this.lookX = 0
    this.lookY = 0
    this.lookVX = 0
    this.lookVY = 0
    this.scriptX = 0
    this.scriptY = 0
    this.syncActors()
  }

  private kick(power: number, stop: number, color: number, alpha: number): void {
    if (playOptions.shake) this.shake = Math.max(this.shake, power)
    this.hitStop = Math.max(this.hitStop, stop)
    if (!playOptions.flash) return
    if (alpha >= this.washA) this.washColor = color
    this.washA = Math.max(this.washA, alpha)
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault()
    const mode = this.state.mode
    if (event.repeat) {
      if (mode === 'play' || mode === 'docking') this.keys.add(event.code)
      else if (mode === 'settings' && isSettingsNudge(event.code)) this.menu.onKey(event.code)
      return
    }
    if (mode === 'title' || mode === 'hub' || mode === 'settings' || mode === 'brief' || mode === 'pause') {
      this.menu.onKey(event.code)
      return
    }
    if (mode === 'results') {
      this.hud.keyResults(event.code)
      return
    }
    if (mode === 'down') return
    if (mode === 'shop') {
      this.shopKey(event.code)
      return
    }
    if (mode === 'levelup') {
      this.levelup.onKey(event.code)
      return
    }
    if (event.code === 'Escape' && mode === 'play') {
      this.keys.clear()
      this.edges.clear()
      this.state.mode = 'pause'
      audio.ui('pause')
      return
    }
    this.edges.add(event.code)
    this.keys.add(event.code)
    if (event.code === 'KeyE') this.interact()
  }

  private interact(): void {
    const state = this.state
    const world = this.mansion
    if (state.mode !== 'play' || this.combat.swing || !world) return
    const player = state.player
    if (!this.run.shrineUsed && nearProp(world, 'shrine', player.x, player.y)) {
      this.openShrine()
      return
    }
    if (this.run.floor >= 2 && nearProp(world, 'shop_counter', player.x, player.y)) {
      this.openShop()
      return
    }
    if (this.run.floor < 5 && this.run.locked < 0 && nearProp(world, 'stairs_down', player.x, player.y)) {
      this.descend()
    }
  }

  private readAttacks(): void {
    const player = this.state.player
    const stats = this.progress.stats
    this.combat.hold = this.keys.has('KeyF')
    const bump = player.form === 'p1' ? 'player/attack_p1_bump_strong' : 'player/attack_p0_bump'
    if (this.edges.has('Space') && this.combat.press('brush-combo', player.facing)) audio.sfx(bump)
    if (this.edges.has('KeyF') && this.combat.press('suction-pull', player.facing)) audio.sfx(bump)
    if (this.edges.has('KeyQ') && stats.shield) this.combat.press('shield-parry', player.facing)
    if (this.edges.has('KeyC') && stats.mixed) this.combat.press('mixed-combo', player.facing)
  }

  private applyHit(hit: HitEmit): void {
    const facing = this.combat.swing?.facing ?? this.state.player.facing
    for (const rival of this.state.rivals) {
      if (!rival.alive || rival.hp <= 0 || rival.react?.kind === 'death') continue
      if (!bodiesOverlap(hit.rect, rival)) continue
      this.hurtRival(rival, this.strikeDamage(hit.mult, hit.kind, rival), hit.knock, facing, hit.stop)
    }
  }

  private strikeDamage(mult: number, kind: string, rival: Rival): number {
    const stats = this.progress.stats
    if (kind === 'ram') return Math.max(1, Math.round(30 * mult))
    let damage = mult
    if (kind === 'slash' || kind === 'spin') {
      damage = damage * stats.brush + stats.extraHit
      if (Math.random() < stats.crit) damage *= stats.critMult
    }
    if (this.isMarked(rival)) damage *= stats.mark
    return Math.max(1, Math.round(damage))
  }

  private isMarked(rival: Rival): boolean {
    if (this.progress.stats.mark <= 1) return false
    const player = this.state.player
    let best: Rival | null = null
    let bestD = Infinity
    for (const other of this.state.rivals) {
      if (!other.alive || other.hp <= 0 || other.react?.kind === 'death') continue
      const d = (other.x - player.x) ** 2 + (other.y - player.y) ** 2
      if (d < bestD) {
        bestD = d
        best = other
      }
    }
    return best === rival
  }

  private hurtRival(rival: Rival, damage: number, knock: number, facing: Facing, stop: number): void {
    if (!rival.alive || rival.hp <= 0 || rival.react?.kind === 'death') return
    const fresh = rival.iframe <= 0
    const vuln = this.foeVuln(rival)
    if (vuln <= 0) return
    damage = Math.max(1, Math.round(damage * vuln))
    this.float(damage, rival.x, rival.y - rival.reach - 6)
    rival.hp -= damage
    rival.iframe = Math.max(rival.iframe, 0.2)
    const vec = VEC[facing]
    if (rival.hp <= 0) {
      this.beginDeath(rival, vec.x * Math.max(knock, 5), vec.y * Math.max(knock, 5))
      this.kick(5, Math.max(stop, 50), 0xffffff, 0.45)
      return
    }
    if (fresh) audio.sfx('enemies/enemy_hit', 70)
    if (isFloorBoss(rival.breed)) {
      const busy = rival.act.startsWith('attack') || rival.act === 'phase' || rival.act === 'phase2'
        || rival.act === 'phase3' || rival.act === 'intro' || rival.act === 'death'
      if (!busy) {
        rival.act = 'hit'
        rival.frame = 0
        rival.frameMs = 0
        rival.aim = 0
      }
      if (rival.breed !== 'old_boiler') {
        this.shiftSoldier(rival, vec.x * Math.max(knock, 5), vec.y * Math.max(knock, 5))
      }
      this.kick(3, stop, 0xffffff, 0.3)
      return
    }
    if (knock < 0) {
      this.shiftSoldier(rival, vec.x * knock, vec.y * knock)
      clampRival(rival)
      this.kick(2, stop, 0xffffff, 0.25)
      return
    }
    if (anchored(rival.breed)) {
      this.flinchSoldier(rival, vec)
      this.kick(3, stop, 0xffffff, 0.3)
      return
    }
    if (rival.plain) {
      this.shiftSoldier(rival, vec.x * Math.max(knock, 5), vec.y * Math.max(knock, 5))
      this.kick(3, stop, 0xffffff, 0.3)
      return
    }
    startReaction(rival, 'hit', vec.x * Math.max(knock, 5), vec.y * Math.max(knock, 5))
    this.kick(3, stop, 0xffffff, 0.3)
  }

  private flinchSoldier(rival: Rival, vec: { x: number; y: number }): void {
    rival.act = 'hit'
    rival.actMs = 0.38
    rival.dustMs = 0
    rival.frame = 0
    rival.markOn = false
    this.shiftSoldier(rival, vec.x * 6, vec.y * 6)
  }

  private shiftSoldier(rival: Rival, dx: number, dy: number): void {
    const world = this.mansion
    if (!world || (dx === 0 && dy === 0)) return
    const nx = rival.x + dx
    const ny = rival.y + dy
    if (!blockedAt(world, nx, ny, dx, dy)) {
      rival.x = nx
      rival.y = ny
      return
    }
    if (dx !== 0 && !blockedAt(world, nx, rival.y, dx, 0)) rival.x = nx
    if (dy !== 0 && !blockedAt(world, rival.x, ny, 0, dy)) rival.y = ny
  }

  private suctionChip(): void {
    const player = this.state.player
    const radius = 30 + this.progress.stats.cleanWidth
    for (const rival of this.state.rivals) {
      if (!inCone(player.x, player.y, player.facing, rival.x, rival.y, radius)) continue
      this.hurtRival(rival, 1, 2, player.facing, 20)
    }
  }

  private vacuum(radius: number): void {
    const player = this.state.player
    for (const rival of this.state.rivals) {
      if (!rival.alive || rival.hp <= 0 || rival.breed === 'old_boiler') continue
      if (!inCone(player.x, player.y, player.facing, rival.x, rival.y, radius)) continue
      const dx = player.x - rival.x
      const dy = player.y - rival.y
      const len = Math.hypot(dx, dy) || 1
      this.shiftSoldier(rival, dx / len, dy / len)
      clampRival(rival)
    }
    for (const pickup of this.state.pickups) {
      if (!pickup.alive) continue
      if (!inCone(player.x, player.y, player.facing, pickup.x, pickup.y, radius)) continue
      nudge(pickup, player.x, player.y, 1)
    }
  }

  private pulseDamage(radius: number, damage: number): void {
    const player = this.state.player
    if (damage <= 0) return
    for (const rival of this.state.rivals) {
      if (!rival.alive || rival.hp <= 0 || rival.react?.kind === 'death') continue
      if (Math.hypot(rival.x - player.x, rival.y - player.y) > radius) continue
      this.hurtRival(rival, damage, 4, player.facing, 30)
    }
    this.fx.pop(player.x, player.y, false)
  }

  private pulseClean(radius: number): void {
    const player = this.state.player
    const reach = radius * radius
    for (const decal of this.state.decals) {
      const size = DECAL_SIZE[decal.id]
      const cx = decal.x + size.w / 2
      const cy = decal.y + size.h / 2
      const dx = cx - player.x
      const dy = cy - player.y
      if (dx * dx + dy * dy > reach) continue
      const pop = forceStage(decal, this.art)
      if (!pop) continue
      this.fx.pop(pop.x, pop.y, pop.gone)
      this.payClean()
      if (pop.gone) this.run.dirt += 1
    }
    for (const puddle of this.puddles) {
      const cx = puddle.x + puddle.w / 2
      const cy = puddle.y + puddle.h / 2
      const dx = cx - player.x
      const dy = cy - player.y
      if (dx * dx + dy * dy > reach) continue
      const pop = forceSpill(puddle)
      if (!pop) continue
      this.fx.pop(pop.x, pop.y, pop.gone)
      this.payClean()
      if (pop.gone) this.run.dirt += 1
    }
  }

  private tookClean(pop: { x: number; y: number; gone: boolean }): void {
    this.fx.pop(pop.x, pop.y, false)
    this.kick(pop.gone ? 2.4 : 1.4, 0, pop.gone ? 0xb4d2d8 : 0xffffff, pop.gone ? 0.22 : 0.1)
    this.payClean()
    if (pop.gone) this.run.dirt += 1
  }

  private payClean(): void {
    const stats = this.progress.stats
    const player = this.state.player
    this.progress.addXp(stats.cleanXp)
    player.coins += Math.max(1, Math.round(stats.coinValue))
    if (player.hp <= 0 || player.hp >= player.maxHp) return
    const heal = Math.min(CLEAN_HEAL, player.maxHp - player.hp)
    player.hp += heal
    this.float(heal, player.x, player.y - 16, '#8fc4d2')
  }

  private pulseFetch(radius: number): void {
    for (const pickup of this.state.pickups) {
      if (!pickup.alive) continue
      const dx = pickup.x - this.state.player.x
      const dy = pickup.y - this.state.player.y
      if (dx * dx + dy * dy > radius * radius) continue
      this.takePickup(pickup)
    }
  }

  private separate(): void {
    const state = this.state
    const player = state.player
    const stats = this.progress.stats
    for (const rival of state.rivals) {
      if (!rival.alive || rival.hp <= 0 || rival.react?.kind === 'death' || rival.hang) continue
      if (rival.breed === 'old_boiler') continue
      const cy = rival.plain ? rival.y - rival.reach : rival.y
      const dx = player.x - rival.x
      const dy = player.y - cy
      const dist = Math.hypot(dx, dy)
      const reach = bodyRim(dx, dy) + rival.reach
      if (dist >= reach || dist === 0) continue
      if (this.combat.parryHot() && player.iframe <= 0) {
        player.iframe = IFRAME
        rival.iframe = IFRAME
        if (!rival.plain) startReaction(rival, 'hit', -(dx / dist) * 5, -(dy / dist) * 5)
        this.kick(3, 40, 0xb4d2d8, 0.35)
      }
      const push = (reach - dist) / 2 + 1
      const sx = -(dx / dist) * push
      const sy = -(dy / dist) * push
      const ox = rival.x
      const oy = rival.y
      this.shiftSoldier(rival, sx, sy)
      player.x += (dx / dist) * push * stats.knock - (sx - (rival.x - ox))
      player.y += (dy / dist) * push * stats.knock - (sy - (rival.y - oy))
    }
  }

  private beginDeath(rival: Rival, px: number, py: number): void {
    if (!rival.alive || rival.react?.kind === 'death') return
    rival.hp = 0
    if (!rival.rewarded) {
      rival.rewarded = true
      this.progress.onKill()
      this.progress.addXp(rival.xp)
      this.run.kills += 1
      if (rival.key) this.run.hasKey = true
      if (rival.breed === 'snap_trap') this.openCrystal()
      if (isFloorBoss(rival.breed)) {
        audio.sfx('bosses/boss_defeat_explosion')
        audio.stinger('boss_defeated')
      } else audio.sfx('enemies/enemy_death_scrap_burst')
      for (let i = 0; i < rival.smudge; i++) {
        this.spillAt('57a', rival.x + i * 10 - 8, rival.y, rival.smudgeStage)
      }
    }
    if (isFloorBoss(rival.breed)) {
      rival.act = 'death'
      rival.frame = 0
      rival.frameMs = 0
      rival.vuln = 0
      rival.alive = true
      rival.settling = false
      return
    }
    if (rival.plain) {
      rival.alive = false
      rival.sprite.visible = false
      rival.fx.visible = false
      this.dropLoot(rival)
      return
    }
    startReaction(rival, 'death', px, py)
  }

  private dropLoot(rival: Rival): void {
    this.dropCoins(rival.lootCoins, rival.x, rival.y)
    for (let i = 0; i < rival.lootBolts; i++) this.drop('bolt', rival.x, rival.y + 8 + i * 6)
    for (let i = 0; i < this.progress.stats.killBolts; i++) this.drop('bolt', rival.x, rival.y + 12)
    this.fx.pop(rival.x, rival.y, true)
  }

  private dropCoins(amount: number, x: number, y: number): void {
    let left = amount
    let step = 0
    while (left >= 25) {
      this.drop('premium', x + step, y)
      left -= 25
      step += 8
    }
    while (left >= 5) {
      this.drop('gold', x + step, y)
      left -= 5
      step += 8
    }
    while (left >= 1) {
      this.drop('silver', x + step, y)
      left -= 1
      step += 6
    }
  }

  private spawnPuddles(): void {
    const world = this.mansion
    this.puddles = []
    if (!world) return
    for (const hazard of world.hazards) {
      if (hazard.kind !== 'coffee' && hazard.kind !== 'water') continue
      this.addPuddle(hazard.kind, hazard.x * MANSION_TILE, hazard.y * MANSION_TILE, 0, 0, 0)
    }
  }

  private addPuddle(
    kind: 'coffee' | 'water', x: number, y: number, stage: 0 | 1 | 2, sweeps: number, dist: number,
  ): void {
    const sprite = new Sprite(this.tiles.hazard(kind))
    sprite.position.set(x, y)
    sprite.roundPixels = true
    sprite.eventMode = 'none'
    sprite.alpha = stage === 0 ? 1 : stage === 1 ? 2 / 3 : 1 / 3
    sprite.visible = false
    this.dirtLayer.addChild(sprite)
    this.puddles.push({
      kind,
      x,
      y,
      w: sprite.texture.width,
      h: sprite.texture.height,
      stage,
      dist,
      sweeps,
      sprite,
    })
  }

  private restorePuddles(rows: PuddleSnap[] | undefined): void {
    if (rows === undefined) return
    for (const puddle of this.puddles) puddle.sprite.destroy()
    this.puddles = []
    for (const row of rows) this.addPuddle(row.kind, row.x, row.y, row.stage, row.sweeps, row.dist)
  }

  private spillAt(id: DecalId, x: number, y: number, stage: 0 | 1 | 2): void {
    const decal = makeDecal(this.art, id, Math.round(x), Math.round(y))
    if (stage > 0) {
      decal.stage = stage
      decal.sprite.texture = this.art.dirt[id][stage]
    }
    this.state.decals.push(decal)
    this.dirtLayer.addChild(decal.sprite)
  }

  private drop(kind: PickupKind, x: number, y: number): void {
    const point = {
      x: clamp(Math.round(x), 8, worldSize.w - 8),
      y: clamp(Math.round(y), 8, worldSize.h - 8),
    }
    const pickup = this.makePickup(kind, point.x, point.y, 0)
    this.state.pickups.push(pickup)
    this.pickLayer.addChild(pickup.sprite)
  }

  private makePickup(kind: PickupKind, x: number, y: number, stagger: number): Pickup {
    const box = PICKUP_BOX[kind]
    const frame = kind === 'bolt' ? this.art.bolt[0] : this.art.coins[kind].spin[0]
    const sprite = new Sprite(frame)
    sprite.roundPixels = true
    sprite.position.set(Math.round(x - box.ax), Math.round(y - box.ay))
    return { kind, x, y, alive: true, mode: 'spin', ms: stagger, sprite }
  }

  private collect(): void {
    for (const pickup of this.state.pickups) this.takePickup(pickup)
  }

  private takePickup(pickup: Pickup): void {
    if (!pickup.alive) return
    const player = this.state.player
    const stats = this.progress.stats
    const extra = stats.pullRadius + (pickup.kind === 'bolt' ? 0 : stats.coinPull)
    const reach = PICKUP_R + extra
    const dx = pickup.x - player.x
    const dy = pickup.y - player.y
    if (dx * dx + dy * dy > reach * reach) return
    if (pickup.kind === 'bolt') {
      player.bolts += 1
      this.meta.bolts = player.bolts
      saveMeta(this.meta)
    } else player.coins += Math.max(1, Math.round(COIN_VALUE[pickup.kind] * stats.coinValue))
    pickup.alive = false
    pickup.sprite.visible = false
    audio.sfx(pickup.kind === 'bolt' ? 'pickups/bolt' : 'pickups/coin')
    this.fx.pop(pickup.x, pickup.y, pickup.kind === 'bolt')
    this.kick(pickup.kind === 'bolt' ? 2.2 : 1.3, 0, 0xffffff, 0.12)
  }

  private emitDust(
    body: { x: number; y: number; facing: Facing; dustMs: number },
    moving: boolean,
    dtMs: number,
    ax: number,
    ay: number,
  ): void {
    if (!moving) {
      body.dustMs = 0
      return
    }
    body.dustMs += dtMs
    while (body.dustMs >= DUST_EVERY) {
      body.dustMs -= DUST_EVERY
      const off = DUST_AT[body.facing]
      this.fx.dust(body.x - ax + off.x, body.y - ay + off.y)
    }
  }

  private syncStats(before = this.state.player.maxHp): void {
    const stats = this.progress.stats
    const player = this.state.player
    const next = stats.maxHp + 10 * this.meta.plating
    if (next > before) player.hp += next - before
    player.maxHp = next
    if (player.hp > player.maxHp) player.hp = player.maxHp
  }

  private openLevel(track: boolean): void {
    const player = this.state.player
    const form = player.form === 'p1' ? 1 : 0
    const cards = this.progress.roll(track, form)
    this.run.panel = 'level'
    this.state.mode = 'levelup'
    if (track) audio.stinger('level_up')
    this.levelup.open(
      cards,
      this.progress.level + 1,
      this.progress.xp,
      this.progress.need(),
      this.progress.rerollCost(),
    )
    this.levelup.setView(this.viewW, this.viewH)
  }

  private finishLevel(): void {
    this.progress.level += 1
    this.progress.pending -= 1
    this.progress.rerolls = 0
    this.syncStats()
    if (this.progress.pending > 0 && this.state.player.hp > 0) this.openLevel(true)
    else this.closeLevel()
  }

  private closeLevel(): void {
    if (this.state.mode === 'levelup' || this.state.mode === 'shop') this.state.mode = 'play'
    this.levelup.hide()
    for (const code of ['Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyQ', 'KeyC']) this.keys.delete(code)
  }

  private onTake(index: number): void {
    if (this.run.panel === 'shop') {
      this.buy(index)
      return
    }
    const before = this.state.player.maxHp
    this.progress.take(index, this.state.player)
    this.syncStats(before)
    if (this.run.panel === 'shrine') {
      audio.sfx('pickups/shrine_activate')
      this.run.panel = ''
      this.closeLevel()
      return
    }
    this.finishLevel()
  }

  private onSkip(): void {
    if (this.run.panel === 'shrine' || this.run.panel === 'shop') {
      this.run.panel = ''
      this.closeLevel()
      return
    }
    this.progress.skip(this.state.player)
    this.finishLevel()
  }

  private onReroll(): boolean {
    if (this.run.panel === 'shop') return false
    const free = this.progress.freeReady
    if (!this.progress.tryReroll(this.state.player, free)) return false
    if (this.run.panel === 'shrine') {
      this.openShrine()
      return true
    }
    this.openLevel(false)
    return true
  }

  private syncActors(): void {
    const player = this.state.player
    const dying = !this.run.won && (this.state.mode === 'down' || this.state.mode === 'results')
    if (dying) {
      const elapsed = this.state.mode === 'results' ? DEATH_LEN : DEATH_LEN - this.run.downMs
      const frame = deathFrame(Math.max(0, elapsed))
      const face = player.facing
      const jitter = frame <= 2 ? (frame % 2 === 0 ? 1 : -1) : 0
      const body = this.art.death.body[face]
      const fx = this.art.death.fx[face]
      player.sprite.texture = body[frame] ?? Texture.EMPTY
      player.sprite.visible = true
      player.sprite.alpha = 1
      this.place(player.sprite, player.x + jitter, player.y, 32, 47)
      this.deathFx.texture = fx[frame] ?? Texture.EMPTY
      this.deathFx.visible = true
      this.deathFx.alpha = 1
      this.place(this.deathFx, player.x + jitter, player.y, 32, 47)
      this.deathFx.zIndex = player.sprite.zIndex + 0.25
      this.combat.fx.visible = false
    } else {
      this.deathFx.visible = false
      if (this.combat.swing) {
        this.combat.place(player.x, player.y, player.sprite)
      } else {
        this.combat.fx.visible = false
        if (player.form === 'p0') {
          const book = player.settling ? this.art.addon.settle : this.art.addon.glide
          const frames = book[player.facing]
          player.sprite.texture = frames[Math.min(player.frame, frames.length - 1)]
          this.place(player.sprite, player.x, player.y, PIVOT.p0.x, PIVOT.p0.y)
        } else {
          const frames = this.art.p1Play
          player.sprite.texture = frames[player.frame % frames.length]
          this.place(player.sprite, player.x, player.y, PIVOT.p1.x, PIVOT.p1.y)
        }
      }
      player.sprite.alpha = stateFlash(this.state.flash, player.iframe)
    }
    this.syncShadow()

    for (const rival of this.state.rivals) {
      if (!rival.alive && !rival.react) {
        rival.sprite.visible = false
        rival.fx.visible = false
        continue
      }
      if (rival.react && !rival.plain) {
        const body = rival.react.kind === 'hit' ? this.art.addon.hitBody : this.art.addon.deathBody
        const fx = rival.react.kind === 'hit' ? this.art.addon.hitFx : this.art.addon.deathFx
        const frame = Math.min(rival.react.frame, body[rival.facing].length - 1)
        rival.sprite.texture = body[rival.facing][frame]
        rival.sprite.visible = true
        rival.sprite.alpha = 1
        this.place(rival.sprite, rival.x, rival.y, 24, 25)
        rival.fx.texture = fx[rival.facing][frame]
        rival.fx.visible = true
        rival.fx.alpha = 1
        rival.fx.position.copyFrom(rival.sprite.position)
        continue
      }
      if (rival.plain) {
        if (isFloorBoss(rival.breed)) {
          this.syncFloorBoss(rival)
          continue
        }
        if (rival.breed === 'tin_soldier') {
          this.syncSoldier(rival)
          continue
        }
        if (rival.breed === 'rogue_mop') {
          this.syncMop(rival)
          continue
        }
        if (rival.breed === 'snap_trap') {
          this.syncTrap(rival)
          continue
        }
        if (rival.breed === 'toaster') {
          this.syncToaster(rival)
          continue
        }
        rival.fx.visible = false
        const still = this.foeArt[rival.breed]
        if (still) rival.sprite.texture = still
        rival.sprite.anchor.set(0.5, 1)
        rival.sprite.scale.x = rival.facing === 'left' ? -1 : 1
        rival.sprite.visible = rival.alive
        rival.sprite.alpha = blink(rival.iframe)
        rival.sprite.position.set(Math.round(rival.x), Math.round(rival.y - (rival.hang ? 24 : 0)))
        rival.sprite.zIndex = rival.y
        rival.sprite.roundPixels = true
        continue
      }
      rival.fx.visible = false
      const book = rival.settling ? this.art.rival[rival.kind].settle : this.art.rival[rival.kind].glide
      const frames = book[rival.facing]
      rival.sprite.texture = frames[Math.min(rival.frame, frames.length - 1)]
      rival.sprite.visible = true
      this.place(rival.sprite, rival.x, rival.y, PIVOT.rival.x, PIVOT.rival.y)
      rival.sprite.alpha = blink(rival.iframe)
    }
    this.syncBars()
    this.syncCorks()
    this.syncToasts()
    this.syncBossUi()
  }

  private syncFloorBoss(rival: Rival): void {
    const book = this.bossArt.books[rival.breed]
    const name = clipName(rival.breed, rival.act, rival.facing, rival.phase)
    const clip = book?.clips[name] ?? book?.clips[clipName(rival.breed, 'idle', rival.facing, rival.phase)]
    if (!book || !clip) {
      rival.sprite.visible = false
      rival.fx.visible = false
      return
    }
    const frame = Math.min(rival.frame, Math.max(0, clip.body.length - 1))
    rival.sprite.anchor.set(0, 0)
    rival.sprite.scale.set(1)
    rival.sprite.texture = clip.body[frame] ?? Texture.EMPTY
    rival.sprite.visible = rival.alive
    rival.sprite.alpha = rival.act === 'hit' ? 1 : blink(rival.iframe)
    this.place(rival.sprite, rival.x, rival.y, book.footX, book.footY)
    const overlay = clip.fx[frame]
    rival.fx.anchor.set(0, 0)
    rival.fx.scale.set(1)
    rival.fx.visible = !!overlay && rival.alive
    if (!overlay) return
    rival.fx.texture = overlay
    rival.fx.alpha = 1
    this.place(rival.fx, rival.x, rival.y, book.footX, book.footY)
    rival.fx.zIndex = rival.y + 0.25
  }

  private syncBossUi(): void {
    const boss = this.state?.rivals.find((rival) =>
      rival.alive && (isFloorBoss(rival.breed) || rival.breed === 'head_butler'))
    const shadow = this.bossShadow
    if (shadow) {
      const shown = !!boss && isFloorBoss(boss.breed)
      shadow.visible = shown
      if (shown && boss) {
        shadow.position.set(Math.round(boss.x), Math.round(boss.y))
        shadow.zIndex = boss.y - 1
      }
    }
    if (!boss) {
      this.bossCard.visible = false
      this.bossBar.visible = false
      return
    }
    const card = this.bossArt.cards[boss.breed]
    if (boss.act === 'intro' && card) {
      this.bossCard.texture = card
      this.bossCard.visible = true
      this.bossCard.position.set(Math.round((this.viewW - 320) / 2), Math.round((this.viewH - 180) / 2))
    } else this.bossCard.visible = false
    const bars = this.bossArt.bars[boss.breed]
    if (bars && boss.act !== 'intro') {
      const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0
      const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
      this.bossBarBody.texture = bars.bodies[pct] ?? Texture.EMPTY
      this.bossBarName.texture = bars.name
      const phase = boss.breed === 'head_butler'
        ? (ratio < 0.3 ? 3 : ratio < 0.6 ? 2 : 1)
        : Math.max(1, boss.phase)
      for (let slot = 0; slot < this.bossBarGems.length; slot++) {
        const gem = this.bossBarGems[slot]
        if (!gem) continue
        gem.visible = slot < bars.gems
        gem.texture = phase > slot + 1 ? bars.gemLost : bars.gemOk
      }
      this.bossBar.visible = true
      this.bossBar.position.set(Math.round(this.viewW / 2), this.viewH - 6)
    } else this.bossBar.visible = false
    this.hud.root.addChild(this.bossCard, this.bossBar)
  }

  private finishBosses(): void {
    for (const rival of this.state.rivals) {
      if (!isFloorBoss(rival.breed) || rival.alive || rival.act !== 'death' || !rival.settling) continue
      rival.settling = false
      this.dropLoot(rival)
      this.dropChest(rival)
    }
  }

  private dropChest(rival: Rival): void {
    if (this.bossChest) this.bossChest.sprite.destroy()
    const sprite = new Sprite(this.bossArt.chestClosed)
    sprite.anchor.set(0.5, 1)
    sprite.roundPixels = true
    sprite.eventMode = 'none'
    sprite.position.set(Math.round(rival.x), Math.round(rival.y))
    sprite.zIndex = rival.y - 0.2
    this.actors.addChild(sprite)
    this.bossChest = { x: rival.x, y: rival.y, open: false, sprite }
  }

  private tickChest(): void {
    const chest = this.bossChest
    if (!chest || chest.open) return
    const player = this.state.player
    const dx = player.x - chest.x
    const dy = player.y - chest.y
    if (dx * dx + dy * dy > 24 * 24) return
    chest.open = true
    chest.sprite.texture = this.bossArt.chestOpen
    audio.sfx('pickups/chest_open')
  }

  private tickBossShots(dt: number): void {
    const world = this.mansion
    const player = this.state.player
    if (!world) {
      this.bossShots = []
      return
    }
    for (const shot of this.bossShots) {
      if (!shot.alive) continue
      shot.age += dt
      if (shot.arc) {
        const dur = Math.max(0.05, shot.life)
        const u = Math.min(1, shot.age / dur)
        shot.x = shot.fromX + (shot.landX - shot.fromX) * u
        shot.y = shot.fromY + (shot.landY - shot.fromY) * u - Math.sin(Math.PI * u) * 26
        if (u < 1) continue
        const dx = player.x - shot.x
        const dy = player.y - shot.y
        if (Math.hypot(dx, dy) <= shot.r + bodyRim(dx, dy)) this.hurtPlayer(shot.dmg)
        if (shot.ember) {
          shot.kind = 'ember'
          shot.arc = false
          shot.age = 0
          shot.life = 3.5
          shot.dmg = 4
          shot.r = 14
          shot.tick = 1
          shot.vx = 0
          shot.vy = 0
          shot.hit = false
          continue
        }
        shot.alive = false
        continue
      }
      if (shot.kind === 'chime') {
        if (shot.age < shot.delay) continue
        const u = (shot.age - shot.delay) / Math.max(0.05, shot.life)
        if (u >= 1) {
          shot.alive = false
          continue
        }
        shot.r = shot.r0 + (shot.r1 - shot.r0) * u
        if (!shot.hit) {
          const dx = player.x - shot.x
          const dy = player.y - shot.y
          if (Math.abs(Math.hypot(dx, dy) - shot.r) <= bodyRim(dx, dy) + 4) {
            shot.hit = true
            this.hurtPlayer(shot.dmg)
          }
        }
        continue
      }
      if (shot.kind === 'foam' || shot.kind === 'ember') {
        if (shot.age >= shot.life) {
          shot.alive = false
          continue
        }
        const dx = player.x - shot.x
        const dy = player.y - shot.y
        if (Math.hypot(dx, dy) <= shot.r + bodyRim(dx, dy)) {
          if (shot.kind === 'foam') this.run.mop = Math.max(this.run.mop, 0.2)
          shot.tick -= dt
          if (shot.tick <= 0) {
            shot.tick = 1
            this.hurtPlayer(shot.dmg)
          }
        }
        continue
      }
      if (shot.kind === 'grid') {
        if (shot.age >= shot.life) shot.alive = false
        continue
      }
      if (shot.homing) {
        const dx = player.x - shot.x
        const dy = player.y - shot.y
        const len = Math.hypot(dx, dy) || 1
        const tx = (dx / len) * 70
        const ty = (dy / len) * 70
        const k = Math.min(1, dt * 4)
        shot.vx += (tx - shot.vx) * k
        shot.vy += (ty - shot.vy) * k
        const vlen = Math.hypot(shot.vx, shot.vy) || 1
        shot.vx = (shot.vx / vlen) * 70
        shot.vy = (shot.vy / vlen) * 70
      }
      const ox = shot.x
      const oy = shot.y
      shot.x += shot.vx * dt
      shot.y += shot.vy * dt
      if (shot.age > 0.08 && blockedAt(world, shot.x, shot.y, shot.x - ox, shot.y - oy)) {
        shot.alive = false
        continue
      }
      if (shot.age >= shot.life || shot.x < 0 || shot.y < 0 || shot.x > worldSize.w || shot.y > worldSize.h) {
        shot.alive = false
        continue
      }
      if (shot.hit) continue
      const dx = player.x - shot.x
      const dy = player.y - shot.y
      if (Math.hypot(dx, dy) > shot.r + bodyRim(dx, dy)) continue
      shot.hit = true
      shot.alive = false
      this.hurtPlayer(shot.dmg)
    }
    this.bossShots = this.bossShots.filter((shot) => shot.alive)
    this.syncBossShotSprites()
  }

  private syncBossShotSprites(): void {
    while (this.bossSprites.length < this.bossShots.length) {
      const sprite = new Sprite(Texture.EMPTY)
      sprite.anchor.set(0.5, 0.5)
      sprite.roundPixels = true
      sprite.eventMode = 'none'
      this.actors.addChild(sprite)
      this.bossSprites.push(sprite)
    }
    for (let i = 0; i < this.bossSprites.length; i++) {
      const sprite = this.bossSprites[i]
      const shot = this.bossShots[i]
      if (!sprite) continue
      if (!shot) {
        sprite.visible = false
        continue
      }
      const art = this.bossArt.shots[shot.kind]
      if (!art || art.frames.length === 0) {
        sprite.visible = false
        continue
      }
      const shown = shot.kind !== 'chime' || shot.age >= shot.delay
      sprite.visible = shown
      const frame = Math.floor((Math.max(0, shot.age - shot.delay) * 1000) / art.ms)
      const index = art.loop ? frame % art.frames.length : Math.min(frame, art.frames.length - 1)
      sprite.texture = art.frames[index] ?? sprite.texture
      if (shot.kind === 'foam' || shot.kind === 'ember') sprite.anchor.set(0.5, 1)
      else sprite.anchor.set(0.5, 0.5)
      if (shot.kind === 'chime') sprite.scale.set(Math.max(0.25, shot.r / 48))
      else sprite.scale.set(1)
      sprite.position.set(Math.round(shot.x), Math.round(shot.y))
      sprite.zIndex = shot.y
    }
  }

  private syncSoldier(rival: Rival): void {
    const attack = rival.act === 'aim' || rival.act === 'cork'
    const pose = rival.act === 'hit' ? 'hit' : attack ? 'attack' : rival.act === 'winddown' ? 'idle' : 'move'
    this.syncBook(rival, this.art.soldier, pose, 21, 55)
  }

  private syncMop(rival: Rival): void {
    const attack = rival.act === 'wind' || rival.act === 'arc' || rival.act === 'recover'
    const pose = rival.act === 'hit' ? 'hit' : attack ? 'attack' : 'move'
    this.syncBook(rival, this.art.mop, pose, 25, 58)
  }

  private syncTrap(rival: Rival): void {
    const attack = rival.act === 'shiver' || rival.act === 'snap' || rival.act === 'open'
    const pose = rival.act === 'hit' ? 'hit' : attack ? 'attack' : 'move'
    this.syncBook(rival, this.art.trap, pose, 18, 39)
  }

  private syncToaster(rival: Rival): void {
    const attack = rival.act === 'wind' || rival.act === 'toast'
    const pose = rival.act === 'hit' ? 'hit' : attack ? 'attack' : 'move'
    this.syncBook(rival, this.art.toaster, pose, 29, 49)
  }

  private syncBook(rival: Rival, book: FoeSheet, pose: 'move' | 'idle' | 'attack' | 'hit', ax: number, ay: number): void {
    const face = rival.facing
    const body = pose === 'hit' ? book.hit[face] : pose === 'attack' ? book.attack[face] : pose === 'idle' ? book.idle[face] : book.move[face]
    const fx = pose === 'hit' ? book.hitFx[face] : pose === 'attack' ? book.attackFx[face] : null
    const frame = Math.min(rival.frame, Math.max(0, body.length - 1))
    rival.sprite.anchor.set(0, 0)
    rival.sprite.scale.set(1)
    rival.sprite.texture = body[frame] ?? rival.sprite.texture
    rival.sprite.visible = rival.alive
    rival.sprite.alpha = pose === 'hit' ? 1 : blink(rival.iframe)
    this.place(rival.sprite, rival.x, rival.y, ax, ay)
    rival.fx.anchor.set(0, 0)
    rival.fx.scale.set(1)
    const overlay = fx?.[frame]
    rival.fx.visible = !!overlay
    if (!overlay) return
    rival.fx.texture = overlay
    rival.fx.alpha = 1
    this.place(rival.fx, rival.x, rival.y, ax, ay)
  }

  private syncCorks(): void {
    const shots = this.state.rivals.filter((rival) => rival.alive && rival.markOn && rival.breed === 'tin_soldier')
    while (this.corks.length < shots.length) {
      const cork = new Sprite(this.art.soldier.cork)
      cork.anchor.set(0.5, 0.5)
      cork.scale.set(4 / 3)
      cork.roundPixels = true
      cork.eventMode = 'none'
      this.debugLayer.addChild(cork)
      this.corks.push(cork)
    }
    for (let i = 0; i < this.corks.length; i++) {
      const cork = this.corks[i]
      const shot = shots[i]
      if (!cork) continue
      cork.visible = !!shot
      if (!shot) continue
      cork.position.set(Math.round(shot.markX), Math.round(shot.markY))
      cork.rotation = shot.facing === 'down' ? Math.PI / 2
        : shot.facing === 'left' ? Math.PI
        : shot.facing === 'up' ? -Math.PI / 2
        : 0
    }
  }

  private syncToasts(): void {
    const shots = this.state.rivals.filter((rival) => rival.alive && rival.markOn && rival.breed === 'toaster')
    while (this.toasts.length < shots.length) {
      const toast = new Sprite(this.art.toaster.toast[0])
      toast.anchor.set(0.5, 0.5)
      toast.roundPixels = true
      toast.eventMode = 'none'
      this.debugLayer.addChild(toast)
      this.toasts.push(toast)
    }
    for (let i = 0; i < this.toasts.length; i++) {
      const toast = this.toasts[i]
      const shot = shots[i]
      if (!toast) continue
      toast.visible = !!shot
      if (!shot) continue
      const frame = Math.floor((TOAST_FLIGHT - shot.actMs) / 0.175) % 4
      toast.texture = this.art.toaster.toast[frame] ?? toast.texture
      toast.position.set(Math.round(shot.markX), Math.round(shot.markY))
    }
  }

  private foeVuln(rival: Rival): number {
    if (rival.vuln <= 0) return 0
    if (rival.breed === 'vacuum_brute' && rival.act === 'pull') {
      const player = this.state.player
      const face = VEC[rival.facing]
      const dx = player.x - rival.x
      const dy = player.y - rival.y
      if (dx * face.x + dy * face.y < 0) return 1.5
    }
    return rival.vuln
  }

  private applyFoeHits(hits: { damage: number; stun?: number }[]): void {
    for (const blow of hits) {
      if (this.combat.parryHot() && this.state.player.iframe <= 0) {
        this.state.player.iframe = IFRAME
        this.kick(3, 40, 0xb4d2d8, 0.35)
        continue
      }
      this.hurtPlayer(blow.damage)
      if (blow.stun && blow.stun > 0 && this.state.player.hp > 0) this.stun = Math.max(this.stun, blow.stun)
    }
  }

  private hurtPlayer(raw: number): void {
    const state = this.state
    const player = state.player
    if (player.hp <= 0 || state.mode !== 'play' || player.iframe > 0) return
    const stats = this.progress.stats
    if (stats.shield && this.progress.shieldUp) {
      this.progress.shieldUp = false
      this.progress.shieldLeft = stats.shieldCd
      player.iframe = IFRAME
      this.kick(2, 30, 0xb4d2d8, 0.3)
      return
    }
    const damage = Math.max(1, Math.round(raw * stats.contact))
    player.hp = Math.max(0, player.hp - damage)
    player.iframe = IFRAME
    this.float(damage, player.x, player.y - 16)
    this.kick(3, 45, 0xffffff, 0.3)
    audio.sfx('player/hit_taken')
    if (player.hp <= 0) this.powerDown(false)
  }

  private powerDown(won: boolean): void {
    this.state.player.hp = Math.max(0, this.state.player.hp)
    this.run.won = won
    this.state.mode = 'down'
    this.run.downMs = won ? 1200 : DEATH_LEN
    this.run.cause = won ? 'BOSS CLEAR' : 'HP 0'
    this.combat.cancel()
    if (!won) audio.sfx('player/power_down')
    audio.stinger(won ? 'victory' : 'power_down_game_over', true)
    this.kick(7, 90, won ? 0xb4d2d8 : 0xe08a7c, 0.5)
  }

  private quitToTitle(): void {
    if (!this.writeRun()) return
    this.keys.clear()
    this.edges.clear()
    this.newRun(false)
    this.menuBack = 'title'
    this.menu.sync('title', this.meta, 'title')
  }

  private continueRun(): void {
    const save = loadRun()
    if (!save) return
    this.keys.clear()
    this.edges.clear()
    try {
      this.readRun(save)
    } catch {
      clearRun()
      this.newRun(false)
      this.menu.sync('title', this.meta, 'title')
      return
    }
    this.menu.root.visible = false
    this.hud.root.visible = true
  }

  private writeRun(): boolean {
    const world = this.mansion
    const player = this.state.player
    if (!world || player.hp <= 0) return false
    const file: RunFile = {
      v: 1,
      floor: this.run.floor,
      seed: this.run.seed,
      player: {
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        facing: player.facing,
        form: player.form,
        coins: player.coins,
        bolts: player.bolts,
        tank: player.tank,
      },
      run: {
        locked: this.run.locked,
        wavesLeft: this.run.wavesLeft,
        cleared: [...this.run.cleared],
        seen: [...this.run.seen],
        explored: [...this.run.explored],
        looted: [...this.run.looted],
        shrineUsed: this.run.shrineUsed,
        hasKey: this.run.hasKey,
        kills: this.run.kills,
        roomsCleared: this.run.roomsCleared,
        dirt: this.run.dirt,
        timeMs: this.run.timeMs,
        gifted: this.run.gifted,
        mop: this.run.mop,
        vx: this.run.vx,
        vy: this.run.vy,
      },
      progress: this.progress.snap(),
      gates: world.gates.map((gate) => ({ k: gateKey(gate), state: gate.state })),
      seals: this.run.saves.map((save) => ({ k: gateKey(save.gate), state: save.state })),
      decals: this.state.decals.filter((decal) => decal.stage < 3).map((decal) => ({
        id: decal.id,
        x: decal.x,
        y: decal.y,
        stage: decal.stage as 0 | 1 | 2,
        sweeps: decal.sweeps,
        dist: decal.dist,
      })),
      foes: this.state.rivals.filter((rival) => rival.alive && rival.hp > 0).map((rival) => ({
        breed: rival.breed,
        x: rival.x,
        y: rival.y,
        hp: rival.hp,
        facing: rival.facing,
        room: rival.room,
      })),
      pickups: this.state.pickups.filter((pickup) => pickup.alive).map((pickup) => ({
        kind: pickup.kind,
        x: pickup.x,
        y: pickup.y,
      })),
      puddles: this.puddles.filter((puddle) => puddle.stage < 3).map((puddle) => ({
        kind: puddle.kind,
        x: puddle.x,
        y: puddle.y,
        stage: puddle.stage as 0 | 1 | 2,
        sweeps: puddle.sweeps,
        dist: puddle.dist,
      })),
    }
    return saveRun(file)
  }

  private readRun(save: RunFile): void {
    this.progress.applySnap(save.progress)
    this.copyRun(save)
    const kept = this.state.player
    kept.hp = save.player.hp
    kept.maxHp = save.player.maxHp
    kept.coins = save.player.coins
    kept.bolts = save.player.bolts
    kept.tank = save.player.tank
    kept.form = save.player.form
    this.mount(true)
    const player = this.state.player
    player.x = clamp(save.player.x, BODY_RX, worldSize.w - BODY_RX)
    player.y = clamp(save.player.y, BODY_RY, worldSize.h - BODY_RY)
    player.facing = save.player.facing
    this.restoreWorld(save)
    this.state.mode = 'play'
    this.syncActors()
  }

  private copyRun(save: RunFile): void {
    const run = this.run
    run.floor = save.floor
    run.seed = save.seed
    run.locked = save.run.locked
    run.wavesLeft = save.run.wavesLeft
    run.cleared = new Set(save.run.cleared)
    run.seen = new Set(save.run.seen)
    run.explored = new Set(save.run.explored)
    run.looted = new Set(save.run.looted)
    run.shrineUsed = save.run.shrineUsed
    run.hasKey = save.run.hasKey
    run.kills = save.run.kills
    run.roomsCleared = save.run.roomsCleared
    run.dirt = save.run.dirt
    run.timeMs = save.run.timeMs
    run.gifted = save.run.gifted
    run.mop = save.run.mop
    run.vx = save.run.vx
    run.vy = save.run.vy
    run.banked = false
    run.won = false
    run.cause = ''
    run.bannerMs = 0
    run.downMs = 0
    run.cardMs = 0
    run.panel = ''
    run.prices = []
    run.sold = [false, false, false]
    run.saves = []
  }

  private restoreWorld(save: RunFile): void {
    const world = this.mansion
    if (!world) return
    const gates = new Map(save.gates.map((gate) => [gate.k, gate.state]))
    for (const gate of world.gates) {
      const state = gates.get(gateKey(gate))
      if (!state) continue
      gate.state = state
      this.paintDoor(gate)
    }
    for (const seal of save.seals) {
      const gate = world.gates.find((item) => gateKey(item) === seal.k)
      if (gate) this.run.saves.push({ gate, state: seal.state })
    }
    for (const decal of save.decals) this.restoreDecal(decal)
    this.restorePuddles(save.puddles)
    this.showInsides()
    for (const pickup of save.pickups) this.drop(pickup.kind, pickup.x, pickup.y)
    const foes: Rival[] = []
    for (const foe of save.foes) {
      const rival = this.restoreFoe(foe)
      if (rival) foes.push(rival)
    }
    if (this.run.locked >= 0 && !foes.some((rival) => rival.room === this.run.locked && rival.hp > 0)) {
      for (const seal of this.run.saves) {
        seal.gate.state = seal.state
        this.paintDoor(seal.gate)
      }
      this.run.saves = []
      this.run.locked = -1
      this.run.wavesLeft = 0
    }
  }

  private restoreDecal(row: RunFile['decals'][number]): void {
    this.spillAt(row.id, row.x, row.y, row.stage)
    const decal = this.state.decals[this.state.decals.length - 1]
    if (!decal) return
    decal.sweeps = row.sweeps
    decal.dist = row.dist
  }

  private restoreFoe(row: RunFile['foes'][number]): Rival | null {
    const world = this.mansion
    const room = world?.plan.rooms[row.room]
    if (!world || !room) return null
    const foe = placeFoe(this.art, this.foeArt, row.breed, this.run.floor, row.room, row.x, row.y, room)
    if (!foe || foe.hp <= 0) return null
    foe.hp = Math.min(foe.maxHp, row.hp)
    foe.facing = row.facing
    if (isFloorBoss(foe.breed) && foe.hp < foe.maxHp) wakeBoss(foe)
    this.addFoe(foe)
    return foe
  }

  private paintDoor(gate: Gate): void {
    const sprite = this.doorSprites.get(gate)
    if (!sprite) return
    sprite.texture = this.tiles.door(gate.side, gate.state)
    sprite.visible = gate.state === 'sealed' || !gate.bare
  }

  private bank(): void {
    clearRun()
    if (this.run.banked) return
    this.run.banked = true
    const coins = this.state.player.coins
    const share = this.run.won ? coins : Math.floor(coins * 0.5)
    this.meta.coins += share
    this.meta.bolts = this.state.player.bolts
    this.meta.best = Math.max(this.meta.best, this.run.floor)
    saveMeta(this.meta)
  }

  private float(amount: number, x: number, y: number, color = '#e08a7c'): void {
    if (!playOptions.numbers) return
    const sprite = textSprite(String(amount), color, Math.round(x), Math.round(y))
    this.fx.layer.addChild(sprite)
    this.floats.push({ sprite, life: 420 })
  }

  private tickFloats(dtMs: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const item = this.floats[i]
      if (!item) continue
      item.life -= dtMs
      item.sprite.y -= dtMs * 0.02
      if (item.life > 0) continue
      const texture = item.sprite.texture
      item.sprite.destroy()
      texture.destroy(true)
      this.floats.splice(i, 1)
    }
  }

  private addFoe(rival: Rival): void {
    this.state.rivals.push(rival)
    this.actors.addChild(rival.sprite, rival.fx)
    const color = rival.breed === 'head_butler' ? 0xc45a48 : rival.kind === 'elite' ? 0xc48a28 : 0xe08a7c
    const bar = new Graphics().rect(0, 0, 16, 2).fill(color)
    bar.eventMode = 'none'
    bar.roundPixels = true
    bar.visible = false
    this.debugLayer.addChild(bar)
    this.bars.push(bar)
  }

  private syncBars(): void {
    const rivals = this.state.rivals
    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i]
      const rival = rivals[i]
      if (!bar) continue
      if (rival && (isFloorBoss(rival.breed) || rival.breed === 'head_butler')) {
        bar.visible = false
        continue
      }
      const show = !!rival && rival.alive && rival.hp > 0 && rival.hp < rival.maxHp
      bar.visible = show
      if (!show || !rival || rival.maxHp <= 0) continue
      bar.scale.x = Math.max(0, rival.hp / rival.maxHp)
      const top = rival.plain ? rival.y - rival.reach * 2 - 4 : rival.y - 22
      bar.position.set(Math.round(rival.x - 8), Math.round(top))
    }
  }

  /** Entering a room marks that room, and a whole hall chain, explored. */
  private markExplored(id: number): boolean {
    const world = this.mansion
    if (!world || id < 0 || this.run.explored.has(id)) return false
    const members = roomMembers(world, id)
    for (const member of members) {
      this.run.explored.add(member)
      this.run.seen.add(member)
    }
    for (const member of members) {
      for (const near of neighborRooms(world, member)) this.run.seen.add(near)
    }
    return true
  }

  /** Floors and walls stay up. Furniture, stairs, stains, and spills wait until the room opens. */
  private showInsides(): void {
    const world = this.mansion
    if (!world) return
    const open = this.run.explored
    for (const item of this.insides) {
      if (item.room < 0 || open.has(item.room)) item.sprite.visible = true
    }
    for (const puddle of this.puddles) {
      const room = this.tileRoom(Math.floor(puddle.x / MANSION_TILE), Math.floor(puddle.y / MANSION_TILE))
      if (room >= 0 && !open.has(room)) puddle.sprite.visible = false
      else if (puddle.stage < 3) puddle.sprite.visible = true
    }
  }

  private tileRoom(tx: number, ty: number): number {
    const world = this.mansion
    if (!world) return -1
    let hit = -1
    const rooms = world.plan.rooms
    for (let i = 0; i < rooms.length; i++) {
      const rect = roomTileRect(rooms[i])
      if (tx < rect.x || ty < rect.y || tx >= rect.x + rect.w || ty >= rect.y + rect.h) continue
      hit = i
    }
    return hit
  }

  private visit(spawn: boolean): void {
    const world = this.mansion
    if (!world || this.state.mode === 'down' || this.state.mode === 'results') return
    const id = roomAt(world, this.state.player.x, this.state.player.y)
    if (id < 0) return
    const room = world.plan.rooms[id]
    const seals = !!room && hostile(room.role, this.run.floor) && !this.run.cleared.has(id)
    if (!seals && this.markExplored(id)) {
      this.scatter(id)
      this.showInsides()
    }
    if (!spawn || this.state.mode !== 'play') return
    this.noteGate(id, seals)
    if (this.run.locked === id) {
      this.checkClear(id)
      return
    }
    if (this.run.cleared.has(id)) return
    if (!room || !hostile(room.role, this.run.floor)) return
    const player = this.state.player
    const inDoor = world.gates.some((gate) => gateInRoom(world, gate, id) && bodyOnGate(world, player.x, player.y, gate))
    if (inDoor) return
    this.lockRoom(id)
    if (this.markExplored(id)) {
      this.scatter(id)
      this.showInsides()
    }
    this.run.wavesLeft = waveCount(room.role, this.run.floor)
    if (this.spawnWave(id) === 0) this.unlock(id)
  }

  private checkClear(id: number): void {
    const live = this.state.rivals.some((rival) => {
      if (rival.room !== id || !rival.alive) return false
      if (rival.hp > 0) return true
      return isFloorBoss(rival.breed) && rival.act === 'death'
    })
    if (live) return
    if (this.run.wavesLeft > 1) {
      this.run.wavesLeft -= 1
      if (this.spawnWave(id) > 0) return
    }
    this.unlock(id)
  }

  private lockRoom(id: number): void {
    const world = this.mansion
    if (!world) return
    this.run.locked = id
    this.run.saves = []
    let sealed = false
    for (const gate of world.gates) {
      if (!gateInRoom(world, gate, id) || gate.state === 'sealed') continue
      this.run.saves.push({ gate, state: gate.state })
      gate.state = 'sealed'
      sealed = true
      const sprite = this.doorSprites.get(gate)
      if (sprite) {
        sprite.visible = true
        sprite.texture = this.tiles.door(gate.side, 'locked')
      }
    }
    if (sealed) audio.sfx('world/doors_lock')
  }

  /** Snap trap death opens the crystal room. A sealed fight door waits for that clear. */
  private openCrystal(): void {
    const world = this.mansion
    if (!world) return
    const shrines: number[] = []
    for (let i = 0; i < world.plan.rooms.length; i++) {
      if (world.plan.rooms[i]?.role === 'shrine') shrines.push(i)
    }
    if (shrines.length === 0) return
    const onShrine = (gate: Gate): boolean => shrines.some((id) => gateInRoom(world, gate, id))
    for (const gate of world.gates) {
      if (gate.state !== 'locked' || !onShrine(gate)) continue
      gate.state = 'open'
      this.paintDoor(gate)
    }
    for (const save of this.run.saves) {
      if (save.state === 'locked' && onShrine(save.gate)) save.state = 'open'
    }
  }

  private unlock(id: number): void {
    const had = this.run.saves.length > 0
    for (const save of this.run.saves) {
      save.gate.state = save.state
      const sprite = this.doorSprites.get(save.gate)
      if (sprite) {
        sprite.texture = this.tiles.door(save.gate.side, save.state)
        sprite.visible = !save.gate.bare
      }
    }
    this.run.saves = []
    this.run.locked = -1
    if (had) audio.sfx('world/doors_unlock')
    const fresh = !this.run.cleared.has(id)
    if (fresh) {
      this.run.cleared.add(id)
      this.run.roomsCleared += 1
      this.run.bannerMs = 900
      this.progress.addXp(3)
    }
    const room = this.mansion?.plan.rooms[id]
    if (fresh && room && hostile(room.role, this.run.floor) && room.role !== 'boss') audio.stinger('room_clear')
    if (room?.role === 'boss') this.powerDown(true)
  }

  private spawnWave(id: number): number {
    const world = this.mansion
    if (!world) return 0
    const player = this.state.player
    const foes = spawnRoom(
      world, id, this.run.floor, this.run.wavesLeft, this.art, this.foeArt, player.x, player.y,
    )
    for (const foe of foes) this.addFoe(foe)
    return foes.length
  }

  private scatter(id: number): void {
    const world = this.mansion
    const room = world?.plan.rooms[id]
    if (!world || !room) return
    const spots = roomMembers(world, id).flatMap((member) => {
      const part = world.plan.rooms[member]
      return part ? floorPixels(world, part) : []
    })
    const count = 1
    for (let i = 0; i < count; i++) {
      const spot = spots[(i * 3) % Math.max(1, spots.length)]
      const decal = DECAL_IDS[i % DECAL_IDS.length]
      if (!spot || !decal) continue
      this.spillAt(decal, spot.x, spot.y, 0)
    }
  }

  private noteGate(id: number, seals: boolean): void {
    const world = this.mansion
    if (!world) return
    const player = this.state.player
    const on = world.gates.some((gate) => bodyOnGate(world, player.x, player.y, gate))
    if (on === this.onGate) return
    const sealing = seals && !on && this.run.locked !== id && !this.run.cleared.has(id)
    if (this.run.locked !== id) {
      if (on) audio.sfx('world/door_open', 180)
      else if (!sealing) audio.sfx('world/door_close', 180)
    }
    this.onGate = on
  }

  private cueFoes(): void {
    const now = performance.now()
    let hopped = false
    let marched = false
    for (const rival of this.state.rivals) {
      const prev = this.heard.get(rival)
      if (prev !== rival.act) {
        this.heard.set(rival, rival.act)
        if (prev !== undefined || rival.act === 'intro') this.cueAct(rival)
      }
      if (rival.hp <= 0 || !rival.alive) continue
      if (rival.breed === 'dust_bunny') hopped = true
      if (rival.breed === 'tin_soldier' && rival.act === 'march') marched = true
    }
    if (hopped && now >= this.hopAt) {
      this.hopAt = now + 220
      audio.sfx('enemies/dust_bunny_hop')
    }
    if (marched && now >= this.marchAt) {
      this.marchAt = now + 320
      audio.sfx('enemies/tin_soldier_march')
    }
  }

  private cueAct(rival: Rival): void {
    if (isFloorBoss(rival.breed) && rival.act === 'intro') {
      audio.sfx('bosses/boss_intro_card_whoosh')
      return
    }
    if ((rival.act === 'phase' || rival.act === 'phase2' || rival.act === 'phase3') && rival.breed !== 'head_butler') {
      audio.sfx('bosses/boss_phase_break_crash')
      return
    }
    const file = CUE[`${rival.breed}:${rival.act}`]
    if (file) audio.sfx(file)
  }

  private syncAudio(driving: boolean): void {
    audio.wake()
    audio.apply()
    const mode = this.state.mode
    const menuPause = mode === 'pause' || (mode === 'settings' && this.menuBack === 'pause')
    if (mode === 'down' || menuPause || audio.blocked()) audio.hold(true)
    else {
      const track = this.musicTrack()
      if (track) audio.playMusic(track)
    }
    const live = mode === 'play' && this.state.player.hp > 0
    audio.hum(live ? (driving ? 'move' : 'idle') : 'off')
    const max = this.state.player.maxHp
    const ratio = max > 0 ? this.state.player.hp / max : 1
    audio.low(live && ratio > 0 && ratio <= 0.25)
    audio.room(live && !this.liveBoss() ? this.run.floor : 0)
    this.noteButler()
  }

  private musicTrack(): string {
    const mode = this.state.mode
    if (mode === 'title' || mode === 'brief') return 'music/title_theme'
    if (mode === 'hub') return 'music/hub'
    if (mode === 'settings') return this.menuBack === 'hub' ? 'music/hub' : 'music/title_theme'
    if (mode === 'results') return 'stingers/results_screen_loop'
    if (mode === 'shop') return 'music/shop'
    if (this.run.panel === 'shrine') return 'music/shrine'
    const boss = this.liveBoss()
    if (boss) {
      const track = bossMusic(boss)
      if (track) return track
    }
    const world = this.mansion
    if (world && mode === 'play') {
      const id = roomAt(world, this.state.player.x, this.state.player.y)
      const room = id >= 0 ? world.plan.rooms[id] : undefined
      if (room?.role === 'shrine' && this.run.locked < 0) return 'music/shrine'
    }
    return FLOOR_MUSIC[this.run.floor] || 'music/floor1_clock_hall'
  }

  private liveBoss(): Rival | undefined {
    return this.state.rivals.find((rival) => isFloorBoss(rival.breed) && rival.alive && rival.hp > 0)
  }

  private noteButler(): void {
    const boss = this.state.rivals.find((rival) => rival.breed === 'head_butler' && rival.alive && rival.hp > 0)
    if (!boss || boss.maxHp <= 0) {
      this.musicPhase = 0
      return
    }
    const ratio = boss.hp / boss.maxHp
    const phase = ratio < 0.3 ? 3 : ratio < 0.6 ? 2 : 1
    if (this.musicPhase > 0 && phase > this.musicPhase) {
      audio.sfx(phase >= 3 ? 'bosses/boss_phase_break_crash' : 'bosses/head_butler_bell_ring')
    }
    this.musicPhase = phase
  }

  private hintText(): string {
    const world = this.mansion
    const state = this.state
    if (!world || state.mode !== 'play' || this.combat.swing) return ''
    const player = state.player
    if (!this.run.shrineUsed && nearProp(world, 'shrine', player.x, player.y)) return 'E SHRINE'
    if (this.run.floor >= 2 && nearProp(world, 'shop_counter', player.x, player.y)) return 'E SHOP'
    if (this.run.floor < 5 && this.run.locked < 0 && nearProp(world, 'stairs_down', player.x, player.y)) return 'E NEXT FLOOR'
    if (this.run.hasKey) return 'KEY'
    return ''
  }

  private bannerText(): { title: string; sub: string } {
    const mode = this.state.mode
    if (mode === 'results' || mode === 'down') return { title: '', sub: '' }
    if (mode === 'shop') return { title: 'SHOP', sub: '' }
    if (this.run.cardMs > 0) return { title: `FLOOR ${this.run.floor}`, sub: '' }
    if (this.run.bannerMs > 0) return { title: 'CLEAN', sub: '' }
    return { title: '', sub: '' }
  }

  private paintMap(): void {
    const world = this.mansion
    if (!world) return
    const id = roomAt(world, this.state.player.x, this.state.player.y)
    const here = new Set(roomMembers(world, id))
    const frame = Math.floor(performance.now() / 400) % 2
    const canon = id >= 0 ? world.groups[id] : id
    const key = `${[...this.run.seen].sort((a, b) => a - b).join('.')}|${[...this.run.explored].sort((a, b) => a - b).join('.')}|${[...this.run.cleared].sort((a, b) => a - b).join('.')}|${canon}|${frame}`
    if (key === this.mapKey) return
    this.mapKey = key
    const plan = world.plan
    const rooms = plan.rooms
    const cols = plan.cols
    const owner = Array.from({ length: cols * plan.rows }, () => -1)
    for (let index = 0; index < rooms.length; index++) {
      const room = rooms[index]
      for (let y = 0; y < room.h; y++) {
        for (let x = 0; x < room.w; x++) owner[(room.y + y) * cols + room.x + x] = index
      }
    }
    const stateOf = (index: number): MapState | null => {
      if (index < 0 || (!this.run.seen.has(index) && !here.has(index))) return null
      if (this.run.cleared.has(index)) return 'cleared'
      if (this.run.explored.has(index)) return 'explored'
      return 'seen'
    }
    const cells: MapCell[] = []
    for (let index = 0; index < rooms.length; index++) {
      const state = stateOf(index)
      if (!state) continue
      const room = rooms[index]
      const kind = mapKind(room)
      const rim = here.has(index)
      for (let y = 0; y < room.h; y++) {
        for (let x = 0; x < room.w; x++) cells.push({ x: room.x + x, y: room.y + y, kind, state, rim })
      }
    }
    const links: MapLink[] = []
    const at = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= cols || y >= plan.rows) return -1
      return owner[y * cols + x]
    }
    for (let y = 0; y < plan.rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = owner[y * cols + x]
        if (left < 0) continue
        const east = at(x + 1, y)
        if (east >= 0 && (east === left || doorAt(rooms, left, x, y, 'e') || doorAt(rooms, east, x + 1, y, 'w'))) {
          const near = stateOf(left)
          const far = stateOf(east)
          if (near && far) links.push({ x, y, axis: 'h', near, far })
        }
        const south = at(x, y + 1)
        if (south >= 0 && (south === left || doorAt(rooms, left, x, y, 's') || doorAt(rooms, south, x, y + 1, 'n'))) {
          const near = stateOf(left)
          const far = stateOf(south)
          if (near && far) links.push({ x, y, axis: 'v', near, far })
        }
      }
    }
    this.hud.showMap(cells, links, key, cols, frame)
  }

  private resultsInfo() {
    const player = this.state.player
    const run = this.run
    const spec = floorSpec(run.floor)
    const bank = run.won ? player.coins : Math.floor(player.coins * 0.5)
    const icons: Texture[] = []
    for (const id of this.progress.owned()) {
      const icon = this.art.addon.icon[id]
      if (!icon || icons.length >= 7) continue
      icons.push(icon)
    }
    return {
      won: run.won,
      run: `RUN ${this.meta.runs}  SEED ${run.seed}`,
      floor: `${run.floor} ${spec.name}`,
      rooms: String(run.roomsCleared),
      kills: String(run.kills),
      level: `${this.progress.level} ${Math.floor(this.progress.xp)}/${this.progress.need()}`,
      dirt: String(run.dirt),
      coins: String(player.coins),
      bank: String(bank),
      bolts: String(player.bolts),
      time: clock(run.timeMs),
      cause: run.cause,
      icons,
    }
  }

  private runCard() {
    const spec = floorSpec(this.run.floor)
    const icons: Texture[] = []
    for (const id of this.progress.owned()) {
      const icon = this.art.addon.icon[id]
      if (!icon || icons.length >= 6) continue
      icons.push(icon)
    }
    return {
      floor: `${this.run.floor} ${spec.name}`,
      level: String(this.progress.level),
      coins: String(this.state.player.coins),
      bolts: String(this.state.player.bolts),
      time: clock(this.run.timeMs),
      icons,
    }
  }

  private openMenu(page: MenuPage, back?: MenuBack): void {
    if (back) this.menuBack = back
    this.state.mode = page
    this.menu.sync(page, this.meta, this.menuBack, this.runCard())
  }

  private startRun(): void {
    clearRun()
    const player = this.state.player
    player.form = this.meta.form === 'p1' && this.meta.bolts >= 10 ? 'p1' : 'p0'
    player.bolts = this.meta.bolts
    const before = player.maxHp
    if (this.meta.starter && !this.run.gifted) {
      this.run.gifted = true
      this.progress.grantCommon(player)
    }
    this.progress.freeReady = this.meta.reroll
    this.syncStats(before)
    this.meta.runs += 1
    saveMeta(this.meta)
    this.state.mode = 'play'
    audio.stinger('run_start')
  }

  private newRun(play: boolean): void {
    this.mount(false)
    if (play) this.startRun()
    dispatchEvent(new Event('resize'))
  }

  private hubBuyIndex(index: number): void {
    const perk = HUB_PERKS[index]
    if (!perk) return
    const rank = perkRank(this.meta, index)
    const cost = perk.costs[rank]
    if (cost === undefined || this.meta.coins < cost) {
      if (cost !== undefined) audio.sfx('pickups/cant_afford_buzz')
      return
    }
    audio.sfx('pickups/buy_item')
    this.meta.coins -= cost
    if (index === 0) this.meta.reroll = true
    else if (index === 1) this.meta.plating += 1
    else if (index === 2) this.meta.starter = true
    saveMeta(this.meta)
    this.syncStats(this.state.player.maxHp)
    this.menu.sync('hub', this.meta, this.menuBack)
  }

  private toggleForm(): void {
    if (this.meta.bolts < 10) return
    this.meta.form = this.meta.form === 'p1' ? 'p0' : 'p1'
    this.state.player.form = this.meta.form
    saveMeta(this.meta)
    this.syncStats(this.state.player.maxHp)
    this.menu.sync('hub', this.meta, this.menuBack)
  }

  private openShop(): void {
    const player = this.state.player
    const form = player.form === 'p1' ? 1 : 0
    const cards = this.progress.roll(false, form, { quiet: true })
    const mult = floorSpec(this.run.floor).shop_price_mult
    this.run.prices = cards.map((card) => Math.round(SHOP_PRICE[card.rarity] * mult))
    this.run.sold = [false, false, false]
    this.run.panel = 'shop'
    this.state.mode = 'shop'
    const shown = cards.map((card, index) => ({ ...card, price: this.run.prices[index] ?? 0 }))
    this.levelup.open(shown, this.progress.level, this.progress.xp, this.progress.need(), 0, 'SHOP', true, player.coins)
    this.levelup.setView(this.viewW, this.viewH)
  }

  private openShrine(): void {
    this.run.shrineUsed = true
    this.run.panel = 'shrine'
    const form = this.state.player.form === 'p1' ? 1 : 0
    const cards = this.progress.roll(false, form, { shrine: true })
    this.state.mode = 'levelup'
    this.levelup.open(cards, this.progress.level, this.progress.xp, this.progress.need(), this.progress.rerollCost(), 'PICK ONE')
    this.levelup.setView(this.viewW, this.viewH)
  }

  private shopKey(code: string): void {
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW') this.levelup.nudge(-1)
    else if (code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS') this.levelup.nudge(1)
    else if (code === 'Digit1' || code === 'Numpad1') this.buy(0)
    else if (code === 'Digit2' || code === 'Numpad2') this.buy(1)
    else if (code === 'Digit3' || code === 'Numpad3') this.buy(2)
    else if (code === 'Digit4' || code === 'Numpad4') this.repair()
    else if (code === 'KeyE' || code === 'Escape' || code === 'KeyX') {
      audio.ui('back')
      this.run.panel = ''
      this.closeLevel()
    } else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') this.buy(this.levelup.index())
  }

  private buy(index: number): void {
    if (this.run.sold[index]) return
    const price = this.run.prices[index]
    const player = this.state.player
    if (price === undefined || player.coins < price) {
      if (price !== undefined) audio.sfx('pickups/cant_afford_buzz')
      return
    }
    audio.sfx('pickups/buy_item')
    player.coins -= price
    this.levelup.setPurse(player.coins)
    this.run.sold[index] = true
    const before = player.maxHp
    this.progress.take(index, player)
    this.syncStats(before)
    this.levelup.markSold(index)
  }

  private repair(): void {
    const player = this.state.player
    if (player.coins < 20 || player.hp >= player.maxHp) {
      if (player.coins < 20) audio.sfx('pickups/cant_afford_buzz')
      return
    }
    audio.sfx('pickups/buy_item')
    player.coins -= 20
    this.levelup.setPurse(player.coins)
    player.hp = Math.min(player.maxHp, player.hp + 30)
  }

  private descend(): void {
    audio.sfx('world/stairs_down')
    const player = this.state.player
    player.bolts += 1
    this.meta.bolts = player.bolts
    this.meta.best = Math.max(this.meta.best, this.run.floor + 1)
    saveMeta(this.meta)
    this.run.floor += 1
    this.run.shrineUsed = false
    this.run.cleared.clear()
    this.run.explored.clear()
    this.run.seen.clear()
    this.run.looted.clear()
    this.run.locked = -1
    this.run.saves = []
    this.run.wavesLeft = 0
    this.run.cardMs = 1100
    this.mount(true)
  }

  private place(sprite: Sprite, x: number, y: number, ax: number, ay: number): void {
    sprite.position.set(Math.round(x - ax), Math.round(y - ay))
    sprite.zIndex = y
    sprite.roundPixels = true
  }

  /** Contact shadow sits under walls and props. The body keeps the foot sort. */
  private syncShadow(): void {
    const body = this.state.player.sprite
    const shade = this.art.addon.shadow.get(body.texture)
    this.playerShadow.visible = !!shade && body.visible
    if (!shade) return
    this.playerShadow.texture = shade
    this.playerShadow.anchor.copyFrom(body.anchor)
    this.playerShadow.scale.copyFrom(body.scale)
    this.playerShadow.position.copyFrom(body.position)
    this.playerShadow.alpha = body.alpha
    this.playerShadow.zIndex = body.zIndex - 0.5
  }

  private animatePickups(dtMs: number): void {
    for (const pickup of this.state.pickups) {
      if (!pickup.alive) continue
      const box = PICKUP_BOX[pickup.kind]
      pickup.ms += dtMs
      if (pickup.kind === 'bolt') {
        pickup.sprite.texture = this.art.bolt[Math.floor(pickup.ms / 100) % this.art.bolt.length]
      } else if (pickup.mode === 'spin' && pickup.ms >= 90 * 16) {
        pickup.mode = 'shimmer'
        pickup.ms = 0
        pickup.sprite.texture = this.art.coins[pickup.kind].shimmer[0]
      } else if (pickup.mode === 'shimmer') {
        const frames = this.art.coins[pickup.kind].shimmer
        const frame = Math.floor(pickup.ms / 100)
        if (frame >= frames.length) {
          pickup.mode = 'spin'
          pickup.ms = 0
          pickup.sprite.texture = this.art.coins[pickup.kind].spin[0]
        } else {
          pickup.sprite.texture = frames[frame]
        }
      } else {
        const frames = this.art.coins[pickup.kind].spin
        pickup.sprite.texture = frames[Math.floor(pickup.ms / 90) % frames.length]
      }
      pickup.sprite.position.set(Math.round(pickup.x - box.ax), Math.round(pickup.y - box.ay))
    }
  }
}

function nudge(body: { x: number; y: number }, tx: number, ty: number, step: number): void {
  const dx = tx - body.x
  const dy = ty - body.y
  const len = Math.hypot(dx, dy) || 1
  body.x += (dx / len) * step
  body.y += (dy / len) * step
}

function stateFlash(flash: number, iframe: number): number {
  if (flash > 0) return 1
  return blink(iframe)
}
