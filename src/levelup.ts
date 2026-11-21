import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Art } from './assets.ts'
import miniFont from './data/63-mansion-mini-3x5.json' with { type: 'json' }
import sansFont from './data/63-mansion-sans-5x7.json' with { type: 'json' }
import { audio } from './audio.ts'
import { bake, type FontMetrics } from './font-bm.ts'
import type { CardDraw, Rarity } from './upgrades.ts'

const INK = '#1f242a'
const MINI = miniFont as FontMetrics
const SANS = sansFont as FontMetrics
const PIP: Record<Rarity, number> = {
  common: 0x8a939a,
  rare: 0x3d7f8c,
  epic: 0xc48a28,
  legendary: 0xc45a48,
}
const BRANCH: Record<string, string> = {
  SUCTION: '#3d6d78',
  BLADES: '#8d4038',
  CHASSIS: '#8a4a32',
  MOTOR: '#5c5c28',
  TECH: '#8a6420',
  GIFT: '#3d444c',
}

export interface LevelHooks {
  take(index: number): void
  skip(): void
  reroll(): boolean
  repair(): void
}

interface CardFace {
  root: Container
  front: Container
  back: Sprite
}

export class LevelUp {
  readonly root = new Container()
  hooks: LevelHooks = { take() {}, skip() {}, reroll: () => false, repair() {} }
  private readonly scrim = new Graphics()
  private readonly panel = new Container()
  private readonly cards: CardFace[] = []
  private readonly subtitle: Sprite
  private readonly barBack: Sprite
  private readonly barFill: Sprite
  private readonly cost: Sprite
  private readonly costBack: Graphics
  private readonly buttons: Container
  private readonly shopActs: Container
  private readonly purse: Sprite
  private readonly priceRows: { sprite: Sprite; price: number }[] = []
  private purseCoins = 0
  private focus = 0
  private readonly sold = new Set<number>()
  private chosen = 0
  private phase: 'hidden' | 'reveal' | 'idle' | 'select' = 'hidden'
  private ms = 0
  private viewW = 320
  private viewH = 180
  private baked: Texture[] = []

  constructor(private art: Art) {
    this.root.addChild(this.scrim, this.panel)
    this.root.visible = false
    const title = new Sprite(art.addon.title)
    title.position.set(126, 4)
    title.roundPixels = true
    this.subtitle = new Sprite(Texture.EMPTY)
    this.subtitle.roundPixels = true
    this.barBack = new Sprite(art.addon.xpBar)
    this.barBack.position.set(104, 30)
    this.barBack.alpha = 0.35
    this.barBack.roundPixels = true
    this.barFill = new Sprite(art.addon.xpBar)
    this.barFill.position.set(104, 30)
    this.barFill.roundPixels = true
    this.buttons = new Container()
    const reroll = new Sprite(art.addon.btnReroll)
    reroll.position.set(8, 157)
    reroll.roundPixels = true
    reroll.eventMode = 'static'
    reroll.cursor = 'pointer'
    reroll.on('pointertap', () => this.onReroll())
    const skip = new Sprite(art.addon.btnSkip)
    skip.position.set(214, 157)
    skip.roundPixels = true
    skip.eventMode = 'static'
    skip.cursor = 'pointer'
    skip.on('pointertap', () => this.onSkip())
    this.cost = new Sprite(Texture.EMPTY)
    this.cost.roundPixels = true
    this.costBack = new Graphics()
    this.buttons.addChild(reroll, skip, this.costBack, this.cost)
    this.shopActs = new Container()
    this.shopActs.visible = false
    this.shopActs.addChild(
      this.shopBtn('REPAIR 20', 8, () => this.hooks.repair()),
      this.shopBtn('LEAVE', 214, () => this.onSkip()),
    )
    this.purse = new Sprite(Texture.EMPTY)
    this.purse.roundPixels = true
    this.purse.visible = false
    this.purse.eventMode = 'none'
    this.panel.addChild(title, this.subtitle, this.barBack, this.barFill, this.buttons, this.shopActs, this.purse)
  }

  setView(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    this.layout()
  }

  instant = false

  open(
    cards: (CardDraw & { price?: number })[],
    level: number,
    xp: number,
    need: number,
    cost: number,
    label?: string,
    instant = false,
    coins = 0,
  ): void {
    this.clearFaces()
    this.focus = 0
    this.sold.clear()
    this.purseCoins = instant ? coins : 0
    this.phase = instant ? 'idle' : 'reveal'
    this.ms = 0
    this.instant = instant
    this.buttons.visible = !instant
    this.shopActs.visible = instant
    this.root.visible = true
    this.put(this.subtitle, label ?? `LEVEL ${level} - PICK ONE UPGRADE`, SANS, INK)
    this.subtitle.position.set(Math.round((320 - this.subtitle.texture.width) / 2), 18)
    const width = Math.max(0, Math.round(112 * Math.max(0, Math.min(1, need <= 0 ? 0 : xp / need))))
    if (this.barFill.texture !== this.art.addon.xpBar) this.barFill.texture.destroy(false)
    this.barFill.visible = width > 0
    this.barFill.texture = width > 0
      ? new Texture({ source: this.art.addon.xpBar.source, frame: new Rectangle(0, 0, width, 9) })
      : this.art.addon.xpBar
    this.coverCost(cost)
    cards.slice(0, 3).forEach((card, index) => this.buildCard(card, index))
    if (instant) this.setPurse(coins)
    else this.purse.visible = false
    this.layout()
    this.placeCards()
  }

