import upgradeFile from './data/upgrades.json' with { type: 'json' }
import { PLAYER_HP, type Player } from './spec.ts'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface CardDraw {
  id: string
  name: string
  rarity: Rarity
  branch: string
  tier: string
  text: string
  formLine: string
  pips: number
}

interface Effect {
  stat: string
  op: string
  value: number
}

interface Node {
  id: string
  name: string
  branch: string
  tier: number | null
  max_stacks: number | null
  rarity: Rarity
  prereqs: Record<string, number>
  min_form: number
  effects_per_stack: Effect[]
  text: string
}

export interface Aura {
  every: number
  radius: number
}

export interface Stats {
  dirtRate: number
  capacityMul: number
  cleanWidth: number
  dirtVolume: number
  fullSlow: boolean
  pullRadius: number
  frontSlow: number
  moveSpeed: number
  maxHp: number
  contact: number
  knock: number
  regen: number
  shield: boolean
  shieldCd: number
  brush: number
  attackRate: number
  extraHit: number
  crit: number
  critMult: number
  dash: boolean
  dashCd: number
  dashIFrames: number
  /** mot_ram replaces the short dash with the ram combo. */
  dashHitsHard: boolean
  killBolts: number
  haste: number
  hasteTime: number
  dashReset: boolean
  coinPull: number
  cleanXp: number
  coinValue: number
  lucky: number
  dockMul: number
  vortex: boolean
  mixed: boolean
  whirl: Aura | null
  cyclone: Aura | null
  drone: Aura | null
  mark: number
  whirlHit: number
  cycloneHit: number
}

export interface Pulse {
  whirl: boolean
  cyclone: boolean
  drone: boolean
}

export interface ProgressSnap {
  level: number
  xp: number
  pending: number
  dry: number
  rerolls: number
  freeReady: boolean
  shieldUp: boolean
  shieldLeft: number
  dashLeft: number
  hasteLeft: number
  whirlLeft: number
  cycloneLeft: number
  droneLeft: number
  stacks: Record<string, number>
  branchPicks: Record<string, number>
  recent: string[][]
}

const DATA = upgradeFile as unknown as { nodes: Node[] }
const NODES: Node[] = DATA.nodes
const BY_ID = new Map(NODES.map((node) => [node.id, node]))
const BRANCHES = ['suction', 'blades', 'chassis', 'motor', 'tech']
const PITY: Record<string, number> = { rare: 70, epic: 25, legendary: 5 }
const PIPS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 }
const ROMAN = ['I', 'II', 'III', 'IV', 'V']

function snapInt(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, Math.floor(value)))
}

function snapNum(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, value))
}

function emptyStats(): Stats {
  return {
    dirtRate: 1,
    capacityMul: 1,
    cleanWidth: 0,
    dirtVolume: 1,
    fullSlow: true,
    pullRadius: 0,
    frontSlow: 0,
    moveSpeed: 1,
    maxHp: PLAYER_HP,
    contact: 1,
    knock: 1,
    regen: 0,
    shield: false,
    shieldCd: 15,
    brush: 10,
    attackRate: 1,
    extraHit: 0,
    crit: 0,
    critMult: 2,
    dash: false,
    dashCd: 4,
    dashIFrames: 0,
    dashHitsHard: false,
    killBolts: 0,
    haste: 0,
    hasteTime: 0,
    dashReset: false,
    coinPull: 0,
    cleanXp: 1,
    coinValue: 1,
    lucky: 0,
    dockMul: 1,
    vortex: false,
    mixed: false,
    whirl: null,
    cyclone: null,
    drone: null,
    mark: 1,
    whirlHit: 20,
    cycloneHit: 25,
  }
}

function tierLine(node: Node, stacks: number): string {
  const max = node.max_stacks
  const next = stacks + 1
  if (max == null) return 'ONCE'
  if (max <= 1) return 'UNIQUE'
  if (next === 1) return `NEW 1/${max}`
  return `TIER ${ROMAN[next - 1] ?? String(next)} ${next}/${max}`
}

