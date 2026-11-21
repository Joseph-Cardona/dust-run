import { CanvasSource, Sprite, Texture } from 'pixi.js'

const RAW: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001001001',
  '8': '111101111101111',
  '9': '111101111001111',
  'A': '111101111101101',
  'C': '111100100100111',
  'D': '110101101101110',
  'E': '111100111100111',
  'F': '111100111100100',
  'H': '101101111101101',
  'I': '111010010010111',
  'K': '101110100101101',
  'L': '100100100100111',
  'M': '101111101101101',
  'N': '101111111101101',
  'O': '111101101101111',
  'P': '111101111100100',
  'S': '111100111001111',
  'V': '101101101101010',
  'W': '101101101111101',
  'Y': '101101010010010',
  ' ': '000000000000000',
}

export function textTexture(text: string, color: string): Texture {
  const chars = text.toUpperCase()
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, chars.length * 4 - 1)
  canvas.height = 5
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = color
  let x0 = 0
  for (const ch of chars) {
    const bits = RAW[ch] ?? RAW[' ']
    for (let i = 0; i < 15; i++) {
      if (bits[i] !== '1') continue
      ctx.fillRect(x0 + (i % 3), (i / 3) | 0, 1, 1)
    }
    x0 += 4
  }
  const source = new CanvasSource({
    resource: canvas,
    resolution: 1,
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
    autoDensity: false,
  })
  return new Texture({ source })
}

export function textSprite(text: string, color: string, x: number, y: number): Sprite {
  const sprite = new Sprite(textTexture(text, color))
  sprite.position.set(x, y)
  sprite.roundPixels = true
  return sprite
}

export function rewrite(sprite: Sprite, text: string, color: string): void {
  const old = sprite.texture
  sprite.texture = textTexture(text, color)
  old.destroy(true)
}