  setPurse(coins: number): void {
    this.purseCoins = coins
    this.purse.visible = this.instant
    if (!this.instant) return
    this.put(this.purse, `${coins} COINS`, SANS, '#c48a28')
    this.purse.position.set(Math.round(320 - 6 - this.purse.texture.width), 5)
    for (const row of this.priceRows) {
      this.retint(row.sprite, `${row.price} COINS`, MINI, coins >= row.price ? '#c48a28' : '#c45a48')
      row.sprite.x = Math.round((94 - row.sprite.texture.width) / 2)
    }
  }

  hide(): void {
    this.phase = 'hidden'
    this.instant = false
    this.buttons.visible = true
    this.shopActs.visible = false
    this.purse.visible = false
    this.root.visible = false
    this.clearFaces()
  }

  index(): number {
    return this.focus
  }

  nudge(dir: number): void {
    if (this.phase !== 'idle') return
    this.focus = (this.focus + dir + 3) % 3
    audio.ui('hover')
    this.placeCards()
  }

  markSold(index: number): void {
    const card = this.cards[index]
    if (!card || this.sold.has(index)) return
    this.sold.add(index)
    card.root.cursor = 'default'
    this.line(card.front, 'SOLD', SANS, '#c45a48', 30, 32)
    this.placeCards()
  }