function viewOf(node: Node, stacks: number): CardDraw {
  const branch = node.branch === 'fallback' ? 'GIFT' : node.branch.toUpperCase()
  const formLine = node.rarity === 'legendary' && node.min_form > 0
    ? `NEEDS FORM P${node.min_form}`
    : ''
  return {
    id: node.id,
    name: node.name.slice(0, 14),
    rarity: node.rarity,
    branch,
    tier: tierLine(node, stacks),
    text: node.text,
    formLine,
    pips: PIPS[node.rarity],
  }
}

export class Progress {
  level = 1
  xp = 0
  pending = 0
  dry = 0
  rerolls = 0
  stats: Stats = emptyStats()
  dashLeft = 0
  hasteLeft = 0
  shieldUp = true
  shieldLeft = 0
  whirlLeft = 0
  cycloneLeft = 0
  droneLeft = 0
  freeReady = false
  private stacks: Record<string, number> = {}
  private branchPicks: Record<string, number> = {}
  private recent: string[][] = []
  private offer: Node[] = []

  constructor() {
    this.rebuild()
  }

  need(): number {
    return 12 + 6 * (this.level - 1 + this.pending)
  }

  owned(): string[] {
    const ids: string[] = []
    for (const id of Object.keys(this.stacks)) {
      if ((this.stacks[id] ?? 0) > 0) ids.push(id)
    }
    return ids
  }

  snap(): ProgressSnap {
    return {
      level: this.level,
      xp: this.xp,
      pending: this.pending,
      dry: this.dry,
      rerolls: this.rerolls,
      freeReady: this.freeReady,
      shieldUp: this.shieldUp,
      shieldLeft: this.shieldLeft,
      dashLeft: this.dashLeft,
      hasteLeft: this.hasteLeft,
      whirlLeft: this.whirlLeft,
      cycloneLeft: this.cycloneLeft,
      droneLeft: this.droneLeft,
      stacks: { ...this.stacks },
      branchPicks: { ...this.branchPicks },
      recent: this.recent.map((row) => [...row]),
    }
  }

  applySnap(raw: Partial<ProgressSnap> | null): void {
    const data = raw ?? {}
    this.level = snapInt(data.level, 1, 99, 1)
    this.xp = snapNum(data.xp, 0, 100000, 0)
    this.pending = snapInt(data.pending, 0, 20, 0)
    this.dry = snapInt(data.dry, 0, 99, 0)
    this.rerolls = snapInt(data.rerolls, 0, 99, 0)
    this.freeReady = data.freeReady === true
    this.shieldUp = data.shieldUp !== false
    this.shieldLeft = snapNum(data.shieldLeft, 0, 999, 0)
    this.dashLeft = snapNum(data.dashLeft, 0, 999, 0)
    this.hasteLeft = snapNum(data.hasteLeft, 0, 999, 0)
    this.whirlLeft = snapNum(data.whirlLeft, 0, 999, 0)
    this.cycloneLeft = snapNum(data.cycloneLeft, 0, 999, 0)
    this.droneLeft = snapNum(data.droneLeft, 0, 999, 0)
    this.stacks = {}
    const stacks = data.stacks && typeof data.stacks === 'object' ? data.stacks : {}
    for (const node of NODES) {
      const max = node.max_stacks ?? 0
      const count = snapInt(stacks[node.id], 0, max, 0)
      if (count > 0) this.stacks[node.id] = count
    }
    this.branchPicks = {}
    const picks = data.branchPicks && typeof data.branchPicks === 'object' ? data.branchPicks : {}
    for (const branch of BRANCHES) {
      const count = snapInt(picks[branch], 0, 99, 0)
      if (count > 0) this.branchPicks[branch] = count
    }
    this.recent = []
    const rows = Array.isArray(data.recent) ? data.recent : []
    for (const row of rows.slice(-2)) {
      if (!Array.isArray(row)) continue
      this.recent.push(row.filter((id): id is string => typeof id === 'string' && BRANCHES.includes(id)).slice(0, 4))
    }
    this.offer = []
    this.rebuild()
  }

