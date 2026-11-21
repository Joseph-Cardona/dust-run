import { Assets, CanvasSource, Rectangle, Texture, type Spritesheet } from 'pixi.js'
import { bossCanvas, bossRows } from './bosses.ts'
import upgradeFile from './data/upgrades.json' with { type: 'json' }
import { DECAL_IDS, FACINGS, type DecalId, type Facing, type FloorId, type FormId } from './spec.ts'

export interface RivalArt {
  glide: Record<Facing, Texture[]>
  settle: Record<Facing, Texture[]>
}

export interface Clip {
  body: Texture[]
  fx: Texture[]
}

export type AttackId = 'brush-spin' | 'dash-ram' | 'suction-pull' | 'shield-parry'
export type ComboId = 'brush-combo' | 'ram-combo' | 'mixed-combo'
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface Addon {
  glide: Record<Facing, Texture[]>
  settle: Record<Facing, Texture[]>
  attack: Record<AttackId, Record<Facing, Clip>>
  combo: Record<ComboId, Record<Facing, Clip>>
  hitBody: Record<Facing, Texture[]>
  hitFx: Record<Facing, Texture[]>
  deathBody: Record<Facing, Texture[]>
  deathFx: Record<Facing, Texture[]>
  icon: Record<string, Texture>
  card: Record<CardRarity, Texture>
  cardBack: Texture
  title: Texture
  xpBar: Texture
  btnReroll: Texture
  btnSkip: Texture
  fontMini: Texture
  fontSans: Texture
  /** Body texture with the contact shadow removed -> that shadow, same frame. */
  shadow: Map<Texture, Texture>
}

export interface FoeSheet {
  idle: Record<Facing, Texture[]>
  move: Record<Facing, Texture[]>
  attack: Record<Facing, Texture[]>
  hit: Record<Facing, Texture[]>
  attackFx: Record<Facing, Texture[]>
  hitFx: Record<Facing, Texture[]>
}

export interface SoldierArt extends FoeSheet {
  cork: Texture
}

export interface ToasterArt extends FoeSheet {
  toast: Texture[]
}

export const MAP_KINDS = ['start', 'combat', 'elite', 'treasure', 'shrine', 'dock', 'shop', 'stairs', 'boss'] as const
export type MapRoomKind = (typeof MAP_KINDS)[number]
export type MapState = 'seen' | 'explored' | 'cleared'

export interface MiniMapArt {
  room: Record<MapRoomKind, Record<MapState, Texture>>
  hall: Texture
}

export interface HudArt {
  hpIcon: Texture
  pills: Texture[]
  chip: Texture
  chipFlash: Texture
  xpTrack: Texture
  xpFlash: Texture
}

export interface DeathArt {
  body: Record<Facing, Texture[]>
  fx: Record<Facing, Texture[]>
}

export interface ResultsArt {
  panel: Texture
  win: Texture
  banner: Texture
}

export interface Art {
  floor: Record<FloorId, Texture>
  wall: Texture
  shade: Texture
  glare: Texture
  player: Record<FormId, Texture[]>
  /** In-run p1 frames. Menu keeps `player.p1`, which still has the baked shadow. */
  p1Play: Texture[]
  rival: Record<'std' | 'elite', RivalArt>
  soldier: SoldierArt
  mop: FoeSheet
  trap: FoeSheet
  toaster: ToasterArt
  dust: Texture[]
  dirt: Record<DecalId, [Texture, Texture, Texture]>
  coins: Record<'silver' | 'gold' | 'premium', { spin: Texture[]; shimmer: Texture[] }>
  bolt: Texture[]
  popGold: Texture[]
  popSteel: Texture[]
  dock: { idle: Texture[]; empty: Texture[]; after: Texture[] }
  meterBase: Texture
  meterSeg: Texture
  meterDrain: Texture
  meterWarn: Texture[]
  meterFull: Texture[]
  addon: Addon
  minimap: MiniMapArt
  hud: HudArt
  death: DeathArt
  results: ResultsArt
}

function crisp(tex: Texture): Texture {
  tex.source.scaleMode = 'nearest'
  tex.source.autoGenerateMipmaps = false
  return tex
}