  onKey(code: string): void {
    if (this.phase !== 'idle') return
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.focus = (this.focus + 2) % 3
      audio.ui('hover')
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      this.focus = (this.focus + 1) % 3
      audio.ui('hover')
    }
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') this.choose(this.focus)
    if (code === 'KeyR') this.onReroll()
    if (code === 'KeyX') this.onSkip()
    this.placeCards()
  }

  update(dtMs: number): void {
    if (!this.root.visible || this.phase === 'hidden') return
    this.ms += dtMs
    if (this.phase === 'reveal' && this.ms >= 520) {
      this.phase = 'idle'
      this.ms = 0
    } else if (this.phase === 'select' && this.ms >= 320) {
      const index = this.chosen
      this.phase = 'hidden'
      this.hooks.take(index)
    }
    this.placeCards()
  }

  private onReroll(): void {
    if (this.phase !== 'idle') return
    audio.ui('select')
    this.hooks.reroll()
  }

  private onSkip(): void {
    if (this.phase !== 'idle') return
    audio.ui('select')
    this.hooks.skip()
  }

  private choose(index: number): void {
    if (this.sold.has(index)) return
    if (this.instant) {
      if (this.phase !== 'idle') return
      this.hooks.take(index)
      return
    }
    if (this.phase !== 'idle' || !this.cards[index]) return
    audio.ui('select')
    this.chosen = index
    this.focus = index
    this.phase = 'select'
    this.ms = 0
  }

  private layout(): void {
    this.scrim.clear()
    this.scrim.rect(0, 0, this.viewW, this.viewH).fill({ color: 0xe7e2d8, alpha: 192 / 255 })
    this.panel.position.set(Math.round((this.viewW - 320) / 2), Math.round((this.viewH - 180) / 2))
  }

  private placeCards(): void {
    this.cards.forEach((card, index) => {
      let y = 36
      let alpha = 1
      let showFront = true
      if (this.phase === 'reveal') {
        const local = Math.max(0, Math.min(1, this.ms / 420 - index * 0.15))
        const eased = 1 - (1 - local) ** 3
        y = 120 + (36 - 120) * eased
        showFront = local >= 0.55
      } else if (this.phase === 'select') {
        const eased = Math.max(0, Math.min(1, this.ms / 320))
        if (index === this.chosen) y = 36 - 3 * eased
        else {
          y = 36 + 48 * eased
          alpha = 1 - eased
        }
      } else if (index === this.focus) {
        y = 33
      }
      if (this.sold.has(index)) alpha = 0.55
      card.root.position.set([12, 113, 214][index] ?? 12, Math.round(y))
      card.root.alpha = alpha
      card.front.visible = showFront
      card.back.visible = !showFront
    })
    const buttonsUp = this.phase === 'reveal' ? Math.max(0, Math.min(1, (this.ms - 200) / 280)) : 1
    this.buttons.alpha = this.phase === 'select' ? Math.max(0, 1 - this.ms / 200) : 1
    this.buttons.y = this.phase === 'reveal' ? Math.round((1 - buttonsUp) * 12) : 0
  }

  private shopBtn(label: string, x: number, press: () => void): Container {
    const root = new Container()
    root.position.set(x, 157)
    root.eventMode = 'static'
    root.cursor = 'pointer'
    root.hitArea = new Rectangle(0, 0, 98, 22)
    const plate = new Graphics()
    plate.roundPixels = true
    plate.eventMode = 'none'
    plate.rect(0, 0, 98, 22).fill(0x1f242a)
    plate.rect(1, 1, 96, 20).fill(0xd9d3c6)
    const text = new Sprite(Texture.EMPTY)
    text.eventMode = 'none'
    text.roundPixels = true
    this.put(text, label, MINI, INK)
    text.position.set(Math.round((98 - text.texture.width) / 2), Math.round((22 - text.texture.height) / 2))
    root.addChild(plate, text)
    root.on('pointertap', press)
    return root
  }

  private buildCard(card: CardDraw & { price?: number }, index: number): void {
    const root = new Container()
    root.eventMode = 'static'
    root.cursor = 'pointer'
    root.on('pointerover', () => {
      this.focus = index
      if (this.phase === 'idle') this.placeCards()
    })
    root.on('pointertap', () => this.choose(index))
    const back = new Sprite(this.art.addon.cardBack)
    back.roundPixels = true
    const front = new Container()
    const frame = new Sprite(this.art.addon.card[card.rarity])
    frame.roundPixels = true
    front.addChild(frame)
    const icon = new Sprite(this.art.addon.icon[card.id] ?? Texture.EMPTY)
    icon.position.set(39, 25)
    icon.roundPixels = true
    front.addChild(icon)
    this.line(front, card.rarity.toUpperCase(), MINI, INK, 5, 4)
    const name = this.line(front, card.name, SANS, INK, 0, 51)
    name.x = Math.round((94 - name.texture.width) / 2)
    this.line(front, card.tier, MINI, INK, 5, 61)
    this.wrap(front, card.text)
    if (card.price !== undefined) {
      const price = this.line(front, `${card.price} COINS`, MINI, this.purseCoins >= card.price ? '#c48a28' : '#c45a48', 0, 112)
      price.x = Math.round((94 - price.texture.width) / 2)
      this.priceRows.push({ sprite: price, price: card.price })
    }
    if (card.formLine) this.line(front, card.formLine, MINI, INK, 5, 99)
    this.line(front, card.branch, MINI, BRANCH[card.branch] ?? INK, 5, 105)
    const pips = new Graphics()
    for (let i = 0; i < card.pips; i++) {
      pips.rect(88 - card.pips * 4 + i * 4, 5, 3, 3).fill({ color: PIP[card.rarity] })
    }
    front.addChild(pips)
    root.addChild(back, front)
    this.panel.addChild(root)
    this.cards.push({ root, front, back })
  }

  private wrap(parent: Container, text: string): void {
    const words = text.toUpperCase().split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (next.length > 21 && line) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
    lines.slice(0, 4).forEach((row, index) => {
      this.line(parent, row, MINI, INK, 5, 71 + index * 7)
    })
  }

  private line(
    parent: Container, text: string, font: FontMetrics, color: string, x: number, y: number,
  ): Sprite {
    const texture = this.paint(font, text, color)
    const sprite = new Sprite(texture)
    sprite.position.set(x, y)
    sprite.roundPixels = true
    parent.addChild(sprite)
    return sprite
  }

  private put(sprite: Sprite, text: string, font: FontMetrics, color: string): void {
    const old = sprite.texture
    const sheet = font === SANS ? this.art.addon.fontSans : this.art.addon.fontMini
    sprite.texture = bake(sheet, font, text, color)
    if (old !== Texture.EMPTY) old.destroy(true)
  }

  private coverCost(cost: number): void {
    this.costBack.clear()
    this.costBack.rect(64, 163, 36, 10).fill({ color: 0xd9d3c6 })
    this.put(this.cost, String(cost), MINI, INK)
    this.cost.position.set(72, 165)
  }

  private retint(sprite: Sprite, text: string, font: FontMetrics, color: string): void {
    const old = sprite.texture
    sprite.texture = this.paint(font, text, color)
    const index = this.baked.indexOf(old)
    if (index >= 0) this.baked.splice(index, 1)
    if (old !== Texture.EMPTY) old.destroy(true)
  }

  private paint(font: FontMetrics, text: string, color: string): Texture {
    const sheet = font === SANS ? this.art.addon.fontSans : this.art.addon.fontMini
    const texture = bake(sheet, font, text, color)
    this.baked.push(texture)
    return texture
  }

  private clearFaces(): void {
    for (const card of this.cards) {
      this.panel.removeChild(card.root)
      card.root.destroy({ children: true })
    }
    this.cards.length = 0
    this.priceRows.length = 0
    this.sold.clear()
    for (const texture of this.baked) texture.destroy(true)
    this.baked.length = 0
  }
}
