import { Assets, CanvasSource, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Art, MapRoomKind, MapState } from './assets.ts'
import miniFont from './data/63-mansion-mini-3x5.json' with { type: 'json' }
import sansFont from './data/63-mansion-sans-5x7.json' with { type: 'json' }
import menuFiles from './data/menu-files.json' with { type: 'json' }
import { bake, type FontMetrics } from './font-bm.ts'
import { rewrite, textSprite } from './font.ts'
import { VIEW_H, VIEW_W } from './spec.ts'

const MINI = miniFont as FontMetrics
const SANS = sansFont as FontMetrics

const INK = '#1f242a'
const PAPER = '#eff1f2'
const EMBER = '#e08a7c'
const ICE = '#b4d2d8'
const PITCH_X = 13
const PITCH_Y = 11
const STONE = 0xbcc3c9
const PEARL = 0xd3d8dc
const EDGE_PEARL = 0x6d7276
const JOIN_PEARL = 0x74777b
const EDGE_STONE = 0x62676c
const JOIN_STONE = 0x666b70
const JOIN_MIX = 0x6f7377
const JOIN_NEAR = 0x686d71
const ICE_DIM = 0x8fc4d2
const ICE_LIT = 0xd6f2f6
const ICON_X = 3
const ICON_Y = 3
const PILL_X = 13
const PILL_Y = 3
const CHIP_X = 62
const CHIP_Y = 3
const BAR_X = 62
const BAR_Y = 14
const PEARL_LIGHT = 0xeff1f3
const PEARL_DARK = 0xd3d8dc
const ICE_FILL = 0xd6f2f6
const ICE_BASE = 0x8fc4d2
const STEEL = '#5c656c'
const GOLD = '#a07a3a'
const PANEL_W = 204
const PANEL_H = 170
const HAND = 'url("assets/addon2/ui/menus/widgets/cursor-hand.png") 0 0, pointer'
const RESULT_BTNS = [
  { id: 'again', x: 14, y: 142, w: 82, h: 18 },
  { id: 'home', x: 108, y: 142, w: 82, h: 18 },
] as const

export interface ResultsInfo {
  won: boolean
  run: string
  floor: string
  rooms: string
  kills: string
  level: string
  dirt: string
  coins: string
  bank: string
  bolts: string
  time: string
  cause: string
  icons: Texture[]
}

export type MapKind = MapRoomKind | 'hall'

export interface MapCell {
  x: number
  y: number
  kind: MapKind
  state: MapState
  rim: boolean
}

/** Neck from the west or north cell. `near` is that cell. `far` is the east or south cell. */
export interface MapLink {
  x: number
  y: number
  axis: 'h' | 'v'
  near: MapState
  far: MapState
}

function menuTexture(file: string): Texture {
  const index = (menuFiles as string[]).indexOf(file)
  if (index < 0) throw new Error(`missing menu art ${file}`)
  const texture = Assets.get<Texture>(`menu-v2-${index}`)
  texture.source.scaleMode = 'nearest'
  texture.source.autoGenerateMipmaps = false
  return texture
}