  addXp(amount: number): void {
    if (amount <= 0) return
    this.xp += amount
    while (this.xp >= this.need() - 1e-6) {
      this.xp -= this.need()
      this.pending += 1
    }
  }

  rerollCost(): number {
    return 10 + 10 * this.rerolls
  }

  /** First offer of a level passes `track` so pity counts once per level, not once per reroll. */
  roll(track: boolean, form: number, opt?: { shrine?: boolean; quiet?: boolean }): CardDraw[] {
    const picked = this.draw(form, opt?.shrine === true)
    this.fixBranch(picked, form)
    const rare = picked.some((node) => node.rarity !== 'common')
    if (!opt?.quiet) {
      if (rare) this.dry = 0
      else if (track) this.dry += 1
    }
    this.recent.push(picked.map((node) => node.branch))
    if (this.recent.length > 2) this.recent.shift()
    this.offer = picked
    return picked.map((node) => viewOf(node, this.stacks[node.id] ?? 0))
  }

  tryReroll(player: Player, free = false): boolean {
    if (free) {
      this.freeReady = false
      return true
    }
    const cost = this.rerollCost()
    if (player.coins < cost) return false
    player.coins -= cost
    this.rerolls += 1
    return true
  }

  grantCommon(player: Player): void {
    const form = player.form === 'p1' ? 1 : 0
    const pool = this.pool(form, new Set()).filter((node) => node.rarity === 'common')
    if (pool.length === 0) return
    const node = pool[Math.floor(Math.random() * pool.length)]
    if (!node) return
    this.offer = [node]
    this.take(0, player)
  }

  skip(player: Player): void {
    player.coins += 5
  }

  take(index: number, player: Player): void {
    const node = this.offer[index]
    if (!node) return
    if (node.id === 'fb_coins') {
      player.coins += 20
      return
    }
    if (node.id === 'fb_repair') {
      const heal = Math.max(1, Math.round(player.maxHp * 0.5))
      player.hp = Math.min(player.maxHp, player.hp + heal)
      return
    }
    this.stacks[node.id] = (this.stacks[node.id] ?? 0) + 1
    this.branchPicks[node.branch] = (this.branchPicks[node.branch] ?? 0) + 1
    this.rebuild()
  }

  onKill(): void {
    if (this.stats.haste > 0) this.hasteLeft = this.stats.hasteTime
    if (this.stats.dashReset) this.dashLeft = 0
  }

  tick(dt: number): Pulse {
    const pulse: Pulse = { whirl: false, cyclone: false, drone: false }
    if (this.dashLeft > 0) this.dashLeft = Math.max(0, this.dashLeft - dt)
    if (this.hasteLeft > 0) this.hasteLeft = Math.max(0, this.hasteLeft - dt)
    if (this.stats.shield && !this.shieldUp) {
      this.shieldLeft -= dt
      if (this.shieldLeft <= 0) this.shieldUp = true
    }
    pulse.whirl = this.arm('whirl', dt)
    pulse.cyclone = this.arm('cyclone', dt)
    return pulse
  }

  speedMul(): number {
    const haste = this.hasteLeft > 0 ? 1 + this.stats.haste : 1
    return this.stats.moveSpeed * haste
  }

  private arm(slot: 'whirl' | 'cyclone' | 'drone', dt: number): boolean {
    const aura = this.stats[slot]
    if (!aura) return false
    const key = slot === 'whirl' ? 'whirlLeft' : slot === 'cyclone' ? 'cycloneLeft' : 'droneLeft'
    this[key] -= dt
    if (this[key] > 0) return false
    this[key] += aura.every
    return true
  }

  private weights(): Record<string, number> {
    const boost = 1 + 0.25 * this.stats.lucky
    return { common: 60, rare: 28 * boost, epic: 10 * boost, legendary: 2 * boost }
  }