function take(alias: string): Texture {
  return crisp(Assets.get(alias))
}

function seq(alias: string, count: number): Texture[] {
  return Array.from({ length: count }, (_, i) => take(`${alias}${i}`))
}

function dot(tex: Texture): Texture {
  return new Texture({
    source: tex.source,
    frame: new Rectangle(0, 0, 10, 9),
  })
}

const FOE_IDS = [
  'dust_bunny', 'snap_trap', 'rogue_mop', 'toaster', 'tin_soldier',
  'sheet_ghost', 'chandelier', 'vacuum_brute', 'head_butler',
] as const

export interface BossClip {
  body: Texture[]
  fx: Texture[]
}

export interface BossBook {
  footX: number
  footY: number
  clips: Record<string, BossClip>
}

export interface ShotArt {
  frames: Texture[]
  ms: number
  loop: boolean
}

export interface BossBars {
  bodies: Texture[]
  name: Texture
  gems: number
  gemOk: Texture
  gemLost: Texture
}

export interface BossArt {
  books: Record<string, BossBook>
  shots: Record<string, ShotArt>
  cards: Record<string, Texture>
  bars: Record<string, BossBars>
  chestClosed: Texture
  chestOpen: Texture
}

const BOSS_IDS = ['grandfather', 'laundry_golem', 'old_boiler', 'sentry_prime'] as const
const BAR_IDS = [...BOSS_IDS, 'head_butler'] as const
const BAR_NAMES: Record<(typeof BAR_IDS)[number], string> = {
  grandfather: 'name-the-grandfather',
  laundry_golem: 'name-the-laundry-golem',
  old_boiler: 'name-the-old-boiler',
  sentry_prime: 'name-sentry-prime',
  head_butler: 'name-the-head-butler',
}
const SHOTS: { id: string; w: number; h: number; frames: number; ms: number; loop: boolean }[] = [
  { id: 'gear', w: 20, h: 20, frames: 4, ms: 70, loop: true },
  { id: 'chime', w: 96, h: 40, frames: 6, ms: 90, loop: true },
  { id: 'foam', w: 48, h: 24, frames: 6, ms: 90, loop: true },
  { id: 'sock', w: 20, h: 20, frames: 4, ms: 70, loop: true },
  { id: 'coal', w: 18, h: 18, frames: 4, ms: 70, loop: true },
  { id: 'ember', w: 40, h: 20, frames: 6, ms: 90, loop: true },
  { id: 'bolt', w: 20, h: 16, frames: 4, ms: 70, loop: true },
  { id: 'grid', w: 96, h: 48, frames: 8, ms: 90, loop: false },
]

