import { Application } from 'pixi.js'
import { loadArt, loadBossArt, loadFoeArt } from './assets.ts'
import { Game } from './game.ts'
import { loadMansionArt } from './mansion-view.ts'
import { loadMenuArt } from './menu.ts'
import { VIEW_H, VIEW_W, worldSize } from './spec.ts'

const app = new Application()

await app.init({
  width: VIEW_W,
  height: VIEW_H,
  background: 0x9aa3aa,
  antialias: false,
  resolution: 1,
  autoDensity: false,
  preference: 'webgl',
})

const canvas = app.canvas
document.getElementById('pixi-container')!.appendChild(canvas)

const SHELL = [document.documentElement, document.body, document.getElementById('app'), document.getElementById('pixi-container')]
// Title wall is #eff1f3. The page color shows in the integer-scale bars around that screen.
const TITLE_PAGE = '#eff1f3'

function paintPage(color: string): void {
  for (const node of SHELL) {
    if (node) node.style.background = color
  }
}

const art = await loadArt()
const tiles = await loadMansionArt()
const foes = await loadFoeArt()
const bosses = await loadBossArt()
const menu = await loadMenuArt()
const game = new Game(app.stage, art, tiles, foes, bosses, menu)

function fit(): void {
  const sw = Math.max(1, window.innerWidth)
  const sh = Math.max(1, window.innerHeight)
  if (game.titleFull()) {
    paintPage(TITLE_PAGE)
    const scale = Math.max(1, Math.floor(Math.min(sw / VIEW_W, sh / VIEW_H)))
    app.renderer.resize(VIEW_W, VIEW_H)
    canvas.style.position = 'absolute'
    canvas.style.left = `${Math.floor((sw - VIEW_W * scale) / 2)}px`
    canvas.style.top = `${Math.floor((sh - VIEW_H * scale) / 2)}px`
    canvas.style.width = `${VIEW_W * scale}px`
    canvas.style.height = `${VIEW_H * scale}px`
    canvas.style.imageRendering = 'pixelated'
    game.setView(VIEW_W, VIEW_H)
    return
  }
  paintPage('')
  canvas.style.position = ''
  canvas.style.left = ''
  canvas.style.top = ''
  let scale = Math.max(1, Math.floor(Math.min(sw / VIEW_W, sh / VIEW_H)))
  if (scale > 1) scale -= 1
  let w = Math.max(1, Math.round(sw / scale))
  let h = Math.max(1, Math.round(sh / scale))
  while ((w > worldSize.w || h > worldSize.h) && scale < 200) {
    scale += 1
    w = Math.max(1, Math.round(sw / scale))
    h = Math.max(1, Math.round(sh / scale))
  }
  app.renderer.resize(w, h)
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.imageRendering = 'pixelated'
  game.setView(w, h)
}

fit()
addEventListener('resize', fit)
app.ticker.add((ticker) => game.update(ticker.deltaMS))