export class Hud {
  readonly root = new Container()
  onResults: { again(): void; home(): void } = { again() {}, home() {} }
  private readonly art: Art
  private readonly play = new Container()
  private readonly hpIcon: Sprite
  private readonly pill: Sprite
  private readonly pillFlash = new Graphics()
  private readonly chip: Sprite
  private readonly chipLabel = new Sprite(Texture.EMPTY)
  private readonly bar: Sprite
  private readonly barFill = new Graphics()
  private readonly coins: Sprite
  private readonly bolts: Sprite
  private readonly hint: Sprite
  private readonly hintBack: Graphics
  private readonly title: Sprite
  private readonly sub: Sprite
  private readonly plate: Graphics
  private readonly roomClear: Sprite
  private readonly scrim = new Graphics()
  private readonly sheet = new Container()
  private readonly panel: Sprite
  private readonly covers = new Graphics()
  private readonly iconRow = new Container()
  private readonly rows = new Map<string, Sprite>()
  private levelText = ''
  private coinText = ''
  private boltText = ''
  private banner = ''
  private subText = ''
  private readonly floorBanners = new Map<string, Texture>()
  private hintText = ''
  private mapKey = ''
  private mapCols = 0
  private readonly mapRoot = new Container()
  private readonly mapG = new Graphics()
  private readonly mapSprites: Sprite[] = []
  private readonly maps: Art['minimap']
  private readonly pills: Texture[]
  private pillShown = -1
  private flashLo = 0
  private flashHi = 0
  private flashAt = 0
  private seenLevel = -1
  private levelFlash = 0
  private resultsKey = ''
  private resultFocus = ''
  private readonly resultCaret: Sprite
  private readonly resultCaretFx: Sprite
  private readonly resultBody: Texture[]
  private readonly resultFx: Texture[]
  private scrimW = 0
  private scrimH = 0
  private viewW = VIEW_W
  private viewH = VIEW_H
  private readonly coinIcon: Sprite
  private readonly boltIcon: Sprite

  constructor(art: Art) {
    this.art = art
    this.pills = art.hud.pills
    this.hpIcon = new Sprite(art.hud.hpIcon)
    this.hpIcon.position.set(ICON_X, ICON_Y)
    this.pill = new Sprite(art.hud.pills[10])
    this.pill.position.set(PILL_X, PILL_Y)
    this.chip = new Sprite(art.hud.chip)
    this.chip.position.set(CHIP_X, CHIP_Y)
    this.chipLabel.roundPixels = true
    this.bar = new Sprite(art.hud.xpTrack)
    this.bar.position.set(BAR_X, BAR_Y)
    this.barFill.position.set(BAR_X, BAR_Y)
    this.coins = textSprite('0', INK, 0, 6)
    this.bolts = textSprite('0', INK, 0, 22)
    this.coinIcon = new Sprite(art.coins.silver.spin[0])
    this.coinIcon.roundPixels = true
    this.boltIcon = new Sprite(art.bolt[0])
    this.boltIcon.roundPixels = true
    for (const sprite of [this.hpIcon, this.pill, this.chip, this.bar]) sprite.roundPixels = true
    this.pillFlash.eventMode = 'none'
    this.barFill.eventMode = 'none'
    this.play.addChild(
      this.hpIcon, this.pill, this.pillFlash, this.chip, this.chipLabel,
      this.bar, this.barFill, this.coinIcon, this.coins, this.boltIcon, this.bolts,
    )
    this.placeChrome()

    this.hintBack = new Graphics()
    this.hint = textSprite('', PAPER, 0, 158)
    this.hint.visible = false
    this.play.addChild(this.hintBack, this.hint)

    this.plate = new Graphics()
    this.title = textSprite('FAIL', EMBER, 0, 78)
    this.sub = textSprite('ANY KEY', PAPER, 0, 90)
    this.title.visible = false
    this.sub.visible = false
    this.roomClear = new Sprite(art.results.banner)
    this.roomClear.visible = false
    this.roomClear.roundPixels = true
    this.maps = art.minimap
    this.mapRoot.eventMode = 'none'
    this.mapG.eventMode = 'none'
    this.mapRoot.addChild(this.mapG)
    this.play.addChild(this.mapRoot)
    this.panel = new Sprite(art.results.panel)
    this.panel.roundPixels = true
    this.panel.eventMode = 'none'
    this.coverResults()
    this.resultBody = [0, 1, 2, 3].map((frame) => menuTexture(`anim/103-caret-bob/frames/103-caret-bob_body_0${frame}.png`))
    this.resultFx = [0, 1, 2, 3].map((frame) => menuTexture(`anim/103-caret-bob/frames/103-caret-bob_fx_0${frame}.png`))
    this.resultCaret = new Sprite(this.resultBody[0])
    this.resultCaretFx = new Sprite(this.resultFx[0])
    this.resultCaret.visible = false
    this.resultCaretFx.visible = false
    this.resultCaret.eventMode = 'none'
    this.resultCaretFx.eventMode = 'none'
    this.resultCaret.roundPixels = true
    this.resultCaretFx.roundPixels = true
    this.sheet.addChild(this.panel, this.covers, this.iconRow)
    for (const btn of RESULT_BTNS) this.addResultBtn(btn)
    this.sheet.addChild(this.resultCaret, this.resultCaretFx)
    this.sheet.visible = false
    this.scrim.visible = false
    this.root.addChild(this.play, this.plate, this.title, this.sub, this.roomClear, this.scrim, this.sheet)
  }