export async function loadBossArt(): Promise<BossArt> {
  const jobs: { alias: string; src: string }[] = []
  for (const id of BOSS_IDS) {
    jobs.push({ alias: `boss-${id}-body`, src: `assets/addon2/bosses/sheets/${id}_sheet.png` })
    jobs.push({ alias: `boss-${id}-fx`, src: `assets/addon2/bosses/sheets/${id}_fx.png` })
  }
  for (const id of BAR_IDS) {
    jobs.push({ alias: `boss-card-${id}`, src: `assets/addon2/bosses/ui/card-${id}.png` })
    jobs.push({ alias: `boss-bar-name-${id}`, src: `assets/addon2/bosses/ui/bars/${BAR_NAMES[id]}.png` })
  }
  for (const kind of ['2ph', '3ph'] as const) {
    const folder = kind === '2ph' ? 'body-2phase' : 'body-3phase'
    for (let pct = 0; pct <= 100; pct++) {
      const n = String(pct).padStart(3, '0')
      jobs.push({
        alias: `boss-bar-${kind}-${n}`,
        src: `assets/addon2/bosses/ui/bars/${folder}/bar-body-${kind}-${n}.png`,
      })
    }
  }
  jobs.push({ alias: 'boss-bar-gem-ok', src: 'assets/addon2/bosses/ui/bars/gem-ok.png' })
  jobs.push({ alias: 'boss-bar-gem-lost', src: 'assets/addon2/bosses/ui/bars/gem-lost.png' })
  for (const shot of SHOTS) jobs.push({ alias: `boss-shot-${shot.id}`, src: `assets/addon2/bosses/shots/${shot.id}.png` })
  jobs.push({ alias: 'boss-chest-closed', src: 'assets/addon2/bosses/ui/chest-closed.png' })
  jobs.push({ alias: 'boss-chest-open', src: 'assets/addon2/bosses/ui/chest-open.png' })
  await Assets.load(jobs.map((job) => ({
    ...job,
    data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
  })))
  const books: Record<string, BossBook> = {}
  for (const id of BOSS_IDS) {
    const canvas = bossCanvas(id)
    const body = crisp(Assets.get<Texture>(`boss-${id}-body`))
    const fx = crisp(Assets.get<Texture>(`boss-${id}-fx`))
    const clips: Record<string, BossClip> = {}
    if (canvas) {
      for (const row of bossRows(id)) {
        clips[row.anim] = {
          body: sheetRow(body, row.row, row.frames, canvas.w, canvas.h),
          fx: sheetRow(fx, row.row, row.frames, canvas.w, canvas.h),
        }
      }
    }
    books[id] = { footX: canvas?.footX ?? 0, footY: canvas?.footY ?? 0, clips }
  }
  const cards: Record<string, Texture> = {}
  const bars: Record<string, BossBars> = {}
  const two: Texture[] = []
  const three: Texture[] = []
  for (let pct = 0; pct <= 100; pct++) {
    const n = String(pct).padStart(3, '0')
    two.push(crisp(Assets.get<Texture>(`boss-bar-2ph-${n}`)))
    three.push(crisp(Assets.get<Texture>(`boss-bar-3ph-${n}`)))
  }
  const gemOk = crisp(Assets.get<Texture>('boss-bar-gem-ok'))
  const gemLost = crisp(Assets.get<Texture>('boss-bar-gem-lost'))
  for (const id of BAR_IDS) {
    cards[id] = crisp(Assets.get<Texture>(`boss-card-${id}`))
    bars[id] = {
      bodies: id === 'grandfather' ? two : three,
      name: crisp(Assets.get<Texture>(`boss-bar-name-${id}`)),
      gems: id === 'grandfather' ? 2 : 3,
      gemOk,
      gemLost,
    }
  }
  const shots: Record<string, ShotArt> = {}
  for (const shot of SHOTS) {
    const sheet = crisp(Assets.get<Texture>(`boss-shot-${shot.id}`))
    shots[shot.id] = {
      frames: sheetRow(sheet, 0, shot.frames, shot.w, shot.h),
      ms: shot.ms,
      loop: shot.loop,
    }
  }
  return {
    books,
    shots,
    cards,
    bars,
    chestClosed: crisp(Assets.get<Texture>('boss-chest-closed')),
    chestOpen: crisp(Assets.get<Texture>('boss-chest-open')),
  }
}

export async function loadFoeArt(): Promise<Record<string, Texture>> {
  await Assets.load(FOE_IDS.map((id) => ({
    alias: `foe-${id}`,
    src: `assets/addon2/enemies/${id}.png`,
    data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
  })))
  const out: Record<string, Texture> = {}
  for (const id of FOE_IDS) {
    const tex = Assets.get<Texture>(`foe-${id}`)
    tex.source.scaleMode = 'nearest'
    tex.source.autoGenerateMipmaps = false
    out[id] = tex
  }
  return out
}

