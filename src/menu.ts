import { Assets, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import type { Art } from './assets.ts'
import menuFiles from './data/menu-files.json' with { type: 'json' }
import miniFont from './data/63-mansion-mini-3x5.json' with { type: 'json' }
import sansFont from './data/63-mansion-sans-5x7.json' with { type: 'json' }
import { bake, type FontMetrics } from './font-bm.ts'
import type { Meta } from './meta.ts'

const MINI = miniFont as FontMetrics
const SANS = sansFont as FontMetrics
const INK = '#1f242a'
const PEARL = 0xeff1f3
const LINE = 0x7b7e81
const SHORT = '#c45a48'
const MENU_FILES = menuFiles as string[]

export const playOptions = { shake: true, numbers: true, flash: true }

const HAND = 'url("assets/addon2/ui/menus/widgets/cursor-hand.png") 0 0, pointer'
const ARROW = 'url("assets/addon2/ui/menus/widgets/cursor-arrow.png") 0 0, auto'

export const HUB_PERKS = [
  { name: 'REROLL TOKEN', detail: '1 FREE REROLL A RUN', costs: [60] },
  { name: 'PLATING', detail: '+10 MAX HP A RANK', costs: [80, 160, 240] },
  { name: 'STARTER CARD', detail: 'START WITH A COMMON', costs: [100] },
] as const

const FORM_SLOTS = [
  { id: 'P1', name: 'SCRAPPER', bolts: 10, playable: true, x: 13 },
  { id: 'P2', name: 'SENTINEL', bolts: 25, playable: false, x: 72 },
  { id: 'P3', name: 'BULWARK', bolts: 50, playable: false, x: 131 },
  { id: 'P4', name: 'REAVER', bolts: 100, playable: false, x: 190 },
  { id: 'P5', name: 'OMNIVAC', bolts: 200, playable: false, x: 249 },
] as const

const PERK_FILE = ['reroll', 'plating', 'starter'] as const
const PERK_POS = [
  { x: 84, y: 125 },
  { x: 198, y: 125 },
  { x: 84, y: 149 },
] as const

const FLOOR_NAME = ['', 'FOYER', 'GALLERY', 'WINE CELLAR', 'SERVER VAULT', 'PANIC ROOM']

const TITLE_ITEMS = [
  { id: 'new', key: 'new-run-w84', x: 220, y: 66, on: true },
  { id: 'continue', key: 'continue-w84', x: 220, y: 90, on: false },
  { id: 'hub', key: 'hub-w84', x: 220, y: 114, on: true },
  { id: 'settings', key: 'settings-w84', x: 220, y: 138, on: true },
] as const

const PAUSE_ITEMS = [
  { id: 'resume', key: 'resume-w104', x: 36, y: 49 },
  { id: 'settings', key: 'settings-w104', x: 36, y: 73 },
  { id: 'abandon', key: 'abandon-run-w104', x: 36, y: 97 },
  { id: 'quit', key: 'quit-to-title-w104', x: 36, y: 121 },
] as const

type ToggleKey = 'shake' | 'numbers' | 'flash'

type SetWidget =
  | { kind: 'slider'; index: number; x: number; y: number; w: number; h: number }
  | { kind: 'toggle'; key: ToggleKey; x: number; y: number; w: number; h: number }
  | { kind: 'full'; x: number; y: number; w: number; h: number }

const SET_WIDGETS: SetWidget[] = [
  { kind: 'slider', index: 0, x: 170, y: 42, w: 74, h: 13 },
  { kind: 'slider', index: 1, x: 170, y: 54, w: 74, h: 13 },
  { kind: 'slider', index: 2, x: 170, y: 66, w: 74, h: 13 },
  { kind: 'toggle', key: 'shake', x: 170, y: 82, w: 22, h: 13 },
  { kind: 'toggle', key: 'numbers', x: 170, y: 94, w: 22, h: 13 },
  { kind: 'toggle', key: 'flash', x: 170, y: 106, w: 22, h: 13 },
  { kind: 'full', x: 170, y: 118, w: 13, h: 13 },
]
const SET_BACK = 7
const SET_DEFAULTS = 8

const PRICE_PNG: Record<number, string> = {
  100: 'labels/price/price-100',
  160: 'labels/price/price-160',
}

export type MenuPage = 'title' | 'hub' | 'settings' | 'brief' | 'pause'
export type MenuBack = 'title' | 'hub' | 'pause'

export interface MenuArt {
  get(file: string): Texture
}

export interface RunCard {
  floor: string
  level: string
  coins: string
  bolts: string
  time: string
  icons: Texture[]
}

export interface MenuHooks {
  go(page: MenuPage, back?: MenuBack): void
  buy(index: number): void
  toggleForm(): void
  start(): void
  hasRun(): boolean
  continue(): void
  resume(): void
  quit(): void
  abandon(): void
}

export async function loadMenuArt(): Promise<MenuArt> {
  await Assets.load(MENU_FILES.map((file, index) => ({
    alias: `menu-v2-${index}`,
    src: `assets/addon2/ui/menus/${file}`,
    data: { scaleMode: 'nearest' as const, autoGenerateMipmaps: false },
  })))
  const tex = new Map<string, Texture>()
  MENU_FILES.forEach((file, index) => {
    const texture = Assets.get<Texture>(`menu-v2-${index}`)
    texture.source.scaleMode = 'nearest'
    texture.source.autoGenerateMipmaps = false
    tex.set(file, texture)
  })
  return {
    get(file: string): Texture {
      const found = tex.get(file)
      if (!found) throw new Error(`missing menu art ${file}`)
      return found
    },
  }
}

export function perkRank(meta: Meta, index: number): number {
  if (index === 0) return meta.reroll ? 1 : 0
  if (index === 1) return meta.plating
  if (index === 2) return meta.starter ? 1 : 0
  return meta.bag
}

export class StartMenu {
  readonly root = new Container()
  hooks: MenuHooks = {
    go() {},
    buy() {},
    toggleForm() {},
    start() {},
    hasRun: () => false,
    continue() {},
    resume() {},
    quit() {},
    abandon() {},
  }
  private readonly backdrop = new Graphics()
  private dimSprite!: Sprite
  private readonly screen = new Container()
  private readonly titlePage = new Container()
  private readonly hubPage = new Container()
  private readonly settingsPage = new Container()
  private readonly briefPage = new Container()
  private readonly pausePage = new Container()
  private readonly frame: NineSliceSprite
  private readonly caret: Sprite
  private readonly titleBtns: Sprite[] = []
  private readonly pauseBtns: Sprite[] = []
  private readonly sliders: Sprite[] = []
  private readonly toggles: Sprite[] = []
  private backBtn!: Sprite
  private defaultsBtn!: Sprite
  private hubBack!: Sprite
  private readonly formSprites: Sprite[] = []
  private readonly perkSprites: Sprite[] = []
  private readonly priceSprites: Sprite[] = []
  private readonly priceCoins: Sprite[] = []
  private readonly priceText: Sprite[] = []
  private readonly maxChips: Sprite[] = []
  private readonly lifeText = new Sprite(Texture.EMPTY)
  private readonly bankText = new Sprite(Texture.EMPTY)
  private bankIcon!: Sprite
  private readonly pauseValues: Sprite[] = []
  private readonly pauseIcons = new Container()
  private page: MenuPage = 'title'
  private focus = 0
  private back: MenuBack = 'title'
  private held = ''
  private meta: Meta = {
    bolts: 0, coins: 0, form: 'p0', plating: 0, bag: 0,
    reroll: false, starter: false, best: 1, runs: 0,
  }
  private card: RunCard = { floor: '', level: '', coins: '', bolts: '', time: '', icons: [] }
  private volumes = [80, 55, 70]
  private drag = -1
  private fullBox!: Sprite
  private tankPrice!: Sprite
  private caretFx!: Sprite
  private labels = new Map<Sprite, string>()
  private briefKey = ''
  private briefTextures: Texture[] = []
  private iconKey = ''

  constructor(private art: Art, private menu: MenuArt) {
    this.frame = new NineSliceSprite({
      texture: menu.get('9slice/focus-corners.png'),
      leftWidth: 5,
      topHeight: 5,
      rightWidth: 5,
      bottomHeight: 5,
    })
    this.frame.eventMode = 'none'
    this.frame.visible = false
    this.frame.roundPixels = true
    this.caret = this.stamp(this.screen, 'widgets/caret.png', 0, 0)
    this.caret.visible = false
    this.caretFx = this.stamp(this.screen, 'anim/103-caret-bob/frames/103-caret-bob_fx_00.png', 0, 0)
    this.caretFx.visible = false
    this.dimSprite = new Sprite(menu.get('backgrounds/dim-overlay-pearl-150.png'))
    this.dimSprite.eventMode = 'static'
    this.dimSprite.cursor = ARROW
    document.addEventListener('fullscreenchange', () => {
      if (this.page === 'settings') this.paintSettings()
    })
    this.root.addChild(this.backdrop, this.dimSprite, this.screen)
    this.screen.addChild(
      this.titlePage, this.hubPage, this.settingsPage, this.briefPage, this.pausePage,
      this.frame, this.caret, this.caretFx,
    )
    this.buildTitle()
    this.buildSettings()
    this.buildHub()
    this.buildPause()
    this.apply()
  }

  setView(w: number, h: number): void {
    const scale = Math.max(1, Math.floor(Math.min(w / 320, h / 180)))
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill(PEARL)
    this.backdrop.eventMode = 'static'
    this.backdrop.cursor = ARROW
    this.dimSprite.width = w
    this.dimSprite.height = h
    this.screen.scale.set(scale)
    this.screen.position.set(Math.round((w - 320 * scale) / 2), Math.round((h - 180 * scale) / 2))
  }

  sync(page: MenuPage, meta: Meta, back: MenuBack, card?: RunCard): void {
    const changed = page !== this.page
    this.page = page
    this.back = back
    this.meta = meta
    if (card) this.card = card
    if (changed) {
      this.held = ''
      this.drag = -1
      this.focus = page === 'hub' ? 5 : 0
    }
    this.apply()
    this.paint()
  }

  onKey(code: string): void {
    if (this.page === 'title') this.keyTitle(code)
    else if (this.page === 'hub') this.keyHub(code)
    else if (this.page === 'settings') this.keySettings(code)
    else if (this.page === 'pause') this.keyPause(code)
    else this.keyBrief(code)
  }

  private apply(): void {
    const page = this.page
    this.titlePage.visible = page === 'title'
    this.hubPage.visible = page === 'hub'
    this.settingsPage.visible = page === 'settings'
    this.briefPage.visible = page === 'brief'
    this.pausePage.visible = page === 'pause'
    this.backdrop.visible = page === 'title' || page === 'hub' || page === 'settings'
    this.dimSprite.visible = page === 'pause'
    if (page !== 'title' && page !== 'pause' && page !== 'hub' && page !== 'settings') this.caret.visible = false
    if (page !== 'hub') this.frame.visible = false
  }

  private paint(): void {
    if (this.page === 'title') this.paintTitle()
    else if (this.page === 'hub') this.paintHub()
    else if (this.page === 'settings') this.paintSettings()
    else if (this.page === 'pause') this.paintPause()
    else this.paintBrief()
    this.bobCaret()
  }

  private buildTitle(): void {
    const page = this.titlePage
    this.stamp(page, 'backgrounds/bg-wall.png', 0, 0)
    this.stamp(page, 'backgrounds/bg-floor-marble.png', 0, 140)
    this.stamp(page, 'backgrounds/title-mansion.png', 8, 60)
    this.stamp(page, 'logo/logo-dust-run.png', 36, 8)
    this.stamp(page, 'labels/chips/chip-a-mansion-roguelike.png', 64, 47)
    this.stamp(page, 'panels/panel-plain-100x109.png', 214, 59)
    this.stamp(page, 'labels/chips/chip-v-0-9.png', 4, 164)
    this.stamp(page, 'sprites/p0-roomba.png', 150, 140)
    TITLE_ITEMS.forEach((item, index) => {
      const sprite = this.button(page, item.key, item.x, item.y, 88, 23, () => {
        if (!this.titleOn(item)) return
        this.focus = index
        this.activateTitle()
      })
      sprite.on('pointerover', () => {
        if (!this.titleOn(item)) return
        this.aim(index)
      })
      this.titleBtns.push(sprite)
    })
  }

  private paintTitle(): void {
    TITLE_ITEMS.forEach((item, index) => {
      const sprite = this.titleBtns[index]
      if (!sprite) return
      const on = this.titleOn(item)
      sprite.cursor = on ? HAND : 'default'
      this.use(sprite, `buttons/labelled/btn-${item.key}-${this.btnState(on, this.focus === index, item.key)}.png`)
    })
    const item = TITLE_ITEMS[this.focus]
    if (item && this.titleOn(item)) this.placeCaret(item.x, item.y)
    else this.caret.visible = false
    this.frame.visible = false
  }

  private keyTitle(code: string): void {
    if (code === 'ArrowUp' || code === 'KeyW') this.moveTitle(-1)
    else if (code === 'ArrowDown' || code === 'KeyS') this.moveTitle(1)
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.activateTitle()
  }

  private moveTitle(dir: number): void {
    let next = this.focus
    for (let step = 0; step < TITLE_ITEMS.length; step++) {
      next = (next + dir + TITLE_ITEMS.length) % TITLE_ITEMS.length
      const item = TITLE_ITEMS[next]
      if (item && this.titleOn(item)) break
    }
    this.focus = next
    this.paintTitle()
  }

  private activateTitle(): void {
    const item = TITLE_ITEMS[this.focus]
    if (!item || !this.titleOn(item)) return
    if (item.id === 'new') this.hooks.go('brief', 'title')
    else if (item.id === 'continue') this.hooks.continue()
    else if (item.id === 'hub') this.hooks.go('hub')
    else if (item.id === 'settings') this.hooks.go('settings', 'title')
  }

  private titleOn(item: { id: string; on: boolean }): boolean {
    if (item.id === 'continue') return this.hooks.hasRun()
    return item.on
  }

  private buildSettings(): void {
    const page = this.settingsPage
    this.stamp(page, 'backgrounds/bg-wall.png', 0, 0)
    this.stamp(page, 'panels/panel-plain-284x168.png', 18, 6)
    this.stamp(page, 'labels/titles/title-settings-ice.png', 30, 10)
    this.stamp(page, 'labels/text/master-F5-ink.png', 33, 44)
    this.stamp(page, 'labels/text/music-F5-ink.png', 33, 56)
    this.stamp(page, 'labels/text/effects-F5-ink.png', 33, 68)
    this.stamp(page, 'panels/divider-256.png', 30, 80)
    this.stamp(page, 'labels/text/screen-shake-F5-ink.png', 33, 84)
    this.stamp(page, 'labels/text/damage-numbers-F5-ink.png', 33, 96)
    this.stamp(page, 'labels/text/flashing-fx-F5-ink.png', 33, 108)
    this.stamp(page, 'labels/text/fullscreen-F5-ink.png', 33, 120)
    this.fullBox = this.stamp(page, 'widgets/checkbox-off.png', 170, 118)
    SET_WIDGETS.forEach((item) => {
      if (item.kind === 'slider') {
        const sprite = this.stamp(page, 'widgets/slider/slider-080.png', item.x, item.y)
        this.sliders.push(sprite)
      } else if (item.kind === 'toggle') {
        const sprite = this.stamp(page, 'widgets/toggle-on.png', item.x, item.y)
        this.toggles.push(sprite)
      }
    })
    this.backBtn = this.button(page, 'back-w60', 30, 146, 64, 23, () => this.hooks.go(this.back))
    this.defaultsBtn = this.button(page, 'defaults-w72', 96, 146, 76, 23, () => this.resetSettings())
    this.armSettings(page)
  }

  private paintSettings(): void {
    this.volumes.forEach((value, index) => {
      const sprite = this.sliders[index]
      if (!sprite) return
      const step = String(value).padStart(3, '0')
      this.use(sprite, `widgets/slider/slider-${step}.png`)
    })
    const flags = [playOptions.shake, playOptions.numbers, playOptions.flash]
    flags.forEach((on, index) => {
      const sprite = this.toggles[index]
      if (!sprite) return
      this.use(sprite, `widgets/toggle-${on ? 'on' : 'off'}.png`)
    })
    const full = document.fullscreenElement !== null
    this.use(this.fullBox, `widgets/checkbox-${full ? 'on' : 'off'}.png`)
    this.use(this.backBtn, `buttons/labelled/btn-back-w60-${this.btnState(true, this.focus === SET_BACK, 'back-w60')}.png`)
    this.use(this.defaultsBtn, `buttons/labelled/btn-defaults-w72-${this.btnState(true, this.focus === SET_DEFAULTS, 'defaults-w72')}.png`)
    this.frame.visible = false
    const widget = SET_WIDGETS[this.focus]
    if (widget) this.placeCaret(33, widget.y, widget.h)
    else if (this.focus === SET_BACK) this.placeCaret(30, 146)
    else if (this.focus === SET_DEFAULTS) this.placeCaret(96, 146)
    else this.caret.visible = false
  }

  private keySettings(code: string): void {
    if (code === 'Escape' || code === 'Backspace') {
      this.hooks.go(this.back)
      return
    }
    if (code === 'ArrowUp' || code === 'KeyW') this.moveSettings(-1)
    else if (code === 'ArrowDown' || code === 'KeyS') this.moveSettings(1)
    else if (code === 'ArrowLeft' || code === 'KeyA') this.nudgeSettings(-1)
    else if (code === 'ArrowRight' || code === 'KeyD') this.nudgeSettings(1)
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.activateSettings()
  }

  private moveSettings(dir: number): void {
    this.focus = (this.focus + dir + SET_DEFAULTS + 1) % (SET_DEFAULTS + 1)
    this.paintSettings()
  }

  private nudgeSettings(dir: number): void {
    const item = SET_WIDGETS[this.focus]
    if (!item) return
    if (item.kind === 'slider') {
      const next = (this.volumes[item.index] ?? 0) + dir * 5
      this.volumes[item.index] = Math.min(100, Math.max(0, next))
    } else if (item.kind === 'toggle') this.flipToggle(item.key)
    else this.toggleFull()
    this.paintSettings()
  }

  private activateSettings(): void {
    if (this.focus === SET_BACK) this.hooks.go(this.back)
    else if (this.focus === SET_DEFAULTS) this.resetSettings()
    else {
      const item = SET_WIDGETS[this.focus]
      if (item?.kind === 'toggle') this.flipToggle(item.key)
      else if (item?.kind === 'full') this.toggleFull()
    }
    this.paintSettings()
  }

  private flipToggle(key: ToggleKey): void {
    playOptions[key] = !playOptions[key]
  }

  private resetSettings(): void {
    this.volumes = [80, 55, 70]
    playOptions.shake = true
    playOptions.numbers = true
    playOptions.flash = true
    if (document.fullscreenElement) void document.exitFullscreen()
    this.paintSettings()
  }

  private toggleFull(): void {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  private bobCaret(): void {
    const on = this.caret.visible
    this.caretFx.visible = on
    if (!on) return
    const frame = Math.floor(performance.now() / 160) % 4
    this.use(this.caret, `anim/103-caret-bob/frames/103-caret-bob_body_0${frame}.png`)
    this.use(this.caretFx, `anim/103-caret-bob/frames/103-caret-bob_fx_0${frame}.png`)
    this.caretFx.position.copyFrom(this.caret.position)
  }

  private armSettings(page: Container): void {
    const rows: { y: number; index: number; kind: 'slider' | 'toggle' | 'full'; key?: ToggleKey }[] = [
      { y: 42, index: 0, kind: 'slider' },
      { y: 54, index: 1, kind: 'slider' },
      { y: 66, index: 2, kind: 'slider' },
      { y: 82, index: 3, kind: 'toggle', key: 'shake' },
      { y: 94, index: 4, kind: 'toggle', key: 'numbers' },
      { y: 106, index: 5, kind: 'toggle', key: 'flash' },
      { y: 118, index: 6, kind: 'full' },
    ]
    for (const row of rows) {
      const hit = new Container()
      hit.position.set(30, row.y)
      hit.eventMode = 'static'
      hit.cursor = HAND
      hit.hitArea = new Rectangle(0, 0, 220, 13)
      const index = row.index
      const key = row.key
      hit.on('pointerover', () => {
        if (this.drag >= 0) return
        this.focus = index
        this.paintSettings()
      })
      if (row.kind === 'toggle' && key) {
        hit.on('pointertap', () => {
          this.focus = index
          this.flipToggle(key)
          this.paintSettings()
        })
      } else if (row.kind === 'full') {
        hit.on('pointertap', () => {
          this.focus = index
          this.toggleFull()
          this.paintSettings()
        })
      } else {
        const drag = (event: FederatedPointerEvent) => {
          if (this.drag !== index) return
          this.volumes[index] = volumeAt(event.getLocalPosition(hit).x)
          this.paintSettings()
        }
        hit.on('pointerdown', (event: FederatedPointerEvent) => {
          this.focus = index
          const x = event.getLocalPosition(hit).x
          if (x >= 140 && x <= 214) {
            this.drag = index
            this.volumes[index] = volumeAt(x)
          }
          this.paintSettings()
        })
        hit.on('pointermove', drag)
        hit.on('globalpointermove', drag)
        hit.on('pointerup', () => {
          if (this.drag === index) this.drag = -1
        })
        hit.on('pointerupoutside', () => {
          if (this.drag === index) this.drag = -1
        })
      }
      page.addChild(hit)
    }
    this.backBtn.on('pointerover', () => {
      if (this.drag >= 0) return
      this.focus = SET_BACK
      this.paintSettings()
    })
    this.defaultsBtn.on('pointerover', () => {
      if (this.drag >= 0) return
      this.focus = SET_DEFAULTS
      this.paintSettings()
    })
  }

  private buildHub(): void {
    const page = this.hubPage
    this.stamp(page, 'backgrounds/bg-wall.png', 0, 0)
    this.stamp(page, 'backgrounds/bg-floor-marble.png', 0, 140)
    this.stamp(page, 'labels/titles/title-hub-ice.png', 8, 4)
    this.stamp(page, 'icons/mini-bolt.png', 60, 5)
    this.bankIcon = this.stamp(page, 'icons/mini-coin.png', 126, 5)
    this.lifeText.roundPixels = true
    this.bankText.roundPixels = true
    page.addChild(this.lifeText, this.bankText)
    this.stamp(page, 'panels/panel-band-ice-306x94.png', 7, 20)
    this.stamp(page, 'labels/titles/title-forms-pearl.png', 13, 22)
    FORM_SLOTS.forEach((slot, index) => {
      const sprite = this.stamp(page, `form-slots/form-slot-${slot.id.toLowerCase()}-locked.png`, slot.x, 34)
      this.formSprites.push(sprite)
      const hit = new Container()
      hit.position.set(slot.x, 34)
      hit.eventMode = 'static'
      hit.cursor = slot.playable ? HAND : ARROW
      hit.hitArea = new Rectangle(0, 0, 60, 78)
      hit.on('pointerover', () => this.aim(index))
      if (slot.playable) {
        hit.on('pointertap', () => {
          this.focus = index
          this.hooks.toggleForm()
        })
      }
      page.addChild(hit)
    })
    this.stamp(page, 'panels/panel-band-amber-236x66.png', 80, 112)
    this.stamp(page, 'labels/titles/title-perks-pearl.png', 86, 113)
    PERK_POS.forEach((pos, index) => {
      const sprite = this.stamp(page, `perk-rows/perk-perk-${PERK_FILE[index]}-rank0.png`, pos.x, pos.y)
      this.perkSprites.push(sprite)
      const price = this.stamp(page, 'labels/price/price-100-ok.png', pos.x + 89, pos.y + 11)
      const coin = this.stamp(page, 'icons/mini-coin.png', pos.x + 89, pos.y + 10)
      const text = new Sprite(Texture.EMPTY)
      text.roundPixels = true
      text.position.set(pos.x + 101, pos.y + 12)
      page.addChild(text)
      const max = this.stamp(page, 'labels/chips/chip-max-ice.png', pos.x + 93, pos.y + 11)
      this.priceSprites.push(price)
      this.priceCoins.push(coin)
      this.priceText.push(text)
      this.maxChips.push(max)
      const hit = new Container()
      hit.position.set(pos.x, pos.y)
      hit.eventMode = 'static'
      hit.cursor = HAND
      hit.hitArea = new Rectangle(0, 0, 114, 26)
      hit.on('pointerover', () => this.aim(5 + index))
      hit.on('pointertap', () => {
        this.focus = 5 + index
        this.hooks.buy(index)
      })
      page.addChild(hit)
    })
    this.stamp(page, 'perk-rows/perk-perk-tank-rank0.png', 198, 149)
    this.tankPrice = this.stamp(page, 'labels/price/price-70-ok.png', 291, 160)
    const tankHit = new Container()
    tankHit.position.set(198, 149)
    tankHit.eventMode = 'static'
    tankHit.cursor = HAND
    tankHit.hitArea = new Rectangle(0, 0, 114, 26)
    tankHit.on('pointerover', () => this.aim(8))
    tankHit.on('pointertap', () => {
      this.focus = 8
      this.paintHub()
    })
    page.addChild(tankHit)
    this.stamp(page, 'sprites/dock-59v2.png', 14, 108)
    this.stamp(page, 'sprites/p0-roomba.png', 22, 122)
    this.hubBack = this.button(page, 'back-w60', 6, 157, 64, 23, () => this.hooks.go('title'))
    this.hubBack.on('pointerover', () => this.aim(9))
  }

  private paintHub(): void {
    const meta = this.meta
    this.bakeAt(this.lifeText, `LIFETIME ${meta.bolts}`, INK)
    this.lifeText.position.set(74, 6)
    this.bankIcon.position.set(74 + this.lifeText.texture.width + 8, 5)
    this.bakeAt(this.bankText, `BANKED ${meta.coins}`, INK)
    this.bankText.position.set(this.bankIcon.x + 14, 6)
    FORM_SLOTS.forEach((slot, index) => {
      const sprite = this.formSprites[index]
      if (!sprite) return
      const state = slotState(meta, index)
      this.use(sprite, `form-slots/form-slot-${slot.id.toLowerCase()}-${state}.png`)
    })
    HUB_PERKS.forEach((perk, index) => {
      const rank = perkRank(meta, index)
      const row = this.perkSprites[index]
      const file = PERK_FILE[index]
      if (row && file) this.use(row, `perk-rows/perk-perk-${file}-rank${rank}.png`)
      const cost = perk.costs[rank]
      const price = this.priceSprites[index]
      const coin = this.priceCoins[index]
      const text = this.priceText[index]
      const max = this.maxChips[index]
      const pos = PERK_POS[index]
      if (!price || !coin || !text || !max || !pos) return
      if (cost === undefined) {
        price.visible = false
        coin.visible = false
        text.visible = false
        max.visible = true
        return
      }
      max.visible = false
      const png = PRICE_PNG[cost]
      if (png) {
        price.visible = true
        coin.visible = false
        text.visible = false
        const afford = meta.coins >= cost ? 'ok' : 'short'
        this.use(price, `${png}-${afford}.png`)
        return
      }
      price.visible = false
      coin.visible = true
      text.visible = true
      coin.position.set(pos.x + 89, pos.y + 10)
      this.bakeAt(text, String(cost), meta.coins >= cost ? INK : SHORT)
      text.position.set(pos.x + 101, pos.y + 12)
    })
    const afford = meta.coins >= 70 ? 'ok' : 'short'
    this.use(this.tankPrice, `labels/price/price-70-${afford}.png`)
    this.use(this.hubBack, `buttons/labelled/btn-back-w60-${this.btnState(true, this.focus === 9, 'back-w60')}.png`)
    if (this.focus < 5) {
      const slot = FORM_SLOTS[this.focus]
      if (slot) this.showFrame(slot.x, 34, 60, 78)
      this.caret.visible = false
    } else if (this.focus < 9) {
      const pos = this.focus === 8 ? { x: 198, y: 149 } : PERK_POS[this.focus - 5]
      if (pos) this.showFrame(pos.x, pos.y, 114, 26)
      this.caret.visible = false
    } else {
      this.frame.visible = false
      this.placeCaret(6, 157)
    }
  }

  private keyHub(code: string): void {
    if (code === 'Escape' || code === 'Backspace') {
      this.hooks.go('title')
      return
    }
    if (code === 'Digit1' || code === 'Numpad1') this.hooks.buy(0)
    else if (code === 'Digit2' || code === 'Numpad2') this.hooks.buy(1)
    else if (code === 'Digit3' || code === 'Numpad3') this.hooks.buy(2)
    else if (code === 'Digit5' || code === 'Numpad5') this.hooks.toggleForm()
    else if (code === 'ArrowUp' || code === 'KeyW') this.moveHub(0, -1)
    else if (code === 'ArrowDown' || code === 'KeyS') this.moveHub(0, 1)
    else if (code === 'ArrowLeft' || code === 'KeyA') this.moveHub(-1, 0)
    else if (code === 'ArrowRight' || code === 'KeyD') this.moveHub(1, 0)
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.activateHub()
  }

  private moveHub(dx: number, dy: number): void {
    if (this.focus < 5) {
      if (dx !== 0) this.focus = Math.min(4, Math.max(0, this.focus + dx))
      else if (dy > 0) this.focus = 5
    } else if (this.focus === 9) {
      if (dy < 0) this.focus = 7
    } else {
      const i = this.focus - 5
      let col = i % 2
      let row = Math.floor(i / 2)
      if (dx !== 0) col = col === 0 ? 1 : 0
      if (dy !== 0) row += dy
      if (row < 0) this.focus = 0
      else if (row > 1) this.focus = 9
      else this.focus = 5 + row * 2 + col
    }
    this.paintHub()
  }

  private activateHub(): void {
    if (this.focus === 0) this.hooks.toggleForm()
    else if (this.focus >= 5 && this.focus < 8) this.hooks.buy(this.focus - 5)
    else if (this.focus === 9) this.hooks.go('title')
  }

  private buildPause(): void {
    const page = this.pausePage
    this.stamp(page, 'panels/panel-band-ice-124x136.png', 28, 24)
    this.stamp(page, 'labels/titles/title-paused-pearl.png', 65, 26)
    PAUSE_ITEMS.forEach((item) => {
      const sprite = this.button(page, item.key, item.x, item.y, 108, 23, () => {
        this.focus = PAUSE_ITEMS.findIndex((row) => row.id === item.id)
        this.activatePause()
      })
      sprite.on('pointerover', () => {
        const at = PAUSE_ITEMS.findIndex((row) => row.id === item.id)
        if (at >= 0) this.aim(at)
      })
      this.pauseBtns.push(sprite)
    })
    this.stamp(page, 'panels/panel-plain-130x136.png', 162, 24)
    const labels = [
      ['labels/text/floor-F3-steel0.png', 169, 31],
      ['labels/text/level-F3-steel0.png', 169, 40],
      ['labels/text/coins-F3-steel0.png', 169, 49],
      ['labels/text/bolts-F3-steel0.png', 169, 58],
      ['labels/text/time-F3-steel0.png', 169, 67],
      ['labels/text/upgrades-F3-steel0.png', 169, 81],
    ] as const
    for (const [file, x, y] of labels) this.stamp(page, file, x, y)
    for (const y of [31, 40, 49, 58, 67]) {
      const sprite = new Sprite(Texture.EMPTY)
      sprite.roundPixels = true
      sprite.position.set(209, y)
      page.addChild(sprite)
      this.pauseValues.push(sprite)
    }
    page.addChild(this.pauseIcons)
  }

  private paintPause(): void {
    PAUSE_ITEMS.forEach((item, index) => {
      const sprite = this.pauseBtns[index]
      if (!sprite) return
      this.use(sprite, `buttons/labelled/btn-${item.key}-${this.btnState(true, this.focus === index, item.key)}.png`)
    })
    const item = PAUSE_ITEMS[this.focus]
    if (item) this.placeCaret(item.x, item.y)
    this.frame.visible = false
    const card = this.card
    const rows = [card.floor, card.level, card.coins, card.bolts, card.time]
    rows.forEach((text, index) => {
      const sprite = this.pauseValues[index]
      if (sprite) this.bakeAt(sprite, text, INK)
    })
    const key = card.icons.map((icon) => icon.uid).join(',')
    if (key === this.iconKey) return
    this.iconKey = key
    for (const child of this.pauseIcons.removeChildren()) child.destroy()
    card.icons.forEach((icon, index) => {
      const sprite = new Sprite(icon)
      sprite.roundPixels = true
      sprite.eventMode = 'none'
      const col = index % 5
      const row = Math.floor(index / 5)
      sprite.position.set(170 + col * 20, 92 + row * 20)
      this.pauseIcons.addChild(sprite)
    })
  }

  private keyPause(code: string): void {
    if (code === 'Escape' || code === 'Backspace') {
      this.hooks.resume()
      return
    }
    if (code === 'ArrowUp' || code === 'KeyW') this.movePause(-1)
    else if (code === 'ArrowDown' || code === 'KeyS') this.movePause(1)
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.activatePause()
  }

  private movePause(dir: number): void {
    this.focus = (this.focus + dir + PAUSE_ITEMS.length) % PAUSE_ITEMS.length
    this.paintPause()
  }

  private activatePause(): void {
    const item = PAUSE_ITEMS[this.focus]
    if (!item) return
    if (item.id === 'resume') this.hooks.resume()
    else if (item.id === 'settings') this.hooks.go('settings', 'pause')
    else if (item.id === 'quit') this.hooks.quit()
    else this.hooks.abandon()
  }

  private paintBrief(): void {
    const meta = this.meta
    const key = `${meta.runs}|${meta.best}|${meta.coins}|${meta.bolts}|${meta.form}`
    if (key === this.briefKey && this.briefPage.children.length > 0) return
    this.briefKey = key
    this.clear(this.briefPage, this.briefTextures)
    this.briefTextures = []
    const g = new Graphics()
    g.eventMode = 'none'
    g.roundPixels = true
    g.rect(64, 40, 192, 88).fill(LINE)
    g.rect(65, 41, 190, 86).fill(PEARL)
    this.briefPage.addChild(g)
    const form = meta.form === 'p1' && meta.bolts >= 10 ? 'P1' : 'P0'
    const best = Math.min(5, Math.max(1, meta.best))
    const rows = [
      `RUN ${meta.runs + 1}`,
      `BEST ${FLOOR_NAME[best] ?? 'FOYER'}`,
      `BANKED ${meta.coins}`,
      `BOLTS ${meta.bolts}  FORM ${form}`,
    ]
    this.briefPage.addChild(this.line('NEW RUN', 108, 46, SANS, '#3d7f8c'))
    rows.forEach((row, index) => {
      this.briefPage.addChild(this.line(row, 76, 62 + index * 12, MINI, INK))
    })
    this.briefPage.addChild(this.line('PRESS START', 112, 136, SANS, INK))
    this.caret.visible = false
    this.frame.visible = false
  }

  private keyBrief(code: string): void {
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.hooks.start()
    else if (code === 'Escape' || code === 'Backspace') this.hooks.go(this.back)
  }

  private stamp(parent: Container, file: string, x: number, y: number): Sprite {
    const sprite = new Sprite(this.menu.get(file))
    sprite.position.set(x, y)
    sprite.roundPixels = true
    sprite.eventMode = 'none'
    parent.addChild(sprite)
    return sprite
  }

  private button(
    parent: Container, key: string, x: number, y: number, w: number, h: number, press: () => void,
  ): Sprite {
    const sprite = new Sprite(this.menu.get(`buttons/labelled/btn-${key}-normal.png`))
    sprite.position.set(x, y)
    sprite.roundPixels = true
    sprite.eventMode = 'static'
    sprite.cursor = HAND
    sprite.hitArea = new Rectangle(0, 0, w, h)
    sprite.on('pointerdown', () => {
      this.held = key
      this.paint()
    })
    sprite.on('pointerup', () => {
      if (this.held !== key) return
      this.held = ''
      press()
    })
    sprite.on('pointerupoutside', () => {
      this.held = ''
      this.paint()
    })
    parent.addChild(sprite)
    return sprite
  }

  private use(sprite: Sprite, file: string): void {
    const texture = this.menu.get(file)
    if (sprite.texture !== texture) sprite.texture = texture
  }

  private btnState(on: boolean, focused: boolean, key: string): string {
    if (!on) return 'disabled'
    if (this.held === key) return 'pressed'
    if (focused) return 'hover'
    return 'normal'
  }

  private showFrame(x: number, y: number, w: number, h: number): void {
    this.frame.visible = true
    this.frame.position.set(x - 6, y - 6)
    this.frame.width = w + 12
    this.frame.height = h + 12
  }

  private aim(index: number): void {
    if (this.drag >= 0 || this.focus === index) return
    this.focus = index
    this.paint()
  }

  private placeCaret(x: number, y: number, h = 23): void {
    this.caret.visible = true
    this.caret.position.set(Math.max(0, x - 16), y + Math.round(h / 2) - 7)
    this.screen.addChild(this.caret, this.caretFx)
  }

  private bakeAt(sprite: Sprite, text: string, color: string): void {
    const key = `${color}|${text}`
    if (this.labels.get(sprite) === key) return
    this.labels.set(sprite, key)
    const prev = sprite.texture
    sprite.texture = bake(this.art.addon.fontMini, MINI, text, color)
    if (prev !== Texture.EMPTY) prev.destroy(true)
  }

  private line(text: string, x: number, y: number, font: FontMetrics, color: string): Sprite {
    const sheet = font === SANS ? this.art.addon.fontSans : this.art.addon.fontMini
    const texture = bake(sheet, font, text, color)
    this.briefTextures.push(texture)
    const sprite = new Sprite(texture)
    sprite.position.set(x, y)
    sprite.roundPixels = true
    return sprite
  }

  private clear(node: Container, textures: Texture[]): void {
    for (const child of node.removeChildren()) child.destroy({ children: true })
    for (const texture of textures) texture.destroy(true)
  }
}

function volumeAt(localX: number): number {
  const t = (localX - 140) / 74
  return Math.round(Math.min(1, Math.max(0, t)) * 20) * 5
}

function slotState(meta: Meta, index: number): 'owned' | 'ready' | 'locked' {
  const slot = FORM_SLOTS[index]
  if (!slot?.playable || meta.bolts < slot.bolts) return 'locked'
  return meta.form === 'p1' ? 'owned' : 'ready'
}