  private pool(form: number, skip: Set<string>): Node[] {
    return NODES.filter((node) => {
      if (node.max_stacks == null) return false
      if (node.id === 'tec_map' || node.id === 'suc_tank' || node.id === 'suc_compactor' || node.id === 'tec_dock') return false
      if (node.id === 'mot_dash' || node.id === 'mot_quick' || node.id === 'mot_ram' || node.id === 'tec_scanner') return false
      if (node.id === 'tec_drone') return false
      if (skip.has(node.id)) return false
      if ((this.stacks[node.id] ?? 0) >= node.max_stacks) return false
      if (node.min_form > form) return false
      for (const [id, need] of Object.entries(node.prereqs)) {
        if (id === 'tec_scanner' || id === 'tec_drone') continue
        if ((this.stacks[id] ?? 0) < need) return false
      }
      return true
    })
  }

  private draw(form: number, shrine: boolean): Node[] {
    const forced = shrine || this.dry >= 3
    const picked: Node[] = []
    const used = new Set<string>()
    for (let slot = 0; slot < 3; slot++) {
      const pool = this.pool(form, used)
      if (pool.length === 0) {
        picked.push(this.fallback(picked.length))
        continue
      }
      const weights = slot === 0 && forced ? PITY : this.weights()
      const rarity = this.pickRarity(pool, weights)
      const group = pool.filter((node) => node.rarity === rarity)
      const node = group[Math.floor(Math.random() * group.length)] ?? pool[0]
      picked.push(node)
      used.add(node.id)
    }
    return picked
  }

  private pickRarity(pool: Node[], weights: Record<string, number>): string {
    const have = new Set<string>(pool.map((node) => node.rarity))
    let entries = Object.entries(weights).filter(([rarity, weight]) => have.has(rarity) && weight > 0)
    if (entries.length === 0) {
      entries = Object.entries(this.weights()).filter(([rarity, weight]) => have.has(rarity) && weight > 0)
    }
    const sum = entries.reduce((total, [, weight]) => total + weight, 0)
    let roll = Math.random() * sum
    for (const [rarity, weight] of entries) {
      roll -= weight
      if (roll <= 0) return rarity
    }
    return entries[entries.length - 1]?.[0] ?? 'common'
  }

  private fallback(index: number): Node {
    const id = index % 2 === 0 ? 'fb_coins' : 'fb_repair'
    return BY_ID.get(id) ?? NODES[0]
  }

  private fixBranch(picked: Node[], form: number): void {
    if (picked.length < 3) return
    if (picked.some((node) => node.branch === 'fallback')) return
    const same = picked.every((node) => node.branch === picked[0].branch)
    const missed = this.recent.length >= 2 && BRANCHES.some((branch) => {
      if ((this.branchPicks[branch] ?? 0) > 0) return false
      return this.recent.every((offer) => !offer.includes(branch))
    })
    if (!same && !missed) return
    const skip = new Set(picked.slice(0, 2).map((node) => node.id))
    const pool = this.pool(form, skip).filter((node) => node.branch !== 'fallback')
    if (pool.length === 0) return
    const branches = [...new Set(pool.map((node) => node.branch))]
    branches.sort((a, b) => (this.branchPicks[a] ?? 0) - (this.branchPicks[b] ?? 0) || a.localeCompare(b))
    const least = branches[0]
    const group = pool.filter((node) => node.branch === least)
    if (group.length === 0) return
    picked[2] = group[Math.floor(Math.random() * group.length)]
  }