export async function loadArt(): Promise<Art> {
  const jobs: { alias: string; src: string }[] = []
  const add = (alias: string, src: string) => jobs.push({ alias, src })

  for (const id of ['a', 'b', 'c', 'd', 'e', 'f'] as const) add(`floor-${id}`, `assets/floor/${id}.png`)
  add('wall', 'assets/wall.png')
  add('shade', 'assets/shade.png')
  add('glare', 'assets/glare.png')
  for (const form of ['p0', 'p1'] as const) {
    for (let i = 0; i < 6; i++) add(`player-${form}-${i}`, `assets/player/${form}/${i}.png`)
  }
  for (const kind of ['std', 'elite'] as const) {
    for (const face of FACINGS) {
      for (let i = 0; i < 6; i++) add(`rival-${kind}-glide_${face}-${i}`, `assets/rival/${kind}/glide_${face}_${i}.png`)
      for (let i = 0; i < 4; i++) add(`rival-${kind}-settle_${face}-${i}`, `assets/rival/${kind}/settle_${face}_${i}.png`)
    }
  }
  for (let i = 0; i < 6; i++) add(`dust-${i}`, `assets/dust/${i}.png`)
  for (const id of DECAL_IDS) {
    for (let stage = 0; stage < 3; stage++) add(`dirt-${id}-${stage}`, `assets/dirt/${id}_${stage}.png`)
  }
  for (const kind of ['silver', 'gold', 'premium'] as const) {
    for (let i = 0; i < 8; i++) {
      add(`coin-${kind}-spin-${i}`, `assets/coin/${kind}/spin_${i}.png`)
      add(`coin-${kind}-shimmer-${i}`, `assets/coin/${kind}/shimmer_${i}.png`)
    }
  }
  for (let i = 0; i < 6; i++) {
    add(`bolt-${i}`, `assets/coin/bolt/spin_${i}.png`)
    add(`pop-gold-${i}`, `assets/pop/gold_${i}.png`)
    add(`pop-steel-${i}`, `assets/pop/steel_${i}.png`)
  }
  for (let i = 0; i < 6; i++) {
    add(`dock-idle-${i}`, `assets/dock/idle_${i}.png`)
    add(`dock-after-${i}`, `assets/dock/after_${i}.png`)
  }
  for (let i = 0; i < 16; i++) add(`dock-empty-${i}`, `assets/dock/empty_${i}.png`)
  add('meter-base', 'assets/meter/base.png')
  add('meter-seg', 'assets/meter/seg.png')
  add('meter-drain', 'assets/meter/drain.png')
  for (let i = 0; i < 4; i++) {
    add(`meter-warn-${i}`, `assets/meter/warn_${i}.png`)
    add(`meter-full-${i}`, `assets/meter/full_${i}.png`)
  }
  for (const kind of MAP_KINDS) {
    for (const state of ['seen', 'explored', 'cleared'] as const) {
      add(`map-${kind}-${state}`, `assets/addon2/ui/minimap/69-room_${kind}_${state}.png`)
    }
  }
  add('map-hall', 'assets/addon2/ui/minimap/69-room_hall.png')
  add('hp-icon', 'assets/addon2/ui/hud/70-hp-icon.png')
  for (let i = 0; i <= 10; i++) {
    const step = String(i * 10).padStart(3, '0')
    add(`hp-pill-${step}`, `assets/addon2/ui/hud/70-hp-pill_${step}.png`)
  }
  add('lv-chip', 'assets/addon2/ui/hud/70-lv-chip.png')
  add('lv-chip-flash', 'assets/addon2/ui/hud/70-lv-chip-flash.png')
  add('xp-track', 'assets/addon2/ui/hud/70-xp-bar_000.png')
  add('xp-flash', 'assets/addon2/ui/hud/70-xp-bar_flash.png')
  add('results-panel', 'assets/addon2/ui/results/74-results-panel.png')
  add('results-win', 'assets/addon2/ui/results/74-results-panel_win.png')
  add('results-banner', 'assets/addon2/ui/results/74-banner-room-clear.png')
  for (const face of FACINGS) {
    for (let i = 0; i < 18; i++) {
      const frame = String(i).padStart(2, '0')
      add(`die-${face}-${frame}`, `assets/addon2/ui/death/power-down_${face}_${frame}.png`)
      add(`die-${face}-${frame}-fx`, `assets/addon2/ui/death/power-down_${face}_${frame}_fx.png`)
    }
  }

  await Assets.load(jobs.map((job) => ({
    alias: job.alias,
    src: job.src,
    data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
  })))

  const book = (kind: 'std' | 'elite'): RivalArt => {
    const glide = {} as Record<Facing, Texture[]>
    const settle = {} as Record<Facing, Texture[]>
    for (const face of FACINGS) {
      glide[face] = seq(`rival-${kind}-glide_${face}-`, 6)
      settle[face] = seq(`rival-${kind}-settle_${face}-`, 4)
    }
    return { glide, settle }
  }

  const dirt = {} as Art['dirt']
  for (const id of DECAL_IDS) {
    dirt[id] = [take(`dirt-${id}-0`), take(`dirt-${id}-1`), take(`dirt-${id}-2`)]
  }

  const coins = {} as Art['coins']
  for (const kind of ['silver', 'gold', 'premium'] as const) {
    coins[kind] = {
      spin: seq(`coin-${kind}-spin-`, 8),
      shimmer: seq(`coin-${kind}-shimmer-`, 8),
    }
  }

  const floor = {} as Art['floor']
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f'] as const) floor[id] = take(`floor-${id}`)

  const addon = await loadAddon()
  const soldier = await loadSoldier()
  const mop = await loadMop()
  const trap = await loadTrap()
  const toaster = await loadToaster()
  const p1 = seq('player-p1-', 6)
  const p1Play = p1.slice()
  for (const [body, shade] of peelContactShadows([p1Play])) addon.shadow.set(body, shade)

  return {
    floor,
    wall: take('wall'),
    shade: take('shade'),
    glare: take('glare'),
    player: {
      p0: seq('player-p0-', 6),
      p1,
    },
    p1Play,
    rival: { std: book('std'), elite: book('elite') },
    soldier,
    mop,
    trap,
    toaster,
    dust: seq('dust-', 6),
    dirt,
    coins,
    bolt: seq('bolt-', 6),
    popGold: seq('pop-gold-', 6),
    popSteel: seq('pop-steel-', 6),
    dock: {
      idle: seq('dock-idle-', 6),
      empty: seq('dock-empty-', 16),
      after: seq('dock-after-', 6),
    },
    meterBase: take('meter-base'),
    meterSeg: take('meter-seg'),
    meterDrain: take('meter-drain'),
    meterWarn: seq('meter-warn-', 4).map(dot),
    meterFull: seq('meter-full-', 4).map(dot),
    addon,
    minimap: {
      room: Object.fromEntries(MAP_KINDS.map((kind) => [kind, {
        seen: take(`map-${kind}-seen`),
        explored: take(`map-${kind}-explored`),
        cleared: take(`map-${kind}-cleared`),
      }])) as MiniMapArt['room'],
      hall: take('map-hall'),
    },
    hud: {
      hpIcon: take('hp-icon'),
      pills: Array.from({ length: 11 }, (_, i) => take(`hp-pill-${String(i * 10).padStart(3, '0')}`)),
      chip: take('lv-chip'),
      chipFlash: take('lv-chip-flash'),
      xpTrack: take('xp-track'),
      xpFlash: take('xp-flash'),
    },
    death: deathBook(),
    results: {
      panel: take('results-panel'),
      win: take('results-win'),
      banner: take('results-banner'),
    },
  }
}

