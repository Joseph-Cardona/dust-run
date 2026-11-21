import { CanvasSource, Texture } from 'pixi.js'

export interface Glyph {
  x: number
  y: number
  w: number
  h: number
  advance: number
}

export interface FontMetrics {
  line_height: number
  glyphs: Record<string, Glyph>
}

/** Bake one line of the mansion bitmap font. Glyph sheets are ink; `color` replaces that ink. */
export function bake(sheet: Texture, font: FontMetrics, text: string, color: string): Texture {
  const chars = text.toUpperCase()
  const space = font.glyphs[' ']?.advance ?? 4
  let width = 0
  for (const ch of chars) width += font.glyphs[ch]?.advance ?? space
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = font.line_height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Texture.EMPTY
  ctx.imageSmoothingEnabled = false
  const image = sheet.source.resource as CanvasImageSource
  let x = 0
  for (const ch of chars) {
    const glyph = font.glyphs[ch]
    if (!glyph) {
      x += space
      continue
    }
    if (glyph.w > 0 && glyph.h > 0) {
      ctx.drawImage(image, glyph.x, glyph.y, glyph.w, glyph.h, x, 0, glyph.w, glyph.h)
    }
    x += glyph.advance
  }
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const source = new CanvasSource({
    resource: canvas,
    resolution: 1,
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
    autoDensity: false,
  })
  return new Texture({ source })
}