  setView(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    this.placeChrome()
    this.placeMap()
    if (this.roomClear.visible) this.placeRoomClear()
    if (this.sheet.visible) this.layoutResults()
  }

  private placeChrome(): void {
    this.coinIcon.position.set(this.viewW - 52, 2)
    this.coins.position.set(this.viewW - 36, 6)
    this.boltIcon.position.set(this.viewW - 56, 16)
    this.bolts.position.set(this.viewW - 36, 22)
  }

  private placeMap(): void {
    if (this.mapCols <= 0) return
    this.mapRoot.position.set(this.viewW - this.mapCols * PITCH_X - 4, 34)
  }

  showMap(cells: MapCell[], links: MapLink[], key: string, cols: number, frame: number): void {
    if (key === this.mapKey) return
    this.mapKey = key
    this.mapCols = cols
    this.placeMap()
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const sprite = this.mapSprite(i)
      sprite.texture = this.mapTile(cell.kind, cell.state)
      sprite.position.set(cell.x * PITCH_X, cell.y * PITCH_Y)
      sprite.visible = true
    }
    for (let i = cells.length; i < this.mapSprites.length; i++) this.mapSprites[i].visible = false
    this.mapG.clear()
    for (const link of links) this.paintNeck(link)
    const ice = frame === 0 ? ICE_DIM : ICE_LIT
    for (const cell of cells) {
      if (!cell.rim) continue
      const x = cell.x * PITCH_X
      const y = cell.y * PITCH_Y
      this.mapG.rect(x + 3, y + 2, 7, 1).fill(ice)
      this.mapG.rect(x + 3, y + 8, 7, 1).fill(ice)
      this.mapG.rect(x + 2, y + 3, 1, 5).fill(ice)
      this.mapG.rect(x + 10, y + 3, 1, 5).fill(ice)
    }
    this.mapRoot.addChild(this.mapG)
  }

  private mapSprite(index: number): Sprite {
    const ready = this.mapSprites[index]
    if (ready) return ready
    const sprite = new Sprite()
    sprite.roundPixels = true
    sprite.eventMode = 'none'
    this.mapSprites.push(sprite)
    this.mapRoot.addChildAt(sprite, this.mapRoot.children.length - 1)
    return sprite
  }

  private mapTile(kind: MapKind, state: MapState): Texture {
    if (kind === 'hall') return state === 'seen' ? this.maps.room.combat.seen : this.maps.hall
    return this.maps.room[kind][state]
  }

  /** Opens the shared edge the way 69-door_h_pair and 69-door_v_pair do. */
  private paintNeck(link: MapLink): void {
    const stone = link.near === 'seen' || link.far === 'seen'
    const fill = stone ? STONE : PEARL
    const edge = stone ? EDGE_STONE : EDGE_PEARL
    const x = link.x * PITCH_X
    const y = link.y * PITCH_Y
    if (link.axis === 'h') {
      this.mapG.rect(x + 11, y + 4, 4, 3).fill(fill)
      this.mapG.rect(x + 12, y + 3, 2, 1).fill(edge)
      this.mapG.rect(x + 12, y + 7, 2, 1).fill(edge)
      const farJoin = !stone ? JOIN_PEARL : link.far === 'seen' ? JOIN_STONE : JOIN_MIX
      this.mapG.rect(x + 14, y + 3, 1, 1).fill(farJoin)
      this.mapG.rect(x + 14, y + 7, 1, 1).fill(farJoin)
      if (stone && link.near !== 'seen') {
        this.mapG.rect(x + 11, y + 3, 1, 1).fill(JOIN_NEAR)
        this.mapG.rect(x + 11, y + 7, 1, 1).fill(JOIN_NEAR)
      }
      return
    }
    this.mapG.rect(x + 5, y + 9, 3, 4).fill(fill)
    this.mapG.rect(x + 4, y + 10, 1, 2).fill(edge)
    this.mapG.rect(x + 8, y + 10, 1, 2).fill(edge)
    const farJoin = !stone ? JOIN_PEARL : link.far === 'seen' ? JOIN_STONE : JOIN_MIX
    this.mapG.rect(x + 4, y + 12, 1, 1).fill(farJoin)
    this.mapG.rect(x + 8, y + 12, 1, 1).fill(farJoin)
    if (stone && link.near !== 'seen') {
      this.mapG.rect(x + 4, y + 9, 1, 1).fill(JOIN_NEAR)
      this.mapG.rect(x + 8, y + 9, 1, 1).fill(JOIN_NEAR)
    }
  }

  update(
    hp: number, maxHp: number, coins: number, bolts: number,
    hint: string, level: number, xp: number, need: number, banner: string, sub: string,
  ): void {
    const now = performance.now()
    this.syncPill(hp, maxHp, now)
    this.syncLevel(level, xp, need, now)
    this.set(this.coins, 'coins', String(coins), INK)
    this.set(this.bolts, 'bolts', String(bolts), INK)
    this.bobResultCaret(now)

    if (hint !== this.hintText) {
      this.hintText = hint
      if (hint) this.ink(this.hint, hint, PAPER)
    }
    this.hint.visible = hint !== ''
    this.hintBack.clear()
    if (hint) {
      const x = Math.round((this.viewW - this.hint.width) / 2)
      const y = this.viewH - this.hint.texture.height - 14
      this.hint.position.set(x, y)
      this.hintBack.rect(x - 4, y - 3, this.hint.width + 8, this.hint.texture.height + 6).fill({ color: 0x14181c, alpha: 0.82 })
    }

    const next = banner
    const floorCard = next.startsWith('FLOOR ')
    this.roomClear.visible = next === 'CLEAN' || floorCard
    if (next === 'CLEAN' || floorCard) {
      this.banner = next
      this.subText = sub
      this.title.visible = false
      this.sub.visible = false
      this.plate.clear()
      const plate = next === 'CLEAN' ? this.art.results.banner : this.floorPlate(next)
      if (this.roomClear.texture !== plate) this.roomClear.texture = plate
      this.placeRoomClear()
      return
    }
    if (next !== this.banner || sub !== this.subText) {
      this.banner = next
      this.subText = sub
      if (next) this.ink(this.title, next, next === 'DEAD' ? EMBER : ICE)
      if (sub) this.ink(this.sub, sub, PAPER)
      this.title.visible = next !== ''
      this.sub.visible = sub !== ''
    }
    this.plate.clear()
    if (next) {
      const gap = 3
      const pad = 5
      const block = this.title.height + (sub ? gap + this.sub.height : 0)
      const plateH = block + pad * 2
      const plateY = Math.round((this.viewH - plateH) / 2)
      const titleX = Math.round((this.viewW - this.title.width) / 2)
      const subX = Math.round((this.viewW - this.sub.width) / 2)
      this.title.position.set(titleX, plateY + pad)
      this.sub.position.set(subX, plateY + pad + this.title.height + gap)
      const left = Math.min(titleX, sub ? subX : titleX) - 6
      const right = Math.max(titleX + this.title.width, sub ? subX + this.sub.width : 0) + 6
      this.plate.rect(left, plateY, right - left, plateH).fill({ color: 0x14181c, alpha: 0.82 })
    }
  }

  showResults(info: ResultsInfo | null): void {
    if (!info) {
      if (this.sheet.visible) this.closeResults()
      return
    }
    const opening = !this.sheet.visible
    this.play.visible = false
    this.scrim.visible = true
    this.sheet.visible = true
    this.panel.texture = info.won ? this.art.results.win : this.art.results.panel
    this.layoutResults()
    if (opening) {
      const first = RESULT_BTNS[0]
      if (first) this.aimResult(first)
    }
    const key = [
      info.won ? '1' : '0',
      info.run, info.floor, info.rooms, info.kills, info.level, info.dirt,
      info.coins, info.bank, info.bolts, info.time, info.cause,
      info.icons.map((icon) => icon.uid).join(','),
    ].join('|')
    if (key === this.resultsKey) return
    this.resultsKey = key
    this.paintResults(info)
  }

  private set(sprite: Sprite, slot: 'coins' | 'bolts', text: string, color: string): void {
    const prev = slot === 'coins' ? this.coinText : this.boltText
    if (prev === text) return
    if (slot === 'coins') this.coinText = text
    else this.boltText = text
    rewrite(sprite, text, color)
  }

  private syncPill(hp: number, maxHp: number, now: number): void {
    const index = Math.max(0, Math.min(10, Math.round(maxHp > 0 ? (hp / maxHp) * 10 : 0)))
    if (this.pillShown >= 0 && index < this.pillShown) {
      this.flashLo = index
      this.flashHi = this.pillShown
      this.flashAt = now
    } else if (index > this.pillShown) {
      this.flashLo = 0
      this.flashHi = 0
    }
    if (index !== this.pillShown) {
      this.pillShown = index
      this.pill.texture = this.pills[index] ?? this.pills[0]
    }
    this.pillFlash.clear()
    const age = now - this.flashAt
    const on = this.flashHi > this.flashLo && age >= 0 && age < 350 && Math.floor(age / 70) % 2 === 0
    if (!on) return
    for (let i = this.flashLo; i < this.flashHi; i++) {
      const x = PILL_X + 3 + 4 * i
      const y = PILL_Y + 3
      this.pillFlash.rect(x, y, 3, 1).fill(PEARL_LIGHT)
      this.pillFlash.rect(x, y + 1, 3, 2).fill(PEARL_DARK)
    }
  }

  private syncLevel(level: number, xp: number, need: number, now: number): void {
    if (this.seenLevel >= 0 && level > this.seenLevel) this.levelFlash = now + 180
    this.seenLevel = level
    const flashing = now < this.levelFlash
    this.chip.texture = flashing ? this.art.hud.chipFlash : this.art.hud.chip
    this.bar.texture = flashing ? this.art.hud.xpFlash : this.art.hud.xpTrack
    const label = `LV ${level}`
    if (label !== this.levelText) {
      this.levelText = label
      this.swapBaked(this.chipLabel, bake(this.art.addon.fontMini, MINI, label, INK))
    }
    this.chipLabel.position.set(CHIP_X + Math.round((25 - this.chipLabel.texture.width) / 2), CHIP_Y + 4)
    this.barFill.clear()
    if (flashing) return
    const frac = need > 0 ? Math.max(0, Math.min(1, xp / need)) : 0
    const width = Math.round(38 * frac)
    if (width <= 0) return
    this.barFill.rect(3, 3, width, 1).fill(ICE_FILL)
    this.barFill.rect(3, 4, width, 1).fill(ICE_BASE)
  }

  /** Room-clear plate with the floor line in the same ink. The shared banner stays intact. */
  private floorPlate(label: string): Texture {
    const cached = this.floorBanners.get(label)
    if (cached) return cached
    const base = this.art.results.banner
    const resource = base.source.resource
    if (!drawable(resource)) return base
    const canvas = document.createElement('canvas')
    canvas.width = base.width
    canvas.height = base.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return base
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(resource, 0, 0)
    ctx.fillStyle = '#eff1f3'
    ctx.fillRect(8, 3, canvas.width - 16, 14)
    const ink = bake(this.art.addon.fontSans, SANS, label, '#8fc4d2')
    const shade = bake(this.art.addon.fontSans, SANS, label, '#2d444c')
    const inkImg = ink.source.resource
    const shadeImg = shade.source.resource
    if (drawable(inkImg) && drawable(shadeImg)) {
      const x = Math.round((canvas.width - ink.width) / 2)
      const y = Math.round((canvas.height - ink.height) / 2)
      ctx.drawImage(shadeImg, x + 1, y + 1)
      ctx.drawImage(inkImg, x, y)
    }
    ink.destroy(true)
    shade.destroy(true)
    const source = new CanvasSource({
      resource: canvas,
      resolution: 1,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      autoDensity: false,
    })
    const texture = new Texture({ source })
    this.floorBanners.set(label, texture)
    return texture
  }

  private placeRoomClear(): void {
    this.roomClear.position.set(
      Math.round((this.viewW - this.roomClear.texture.width) / 2),
      Math.round((this.viewH - this.roomClear.texture.height) / 2),
    )
  }

  private coverResults(): void {
    this.covers.rect(36, 16, 140, 9).fill(PEARL_LIGHT)
    for (const y of [26, 36, 46, 56, 66, 76, 86, 96, 106]) {
      this.covers.rect(58, y, 132, 10).fill(PEARL_LIGHT)
    }
    this.covers.rect(56, 114, 136, 20).fill(PEARL_LIGHT)
  }

  private layoutResults(): void {
    this.sheet.position.set(
      Math.round((this.viewW - PANEL_W) / 2),
      Math.round((this.viewH - PANEL_H) / 2),
    )
    if (this.scrimW === this.viewW && this.scrimH === this.viewH) return
    this.scrimW = this.viewW
    this.scrimH = this.viewH
    this.scrim.clear()
    this.scrim.rect(0, 0, this.viewW, this.viewH).fill({ color: PEARL_LIGHT, alpha: 192 / 255 })
  }

  private paintResults(info: ResultsInfo): void {
    this.put('sub', info.run, MINI, STEEL, 40, 18)
    const rows: [string, string, number][] = [
      ['floor', info.floor, 27],
      ['rooms', info.rooms, 37],
      ['kills', info.kills, 47],
      ['level', info.level, 57],
      ['dirt', info.dirt, 67],
      ['coins', info.coins, 77],
      ['bolts', info.bolts, 87],
      ['time', info.time, 97],
      ['cause', info.cause, 107],
    ]
    for (const [id, text, y] of rows) this.put(id, text, SANS, INK, 62, y)
    const coins = this.rows.get('coins')
    this.put('bank', `BANK ${info.bank}`, SANS, GOLD, 62 + (coins?.texture.width ?? 0) + 6, 77)
    for (const child of this.iconRow.removeChildren()) child.destroy()
    for (let i = 0; i < info.icons.length && i < 7; i++) {
      const icon = info.icons[i]
      if (!icon) continue
      const sprite = new Sprite(icon)
      sprite.roundPixels = true
      sprite.position.set(62 + i * 18, 114)
      this.iconRow.addChild(sprite)
    }
  }

  private put(id: string, text: string, font: FontMetrics, color: string, x: number, y: number): void {
    let sprite = this.rows.get(id)
    if (!sprite) {
      sprite = new Sprite(Texture.EMPTY)
      sprite.roundPixels = true
      this.rows.set(id, sprite)
      this.sheet.addChild(sprite)
    }
    const sheet = font === SANS ? this.art.addon.fontSans : this.art.addon.fontMini
    this.swapBaked(sprite, bake(sheet, font, text, color))
    sprite.position.set(x, y)
  }

  private ink(sprite: Sprite, text: string, color: string): void {
    this.swapBaked(sprite, bake(this.art.addon.fontSans, SANS, text, color))
  }

  private swapBaked(sprite: Sprite, next: Texture): void {
    const prev = sprite.texture
    sprite.texture = next
    if (prev !== Texture.EMPTY) prev.destroy(true)
  }

  private addResultBtn(btn: { id: 'again' | 'home'; x: number; y: number; w: number; h: number }): void {
    const hit = new Sprite(Texture.WHITE)
    hit.alpha = 0
    hit.position.set(btn.x, btn.y)
    hit.width = btn.w
    hit.height = btn.h
    hit.eventMode = 'static'
    hit.cursor = HAND
    hit.hitArea = new Rectangle(0, 0, btn.w, btn.h)
    hit.on('pointerover', () => this.aimResult(btn))
    hit.on('pointertap', () => this.pickResult(btn.id))
    this.sheet.addChild(hit)
  }

  private aimResult(btn: { id: string; x: number; y: number; h: number }): void {
    this.resultFocus = btn.id
    this.resultCaret.visible = true
    // Glyph sits in the right of a 15px frame. Park its tip 8px left of the button and center it.
    this.resultCaret.position.set(Math.max(0, btn.x - 16), btn.y + Math.round(btn.h / 2) - 7)
    this.resultCaretFx.position.copyFrom(this.resultCaret.position)
    this.sheet.addChild(this.resultCaret, this.resultCaretFx)
  }

  private hideResultCaret(): void {
    this.resultFocus = ''
    this.resultCaret.visible = false
    this.resultCaretFx.visible = false
  }

  keyResults(code: string): void {
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') this.moveResult(-1)
    else if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyS' || code === 'KeyD') this.moveResult(1)
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      const id = this.resultFocus === 'home' ? 'home' : 'again'
      this.pickResult(id)
    } else if (code === 'KeyH') this.pickResult('home')
  }

  private moveResult(dir: number): void {
    const at = RESULT_BTNS.findIndex((btn) => btn.id === this.resultFocus)
    const next = (Math.max(0, at) + dir + RESULT_BTNS.length) % RESULT_BTNS.length
    const btn = RESULT_BTNS[next]
    if (btn) this.aimResult(btn)
  }

  private pickResult(id: 'again' | 'home'): void {
    if (id === 'again') this.onResults.again()
    else this.onResults.home()
  }

  private bobResultCaret(now: number): void {
    const on = this.sheet.visible && this.resultCaret.visible
    this.resultCaretFx.visible = on
    if (!on) return
    const frame = Math.floor(now / 160) % 4
    const body = this.resultBody[frame]
    const fx = this.resultFx[frame]
    if (body && this.resultCaret.texture !== body) this.resultCaret.texture = body
    if (fx && this.resultCaretFx.texture !== fx) this.resultCaretFx.texture = fx
    this.resultCaretFx.position.copyFrom(this.resultCaret.position)
  }

  private closeResults(): void {
    this.play.visible = true
    this.scrim.visible = false
    this.sheet.visible = false
    this.hideResultCaret()
    this.resultsKey = ''
    for (const child of this.iconRow.removeChildren()) child.destroy()
    for (const sprite of this.rows.values()) {
      const prev = sprite.texture
      sprite.texture = Texture.EMPTY
      if (prev !== Texture.EMPTY) prev.destroy(true)
    }
  }
}

function drawable(resource: unknown): resource is CanvasImageSource {
  return resource instanceof HTMLImageElement
    || resource instanceof HTMLCanvasElement
    || resource instanceof ImageBitmap
    || (typeof OffscreenCanvas !== 'undefined' && resource instanceof OffscreenCanvas)
}