function deathBook(): DeathArt {
  const body = {} as Record<Facing, Texture[]>
  const fx = {} as Record<Facing, Texture[]>
  for (const face of FACINGS) {
    body[face] = []
    fx[face] = []
    for (let i = 0; i < 18; i++) {
      const frame = String(i).padStart(2, '0')
      body[face].push(take(`die-${face}-${frame}`))
      fx[face].push(take(`die-${face}-${frame}-fx`))
    }
  }
  return { body, fx }
}

function sheetRow(sheet: Texture, row: number, count: number, w: number, h: number): Texture[] {
  return Array.from({ length: count }, (_, i) => new Texture({
    source: sheet.source,
    frame: new Rectangle(i * w, row * h, w, h),
  }))
}

function facingBook(sheet: Texture, row0: number, count: number, w: number, h: number): Record<Facing, Texture[]> {
  const book = {} as Record<Facing, Texture[]>
  FACINGS.forEach((face, index) => {
    book[face] = sheetRow(sheet, row0 + index, count, w, h)
  })
  return book
}

function cutSheet(body: Texture, fx: Texture, w: number, h: number, idle: number, move: number, attack: number, hit: number): FoeSheet {
  return {
    idle: facingBook(body, 0, idle, w, h),
    move: facingBook(body, 4, move, w, h),
    attack: facingBook(body, 8, attack, w, h),
    hit: facingBook(body, 12, hit, w, h),
    attackFx: facingBook(fx, 8, attack, w, h),
    hitFx: facingBook(fx, 12, hit, w, h),
  }
}