  private rebuild(): void {
    const stats = emptyStats()
    let armor = 0
    let omni = false
    let dashBase = 4
    let dashAdd = 0
    let whirlEvery = 0
    let whirlRadius = 28
    let cycloneEvery = 0
    let cycloneRadius = 48
    let droneEvery = 0
    let droneRadius = 64
    for (const node of NODES) {
      const stacks = this.stacks[node.id] ?? 0
      if (stacks <= 0) continue
      for (const effect of node.effects_per_stack) {
        const value = effect.value
        switch (effect.stat) {
          case 'dirt_pickup_rate':
            stats.dirtRate = 1 + value * stacks
            break
          case 'tank_capacity':
            stats.capacityMul = 1 + value * stacks
            break
          case 'clean_width':
            stats.cleanWidth = value * stacks
            break
          case 'dirt_volume':
            stats.dirtVolume = Math.max(0.2, 1 + value * stacks)
            break
          case 'full_slowdown':
            stats.fullSlow = false
            break
          case 'pull_radius':
            stats.pullRadius = value * stacks
            stats.vortex = true
            break
          case 'front_enemy_slow':
            stats.frontSlow = value * stacks
            stats.vortex = true
            break
          case 'move_speed':
            stats.moveSpeed = 1 + value * stacks
            break
          case 'max_hp':
            if (effect.op === 'add') armor += value * stacks
            else omni = true
            break
          case 'contact_damage_taken':
            stats.contact = Math.max(0.1, 1 + value * stacks)
            break
          case 'knockback_taken':
            stats.knock = Math.max(0, 1 + value * stacks)
            break
          case 'hp_regen':
            stats.regen = value * stacks
            break
          case 'shield_hits':
            stats.shield = true
            break
          case 'shield_recharge':
            stats.shieldCd = value
            break
          case 'brush_damage':
            stats.brush *= 1 + value * stacks
            break
          case 'attack_rate':
            stats.attackRate = 1 + value * stacks
            break
          case 'extra_brushes':
            stats.extraHit += value * stacks
            break
          case 'crit_chance':
            stats.crit = value * stacks
            break
          case 'crit_mult':
            stats.critMult = value
            break
          case 'dash_distance':
            // 48px in the sheet. Travel follows the attack art instead. This flag unlocks the move.
            stats.dash = true
            break
          case 'dash_cooldown':
            if (effect.op === 'set') dashBase = value
            else dashAdd += value * stacks
            stats.dash = true
            break
          case 'dash_iframes':
            stats.dashIFrames = value
            break
          case 'dash_damage':
            stats.dashHitsHard = true
            break
          case 'kill_bolts':
            stats.killBolts += value * stacks
            break
          case 'kill_haste':
            stats.haste = value
            break
          case 'kill_haste_time':
            stats.hasteTime = value
            break
          case 'kill_dash_reset':
            stats.dashReset = true
            break
          case 'coin_pull_radius':
            stats.coinPull = value * stacks
            break
          case 'clean_xp':
            stats.cleanXp = 1 + value * stacks
            break
          case 'coin_value':
            stats.coinValue = 1 + value * stacks
            break
          case 'rare_weight':
            stats.lucky = stacks
            break
          case 'dock_empty_time':
            stats.dockMul = Math.max(0.25, 1 + value * stacks)
            break
          case 'spin_interval':
            whirlEvery = value
            break
          case 'spin_radius':
            whirlRadius = value
            break
          case 'spin_damage':
            stats.whirlHit = value
            break
          case 'cyclone_interval':
            cycloneEvery = value
            break
          case 'cyclone_radius':
            cycloneRadius = value
            break
          case 'cyclone_damage':
            stats.cycloneHit = value
            break
          case 'drone_interval':
            droneEvery = value
            break
          case 'drone_radius':
            droneRadius = value
            break
          case 'mark_damage':
            stats.mark = 1 + value
            break
          default:
            break
        }
      }
    }
    stats.maxHp = PLAYER_HP + armor
    if (omni) stats.maxHp = Math.max(1, Math.round(stats.maxHp * 1.5))
    stats.dashCd = Math.max(0.4, dashBase + dashAdd)
    stats.mixed = stats.dash && stats.vortex
    if (whirlEvery > 0) stats.whirl = { every: whirlEvery, radius: whirlRadius }
    if (cycloneEvery > 0) stats.cyclone = { every: cycloneEvery, radius: cycloneRadius }
    if (droneEvery > 0) stats.drone = { every: droneEvery, radius: droneRadius }
    this.stats = stats
    if (stats.whirl && this.whirlLeft <= 0) this.whirlLeft = stats.whirl.every
    if (stats.cyclone && this.cycloneLeft <= 0) this.cycloneLeft = stats.cyclone.every
    if (stats.drone && this.droneLeft <= 0) this.droneLeft = stats.drone.every
  }
}
