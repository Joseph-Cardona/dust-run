import { Container, Sprite } from 'pixi.js'
import type { Art } from './assets.ts'

interface Puff {
  sprite: Sprite
  ms: number
  steel: boolean
  kind: 'dust' | 'pop'
}

export class Fx {
  readonly layer = new Container()
  private puffs: Puff[] = []

  constructor(private art: Art) {}

  dust(x: number, y: number): void {
    const sprite = new Sprite(this.art.dust[0])
    sprite.position.set(Math.round(x), Math.round(y))
    sprite.roundPixels = true
    this.layer.addChild(sprite)
    this.puffs.push({ sprite, ms: 0, steel: false, kind: 'dust' })
  }

  pop(x: number, y: number, steel: boolean): void {
    const frames = steel ? this.art.popSteel : this.art.popGold
    const sprite = new Sprite(frames[0])
    sprite.position.set(Math.round(x - 12), Math.round(y - 12))
    sprite.roundPixels = true
    this.layer.addChild(sprite)
    this.puffs.push({ sprite, ms: 0, steel, kind: 'pop' })
  }

  update(dtMs: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i]
      puff.ms += dtMs
      const frameMs = puff.kind === 'dust' ? 100 : 70
      const frames = puff.kind === 'dust'
        ? this.art.dust
        : puff.steel ? this.art.popSteel : this.art.popGold
      const frame = Math.floor(puff.ms / frameMs)
      if (frame >= frames.length) {
        puff.sprite.destroy()
        this.puffs.splice(i, 1)
        continue
      }
      puff.sprite.texture = frames[frame]
    }
  }
}