async function loadSoldier(): Promise<SoldierArt> {
  await Assets.load([
    {
      alias: 'soldier-body',
      src: 'assets/addon2/enemies/tin_soldier_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
    {
      alias: 'soldier-fx',
      src: 'assets/addon2/enemies/tin_soldier_fx_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
  ])
  const body = crisp(take('soldier-body'))
  const fx = crisp(take('soldier-fx'))
  return {
    ...cutSheet(body, fx, 42, 72, 4, 8, 11, 6),
    cork: corkSquare(),
  }
}

/** 4×4 gold square. The right column is the lighter face, so a turn shows the shot direction. */
function corkSquare(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const image = ctx.createImageData(4, 4)
  const data = image.data
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4
      const front = x === 3
      data[i] = front ? 224 : 200
      data[i + 1] = front ? 188 : 156
      data[i + 2] = front ? 112 : 76
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return new Texture({
    source: new CanvasSource({
      resource: canvas,
      resolution: 1,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      autoDensity: false,
    }),
  })
}

async function loadMop(): Promise<FoeSheet> {
  await Assets.load([
    {
      alias: 'mop-body',
      src: 'assets/addon2/enemies/rogue_mop_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
    {
      alias: 'mop-fx',
      src: 'assets/addon2/enemies/rogue_mop_fx_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
  ])
  return cutSheet(crisp(take('mop-body')), crisp(take('mop-fx')), 50, 78, 6, 6, 13, 6)
}

async function loadTrap(): Promise<FoeSheet> {
  await Assets.load([
    {
      alias: 'trap-body',
      src: 'assets/addon2/enemies/snap_trap_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
    {
      alias: 'trap-fx',
      src: 'assets/addon2/enemies/snap_trap_fx_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
  ])
  return cutSheet(crisp(take('trap-body')), crisp(take('trap-fx')), 36, 54, 4, 7, 13, 6)
}

async function loadToaster(): Promise<ToasterArt> {
  await Assets.load([
    {
      alias: 'toaster-body',
      src: 'assets/addon2/enemies/toaster_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
    {
      alias: 'toaster-fx',
      src: 'assets/addon2/enemies/toaster_fx_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
    {
      alias: 'toast-spin',
      src: 'assets/addon2/enemies/toast_sheet.png',
      data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
    },
  ])
  const body = crisp(take('toaster-body'))
  const fx = crisp(take('toaster-fx'))
  const spin = crisp(take('toast-spin'))
  return {
    ...cutSheet(body, fx, 58, 70, 4, 8, 12, 6),
    toast: Array.from({ length: 4 }, (_, i) => new Texture({
      source: spin.source,
      frame: new Rectangle(i * 14, 0, 14, 14),
    })),
  }
}

const ATTACKS: { id: AttackId; frames: number }[] = [
  { id: 'brush-spin', frames: 11 },
  { id: 'dash-ram', frames: 12 },
  { id: 'suction-pull', frames: 10 },
  { id: 'shield-parry', frames: 8 },
]
const COMBOS: { id: ComboId; frames: number }[] = [
  { id: 'brush-combo', frames: 34 },
  { id: 'ram-combo', frames: 30 },
  { id: 'mixed-combo', frames: 33 },
]

async function loadSheet(alias: string, src: string): Promise<Spritesheet> {
  const sheet = await Assets.load<Spritesheet>({
    alias,
    src,
    data: {
      cachePrefix: `${alias}-`,
      textureOptions: { scaleMode: 'nearest', autoGenerateMipmaps: false },
    },
  })
  for (const tex of Object.values(sheet.textures)) {
    tex.source.scaleMode = 'nearest'
    tex.source.autoGenerateMipmaps = false
  }
  return sheet
}

function frames(sheet: Spritesheet, prefix: string, count: number, pad: number): Texture[] {
  const out: Texture[] = []
  for (let i = 0; i < count; i++) {
    const name = `${prefix}_${String(i).padStart(pad, '0')}.png`
    const tex = sheet.textures[name]
    if (!tex) throw new Error(`missing frame ${name}`)
    out.push(tex)
  }
  return out
}

function book(
  body: Spritesheet, fx: Spritesheet, id: string, count: number, pad: number,
): Record<Facing, Clip> {
  const clips = {} as Record<Facing, Clip>
  for (const face of FACINGS) {
    clips[face] = {
      body: frames(body, `${id}_${face}`, count, pad),
      fx: frames(fx, `${id}_${face}`, count, pad),
    }
  }
  return clips
}

function solidIcon(tex: Texture): Texture {
  const image = tex.source.resource as CanvasImageSource
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, 16, 16)
  for (let i = 3; i < pixels.data.length; i += 4) {
    if (pixels.data[i] !== 255) pixels.data[i] = 0
  }
  ctx.putImageData(pixels, 0, 0)
  const source = new CanvasSource({
    resource: canvas,
    resolution: 1,
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
    autoDensity: false,
  })
  return new Texture({ source })
}

async function loadAddon(): Promise<Addon> {
  const [glideSheet, atkBody, atkFx, comboBody, comboFx, reactSheet] = await Promise.all([
    loadSheet('addon-glide', 'assets/addon/sheet/glide.json'),
    loadSheet('addon-atk-body', 'assets/addon/sheet/atk-body.json'),
    loadSheet('addon-atk-fx', 'assets/addon/sheet/atk-fx.json'),
    loadSheet('addon-combo-body', 'assets/addon/sheet/combo-body.json'),
    loadSheet('addon-combo-fx', 'assets/addon/sheet/combo-fx.json'),
    loadSheet('addon-react', 'assets/addon/sheet/react.json'),
  ])

  const jobs: { alias: string; src: string }[] = []
  const ids = (upgradeFile as { nodes: { id: string }[] }).nodes.map((node) => node.id)
  for (const id of ids) jobs.push({ alias: `icon-${id}`, src: `assets/addon/ui/icon/61-${id}.png` })
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
    jobs.push({ alias: `card-${rarity}`, src: `assets/addon/ui/62-card-${rarity}.png` })
  }
  jobs.push(
    { alias: 'card-back', src: 'assets/addon/ui/62-card-back.png' },
    { alias: 'level-title', src: 'assets/addon/ui/64-title-level-up.png' },
    { alias: 'xp-bar', src: 'assets/addon/ui/64-xp-bar.png' },
    { alias: 'btn-reroll', src: 'assets/addon/ui/64-button-reroll.png' },
    { alias: 'btn-skip', src: 'assets/addon/ui/64-button-skip.png' },
    { alias: 'font-mini', src: 'assets/addon/ui/font/63-mansion-mini-3x5.png' },
    { alias: 'font-sans', src: 'assets/addon/ui/font/63-mansion-sans-5x7.png' },
  )
  await Assets.load(jobs.map((job) => ({
    alias: job.alias,
    src: job.src,
    data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
  })))

  const glide = {} as Record<Facing, Texture[]>
  const settle = {} as Record<Facing, Texture[]>
  const hitBody = {} as Record<Facing, Texture[]>
  const hitFx = {} as Record<Facing, Texture[]>
  const deathBody = {} as Record<Facing, Texture[]>
  const deathFx = {} as Record<Facing, Texture[]>
  for (const face of FACINGS) {
    glide[face] = frames(glideSheet, `glide_${face}`, 6, 0)
    settle[face] = frames(glideSheet, `settle_${face}`, 4, 0)
    hitBody[face] = frames(reactSheet, `hit_${face}`, 5, 0)
    hitFx[face] = frames(reactSheet, `hit_${face}`, 5, 0).map((_, index) => {
      const tex = reactSheet.textures[`hit_${face}_${index}_fx.png`]
      if (!tex) throw new Error(`missing hit fx ${face} ${index}`)
      return tex
    })
    deathBody[face] = frames(reactSheet, `death_${face}`, 8, 0)
    deathFx[face] = frames(reactSheet, `death_${face}`, 8, 0).map((_, index) => {
      const tex = reactSheet.textures[`death_${face}_${index}_fx.png`]
      if (!tex) throw new Error(`missing death fx ${face} ${index}`)
      return tex
    })
  }

  const attack = {} as Addon['attack']
  for (const attackId of ATTACKS) attack[attackId.id] = book(atkBody, atkFx, attackId.id, attackId.frames, 0)
  const combo = {} as Addon['combo']
  for (const comboId of COMBOS) combo[comboId.id] = book(comboBody, comboFx, comboId.id, comboId.frames, 2)

  const icon: Record<string, Texture> = {}
  for (const id of ids) icon[id] = solidIcon(take(`icon-${id}`))
  const card = {} as Addon['card']
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) card[rarity] = take(`card-${rarity}`)

  const lists: Texture[][] = []
  for (const face of FACINGS) lists.push(glide[face], settle[face])
  for (const attackId of ATTACKS) {
    for (const face of FACINGS) lists.push(attack[attackId.id][face].body)
  }
  for (const comboId of COMBOS) {
    for (const face of FACINGS) lists.push(combo[comboId.id][face].body)
  }

  return {
    glide,
    settle,
    attack,
    combo,
    hitBody,
    hitFx,
    deathBody,
    deathFx,
    icon,
    card,
    cardBack: take('card-back'),
    title: take('level-title'),
    xpBar: take('xp-bar'),
    btnReroll: take('btn-reroll'),
    btnSkip: take('btn-skip'),
    fontMini: take('font-mini'),
    fontSans: take('font-sans'),
    shadow: peelContactShadows(lists),
  }
}

const SHADOW_RGB = [15, 19, 23] as const

/** Move the baked contact shadow (#0f1317, alpha under 200) onto a twin texture. */
function peelContactShadows(lists: Texture[][]): Map<Texture, Texture> {
  const shadowOf = new Map<Texture, Texture>()
  const groups = new Map<Texture['source'], Texture[]>()
  for (const tex of lists.flat()) {
    const bucket = groups.get(tex.source)
    if (bucket) bucket.push(tex)
    else groups.set(tex.source, [tex])
  }
  const replacement = new Map<Texture, Texture>()
  for (const [source, texs] of groups) {
    const w = source.pixelWidth
    const h = source.pixelHeight
    const bodyCanvas = document.createElement('canvas')
    const shadeCanvas = document.createElement('canvas')
    bodyCanvas.width = w
    bodyCanvas.height = h
    shadeCanvas.width = w
    shadeCanvas.height = h
    const bctx = bodyCanvas.getContext('2d', { willReadFrequently: true })
    const sctx = shadeCanvas.getContext('2d')
    if (!bctx || !sctx) throw new Error('no 2d context')
    bctx.drawImage(source.resource as CanvasImageSource, 0, 0)
    const image = bctx.getImageData(0, 0, w, h)
    const shade = sctx.createImageData(w, h)
    const src = image.data
    const dst = shade.data
    for (let i = 0; i < src.length; i += 4) {
      const alpha = src[i + 3] ?? 0
      if (src[i] !== SHADOW_RGB[0] || src[i + 1] !== SHADOW_RGB[1] || src[i + 2] !== SHADOW_RGB[2]) continue
      if (alpha === 0 || alpha >= 200) continue
      dst[i] = SHADOW_RGB[0]
      dst[i + 1] = SHADOW_RGB[1]
      dst[i + 2] = SHADOW_RGB[2]
      dst[i + 3] = alpha
      src[i + 3] = 0
    }
    bctx.putImageData(image, 0, 0)
    sctx.putImageData(shade, 0, 0)
    const bodySource = new CanvasSource({
      resource: bodyCanvas,
      resolution: 1,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      autoDensity: false,
    })
    const shadeSource = new CanvasSource({
      resource: shadeCanvas,
      resolution: 1,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      autoDensity: false,
    })
    for (const tex of texs) {
      const body = new Texture({
        source: bodySource,
        frame: new Rectangle(tex.frame.x, tex.frame.y, tex.frame.width, tex.frame.height),
      })
      const shadeTex = new Texture({
        source: shadeSource,
        frame: new Rectangle(tex.frame.x, tex.frame.y, tex.frame.width, tex.frame.height),
      })
      replacement.set(tex, body)
      shadowOf.set(body, shadeTex)
    }
  }
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const prev = list[i]
      if (!prev) continue
      const next = replacement.get(prev)
      if (next) list[i] = next
    }
  }
  return shadowOf
}
