import { makeRng, type Rng } from './rng.ts'

export const CELL_W = 20
export const CELL_H = 12
export const MANSION_TILE = 16

export type Side = 'n' | 's' | 'e' | 'w'
export type DoorState = 'open' | 'arch' | 'closed' | 'locked' | 'oneway_in' | 'oneway_out' | 'front' | 'sealed'

export interface DoorRef {
  cx: number
  cy: number
  side: Side
  state: DoorState
}

export interface MansionRoom {
  theme: string
  x: number
  y: number
  w: number
  h: number
  role: string | null
  doors: DoorRef[]
}

export interface FloorPlan {
  floor: number
  seed: number
  cols: number
  rows: number
  start: number
  rooms: MansionRoom[]
}

interface ThemeDef {
  floor: string | null
  wall: string | null
  sizes: [number, number][]
  roles: string[]
  floors: number[]
}

const THEME_ORDER = [
  'foyer', 'hallway', 'dining', 'kitchen', 'library', 'ballroom', 'bathroom', 'bedroom',
  'conservatory', 'gallery', 'wine_cellar', 'basement', 'laundry', 'study', 'attic',
  'trophy', 'server', 'panic', 'storage', 'boiler', 'stairwell',
] as const

export const THEMES: Record<string, ThemeDef> = {
  foyer: { floor: 'marble', wall: 'plaster', sizes: [[2, 2]], roles: ['start', 'dock', 'shop'], floors: [1] },
  hallway: { floor: null, wall: null, sizes: [[1, 1]], roles: [], floors: [1, 2, 3, 4, 5] },
  dining: { floor: 'parquet', wall: 'wood', sizes: [[2, 1]], roles: ['combat', 'elite', 'shop'], floors: [1] },
  kitchen: { floor: 'linoleum', wall: 'tile', sizes: [[2, 1], [1, 1]], roles: ['combat', 'dock', 'shop'], floors: [1] },
  library: { floor: 'hardwood', wall: 'library', sizes: [[2, 1], [2, 2]], roles: ['combat', 'elite', 'shrine'], floors: [1, 2] },
  ballroom: { floor: 'ballroom', wall: 'wallpaper', sizes: [[2, 2]], roles: ['elite', 'boss', 'combat'], floors: [1, 5] },
  bathroom: { floor: 'bath', wall: 'tile', sizes: [[1, 1]], roles: ['combat', 'dock'], floors: [2] },
  bedroom: { floor: 'carpet_ice', wall: 'wallpaper', sizes: [[1, 1], [2, 1]], roles: ['combat', 'shrine', 'dock', 'stairs'], floors: [2] },
  conservatory: { floor: 'terratile', wall: 'glass', sizes: [[2, 2], [2, 1]], roles: ['shrine', 'combat', 'elite'], floors: [1] },
  gallery: { floor: 'marble', wall: 'plaster', sizes: [[2, 1], [1, 2]], roles: ['combat', 'elite', 'shrine', 'shop'], floors: [1, 2] },
  wine_cellar: { floor: 'brick', wall: 'brick', sizes: [[2, 1], [1, 1]], roles: ['combat', 'shrine', 'elite'], floors: [3] },
  basement: { floor: 'concrete', wall: 'concrete', sizes: [[1, 1], [2, 1], [2, 2]], roles: ['combat', 'elite', 'dock', 'stairs', 'boss'], floors: [3, 4] },
  laundry: { floor: 'checker', wall: 'tile', sizes: [[1, 1]], roles: ['dock', 'combat'], floors: [2, 3] },
  study: { floor: 'carpet_olive', wall: 'wood', sizes: [[1, 1]], roles: ['shop', 'shrine', 'stairs', 'combat'], floors: [1, 2] },
  attic: { floor: 'attic', wall: 'attic', sizes: [[2, 1], [1, 1]], roles: ['shrine', 'combat', 'stairs'], floors: [2] },
  trophy: { floor: 'hardwood', wall: 'library', sizes: [[1, 1], [2, 1]], roles: ['shrine', 'elite', 'combat'], floors: [2] },
  server: { floor: 'grate', wall: 'server', sizes: [[1, 1], [2, 1], [2, 2]], roles: ['combat', 'elite', 'dock', 'boss', 'stairs'], floors: [4, 5] },
  panic: { floor: 'grate', wall: 'server', sizes: [[2, 2]], roles: ['boss'], floors: [5] },
  storage: { floor: 'flagstone', wall: 'stone', sizes: [[1, 1], [2, 1], [2, 2]], roles: ['combat', 'shrine', 'elite', 'stairs'], floors: [3, 4] },
  boiler: { floor: 'grate', wall: 'brick', sizes: [[1, 1], [2, 1]], roles: ['combat', 'elite', 'dock'], floors: [3, 4] },
  stairwell: { floor: 'flagstone', wall: 'stone', sizes: [[1, 1]], roles: ['stairs', 'start'], floors: [1, 2, 3, 4, 5] },
}

const CAPS: Record<string, number> = {
  storage: 2, boiler: 2, foyer: 1, ballroom: 1, dining: 1, kitchen: 1, library: 1,
  conservatory: 1, panic: 1, stairwell: 1, trophy: 1, attic: 2, bedroom: 3, bathroom: 2,
  study: 2, gallery: 2, wine_cellar: 3, basement: 2, laundry: 2, server: 5,
}

const STYLE: Record<number, { w: number; h: number; theme: string; size: [number, number] }> = {
  1: { w: 10, h: 6, theme: 'foyer', size: [2, 2] },
  2: { w: 10, h: 6, theme: 'stairwell', size: [1, 1] },
  3: { w: 9, h: 6, theme: 'stairwell', size: [1, 1] },
  4: { w: 9, h: 6, theme: 'stairwell', size: [1, 1] },
  5: { w: 8, h: 6, theme: 'stairwell', size: [1, 1] },
}

const OPP: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' }
const DV: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
const SIDES: Side[] = ['n', 's', 'e', 'w']

interface Draft {
  theme: string
  x: number
  y: number
  w: number
  h: number
  role: string | null
}

type LinkState = DoorState | 'oneway' | { kind: 'oneway'; from: string; to: string }

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

function doorKey(cx: number, cy: number, side: Side): string {
  return `${cx},${cy},${side}`
}

function hasSize(theme: string, w: number, h: number): boolean {
  return THEMES[theme].sizes.some(([sw, sh]) => sw === w && sh === h)
}

export function buildFloor(floor: number, seed: number): FloorPlan {
  const plan = generate(floor, seed)
  const problems = auditPlan(plan)
  if (problems.length > 0) throw new Error(`floor ${floor} seed ${seed}: ${problems.join('; ')}`)
  return plan
}

/** Throws when a sample mansion breaks the layout rules. */
export function auditSamples(): void {
  for (const floor of [1, 2, 3, 4, 5]) {
    for (const seed of [7, 360]) buildFloor(floor, seed)
  }
}

function generate(floor: number, seed: number): FloorPlan {
  const rng = makeRng(seed * 31 + floor)
  const style = STYLE[floor]
  const cols = style.w
  const rows = style.h
  const grid = new Map<string, number>()
  const rooms: Draft[] = []
  const links = new Map<string, LinkState>()

  function add(theme: string, x: number, y: number, w: number, h: number): number | null {
    const cells: [number, number][] = []
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) cells.push([x + i, y + j])
    }
    if (cells.some(([cx, cy]) => grid.has(cellKey(cx, cy)) || cx < 0 || cy < 0 || cx >= cols || cy >= rows)) return null
    const id = rooms.length
    rooms.push({ theme, x, y, w, h, role: null })
    for (const [cx, cy] of cells) grid.set(cellKey(cx, cy), id)
    return id
  }

  function linkKey(a: [number, number], b: [number, number]): string {
    return `${a[0]},${a[1]}>${b[0]},${b[1]}`
  }

  const [sw, sh] = style.size
  const sx = rng.randrange(0, cols - sw + 1)
  const sy = rows - sh
  const start = add(style.theme, sx, sy, sw, sh) ?? 0
  const blocked = new Set<string>()
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) blocked.add(cellKey(sx + i, sy + j))
  }
  const seeds: [number, number][] = []
  for (let i = 0; i < sw; i++) {
    if (sy - 1 >= 0) seeds.push([sx + i, sy - 1])
  }
  const hallCells = growHalls(rng, cols, rows, blocked, seeds)
  for (const [x, y] of hallCells) {
    if (!grid.has(cellKey(x, y))) add('hallway', x, y, 1, 1)
  }
  for (const [x, y] of hallCells) {
    for (const side of ['e', 's'] as const) {
      const [dx, dy] = DV[side]
      const nx = x + dx
      const ny = y + dy
      const other = grid.get(cellKey(nx, ny))
      if (other === undefined || rooms[other].theme !== 'hallway') continue
      links.set(linkKey([x, y], [nx, ny]), 'arch')
    }
  }
  for (let i = 0; i < sw; i++) {
    const x = sx + i
    const y = sy
    const other = grid.get(cellKey(x, y - 1))
    if (other === undefined || rooms[other].theme !== 'hallway') continue
    links.set(linkKey([x, y], [x, y - 1]), 'arch')
  }

  const count = new Map<string, number>()
  const themePool = THEME_ORDER.filter((theme) => (
    THEMES[theme].floors.includes(floor) && theme !== 'hallway' && theme !== 'foyer' && theme !== 'stairwell'
  ))
  const okTheme = (theme: string): boolean => (count.get(theme) ?? 0) < (CAPS[theme] ?? 2)
  const touches = (x: number, y: number, w: number, h: number): boolean => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        for (const side of SIDES) {
          const [dx, dy] = DV[side]
          const nx = x + i + dx
          const ny = y + j + dy
          const id = grid.get(cellKey(nx, ny))
          if (id === undefined) continue
          if (rooms[id].theme !== 'hallway') continue
          if (nx >= x && nx < x + w && ny >= y && ny < y + h) continue
          return true
        }
      }
    }
    return false
  }
  const sizes: [number, number][] = [[2, 2], [2, 1], [1, 2], [1, 1]]
  for (let n = 0; n < 400; n++) {
    const free: [number, number][] = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!grid.has(cellKey(x, y))) free.push([x, y])
      }
    }
    if (free.length === 0) break
    const opts: { area: number; roll: number; x: number; y: number; w: number; h: number; themes: string[] }[] = []
    for (const [x, y] of free) {
      for (const [w, h] of sizes) {
        let fits = true
        for (let j = 0; j < h && fits; j++) {
          for (let i = 0; i < w; i++) {
            if (grid.has(cellKey(x + i, y + j)) || x + i >= cols || y + j >= rows) fits = false
          }
        }
        if (!fits || !touches(x, y, w, h)) continue
        const themes = themePool.filter((theme) => hasSize(theme, w, h) && okTheme(theme))
        if (themes.length === 0) continue
        opts.push({ area: -(w * h), roll: rng.random(), x, y, w, h, themes })
      }
    }
    if (opts.length === 0) break
    opts.sort((a, b) => a.area - b.area || a.roll - b.roll || a.x - b.x || a.y - b.y)
    const pick = opts[Math.min(opts.length - 1, rng.randrange(3))]
    const theme = rng.choice(pick.themes)
    add(theme, pick.x, pick.y, pick.w, pick.h)
    count.set(theme, (count.get(theme) ?? 0) + 1)
    const mx = cols - pick.x - pick.w
    if (mx !== pick.x) {
      const mirrorThemes = themePool.filter((item) => hasSize(item, pick.w, pick.h) && okTheme(item))
      let placed = false
      if (mirrorThemes.length > 0 && touches(mx, pick.y, pick.w, pick.h)) {
        const mirror = rng.choice(mirrorThemes)
        if (add(mirror, mx, pick.y, pick.w, pick.h) !== null) {
          count.set(mirror, (count.get(mirror) ?? 0) + 1)
          placed = true
        }
      }
      if (!placed) {
        for (const [sw, sh] of [[pick.w, 1], [1, pick.h], [1, 1]] as [number, number][]) {
          for (let j = 0; j < pick.h; j++) {
            for (let i = 0; i < pick.w; i++) {
              const xx = mx + i
              const yy = pick.y + j
              if (xx + sw > mx + pick.w || yy + sh > pick.y + pick.h) continue
              let open = touches(xx, yy, sw, sh)
              for (let b = 0; b < sh && open; b++) {
                for (let a = 0; a < sw; a++) {
                  if (grid.has(cellKey(xx + a, yy + b))) open = false
                }
              }
              if (!open) continue
              const small = themePool.filter((item) => hasSize(item, sw, sh) && okTheme(item))
              if (small.length === 0) continue
              const chosen = rng.choice(small)
              if (add(chosen, xx, yy, sw, sh) !== null) count.set(chosen, (count.get(chosen) ?? 0) + 1)
            }
          }
        }
      }
    }
  }

  const singles = themePool.filter((theme) => hasSize(theme, 1, 1))
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid.has(cellKey(x, y)) || !touches(x, y, 1, 1)) continue
      const under = singles.filter((theme) => okTheme(theme))
      const pool = under.length > 0 ? under : singles.length > 0 ? singles : themePool
      if (pool.length === 0) continue
      const theme = rng.choice(pool)
      if (add(theme, x, y, 1, 1) === null) continue
      count.set(theme, (count.get(theme) ?? 0) + 1)
    }
  }

  const adj = (a: number, b: number): { cell: [number, number]; next: [number, number]; side: Side }[] => {
    const out: { cell: [number, number]; next: [number, number]; side: Side }[] = []
    const room = rooms[a]
    for (let j = 0; j < room.h; j++) {
      for (let i = 0; i < room.w; i++) {
        const cell: [number, number] = [room.x + i, room.y + j]
        for (const side of SIDES) {
          const [dx, dy] = DV[side]
          const next: [number, number] = [cell[0] + dx, cell[1] + dy]
          if (grid.get(cellKey(next[0], next[1])) === b) out.push({ cell, next, side })
        }
      }
    }
    return out
  }

  const doorLinks = new Map<string, LinkState>(links)
  const halls = rooms.map((room, index) => (room.theme === 'hallway' ? index : -1)).filter((index) => index >= 0)
  for (let id = 0; id < rooms.length; id++) {
    const room = rooms[id]
    if (room.theme === 'hallway' || id === start) continue
    const pairs = halls.flatMap((hallId) => adj(id, hallId))
    rng.shuffle(pairs)
    const take = room.w * room.h === 1 ? 1 : 2
    for (const pair of pairs.slice(0, take)) doorLinks.set(linkKey(pair.cell, pair.next), 'closed')
  }
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      if (rooms[a].theme === 'hallway' || rooms[b].theme === 'hallway') continue
      const pairs = adj(a, b)
      if (pairs.length === 0 || rng.random() >= 0.35) continue
      const pair = pairs[Math.floor(pairs.length / 2)]
      doorLinks.set(linkKey(pair.cell, pair.next), rng.random() < 0.5 ? 'closed' : 'oneway')
    }
  }

  const reachedFrom = (linksIn: Map<string, LinkState>): Set<number> => {
    const next = new Map<number, number[]>()
    for (let id = 0; id < rooms.length; id++) next.set(id, [])
    for (const [key, state] of linksIn) {
      if (state === 'open') continue
      const [from, to] = key.split('>')
      const a = grid.get(from)
      const b = grid.get(to)
      if (a === undefined || b === undefined || a === b) continue
      next.get(a)!.push(b)
      next.get(b)!.push(a)
    }
    const seen = new Set<number>([start])
    const pending = [start]
    while (pending.length > 0) {
      const id = pending.shift()!
      for (const other of next.get(id) ?? []) {
        if (seen.has(other)) continue
        seen.add(other)
        pending.push(other)
      }
    }
    return seen
  }
  for (let guard = 0; guard < rooms.length; guard++) {
    const seen = reachedFrom(doorLinks)
    if (seen.size === rooms.length) break
    let picked = -1
    for (let id = 0; id < rooms.length; id++) {
      if (!seen.has(id)) {
        picked = id
        break
      }
    }
    if (picked < 0) break
    let linked = false
    for (let other = 0; other < rooms.length && !linked; other++) {
      if (!seen.has(other)) continue
      const pairs = adj(picked, other)
      if (pairs.length === 0) continue
      const pair = pairs[0]
      if (!pair) continue
      doorLinks.set(linkKey(pair.cell, pair.next), 'closed')
      linked = true
    }
    if (!linked) break
  }

  const graph = new Map<number, Set<number>>()
  for (let id = 0; id < rooms.length; id++) graph.set(id, new Set())
  for (const [key, state] of doorLinks) {
    if (state === 'open') continue
    const [from, to] = key.split('>')
    const a = grid.get(from)
    const b = grid.get(to)
    if (a === undefined || b === undefined) continue
    graph.get(a)!.add(b)
    graph.get(b)!.add(a)
  }
  const dist = new Map<number, number>([[start, 0]])
  const queue = [start]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of graph.get(id)!) {
      if (dist.has(next)) continue
      dist.set(next, dist.get(id)! + 1)
      queue.push(next)
    }
  }
  rooms[start].role = 'start'
  const cand = rooms.flatMap((room, index) => (
    room.theme !== 'hallway' && index !== start && dist.has(index) ? [index] : []
  ))
  const pickRole = (role: string, far: boolean, big: boolean): number | null => {
    const pool = cand.filter((index) => {
      const room = rooms[index]
      if (room.role !== null) return false
      if (!THEMES[room.theme].roles.includes(role)) return false
      if (big && room.w * room.h <= 1) return false
      return true
    })
    if (pool.length === 0) return null
    const index = far
      ? pool.reduce((best, item) => {
        const area = rooms[item].w * rooms[item].h
        const bestArea = rooms[best].w * rooms[best].h
        if (dist.get(item)! > dist.get(best)! || (dist.get(item) === dist.get(best) && area > bestArea)) return item
        return best
      })
      : rng.choice(pool)
    rooms[index].role = role
    return index
  }
  if (floor === 5) pickRole('boss', true, true)
  else if (pickRole('stairs', true, false) === null) {
    const pool = cand.filter((index) => rooms[index].w * rooms[index].h === 1 && rooms[index].role === null)
    if (pool.length > 0) {
      const index = pool.reduce((best, item) => (dist.get(item)! > dist.get(best)! ? item : best))
      rooms[index].theme = 'stairwell'
      rooms[index].role = 'stairs'
    }
  }
  const elites = [0, 1, 1, 2, 2][floor - 1]
  for (let n = 0; n < elites; n++) {
    if (pickRole('elite', false, true) === null) pickRole('elite', false, false)
  }
  if (pickRole('shrine', false, false) === null) {
    const pool = cand.filter((index) => rooms[index].role === null)
    if (pool.length > 0) rooms[rng.choice(pool)].role = 'shrine'
  }
  if (floor >= 2) pickRole('shop', false, false)
  for (const index of cand) {
    if (rooms[index].role === null) rooms[index].role = 'combat'
  }
  for (const [key, state] of doorLinks) {
    const [from, to] = key.split('>')
    const a = grid.get(from)
    const b = grid.get(to)
    if (a === undefined || b === undefined) continue
    const roleA = rooms[a].role
    const roleB = rooms[b].role
    if ((roleA === 'shrine' || roleB === 'shrine') && state !== 'arch') doorLinks.set(key, 'locked')
    if (state === 'oneway') {
      const da = dist.get(a) ?? 0
      const db = dist.get(b) ?? 0
      doorLinks.set(key, da > db ? { kind: 'oneway', from, to } : { kind: 'oneway', from: to, to: from })
    }
  }

  const doors = rooms.map(() => new Map<string, DoorState>())
  for (const [key, state] of doorLinks) {
    const [from, to] = key.split('>').map(parseCell)
    const a = grid.get(cellKey(from[0], from[1]))
    const b = grid.get(cellKey(to[0], to[1]))
    if (a === undefined || b === undefined) continue
    const side = SIDES.find((item) => {
      const [dx, dy] = DV[item]
      return from[0] + dx === to[0] && from[1] + dy === to[1]
    })
    if (!side) continue
    const roomA = rooms[a]
    const roomB = rooms[b]
    const localA = doorKey(from[0] - roomA.x, from[1] - roomA.y, side)
    const localB = doorKey(to[0] - roomB.x, to[1] - roomB.y, OPP[side])
    if (typeof state === 'object') {
      const outA = state.from === cellKey(from[0], from[1])
      doors[a].set(localA, outA ? 'oneway_out' : 'oneway_in')
      doors[b].set(localB, outA ? 'oneway_in' : 'oneway_out')
    } else if (state === 'arch') {
      doors[a].set(localA, 'arch')
      doors[b].set(localB, 'arch')
    } else if (state === 'oneway') {
      continue
    } else {
      const leafA = side === 'n' || side === 'e'
      doors[a].set(localA, leafA ? state : 'open')
      doors[b].set(localB, leafA ? 'open' : state)
    }
  }
  if (floor === 1) {
    const room = rooms[start]
    doors[start].set(doorKey(0, room.h - 1, 's'), 'front')
  }

  return {
    floor,
    seed,
    cols,
    rows,
    start,
    rooms: rooms.map((room, index) => ({
      theme: room.theme,
      x: room.x,
      y: room.y,
      w: room.w,
      h: room.h,
      role: room.role,
      doors: [...doors[index]].map(([key, state]) => {
        const [cx, cy, side] = key.split(',')
        return { cx: Number(cx), cy: Number(cy), side: side as Side, state }
      }),
    })),
  }
}

function parseCell(text: string): [number, number] {
  const [x, y] = text.split(',').map(Number)
  return [x, y]
}

/** Branching hallway. Straight runs are preferred. A later pass fills cells the hall does not reach. */
function growHalls(
  rng: Rng,
  cols: number,
  rows: number,
  blocked: Set<string>,
  seeds: [number, number][],
): [number, number][] {
  const halls = new Set<string>()
  const cells: [number, number][] = []
  const dirs = new Map<string, Side>()
  const open = cols * rows - blocked.size
  const budget = Math.max(seeds.length + 4, Math.round(open * 0.2))

  const occupy = (x: number, y: number, from?: Side): boolean => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false
    const id = cellKey(x, y)
    if (blocked.has(id) || halls.has(id)) return false
    halls.add(id)
    cells.push([x, y])
    if (from) dirs.set(id, from)
    return true
  }

  const step = (head: [number, number]): boolean => {
    const prev = dirs.get(cellKey(head[0], head[1]))
    const sides: Side[] = [...SIDES]
    rng.shuffle(sides)
    if (prev && rng.random() < 0.88) {
      const rest = sides.filter((side) => side !== prev)
      sides.splice(0, sides.length, prev, ...rest)
    }
    for (const side of sides) {
      const [dx, dy] = DV[side]
      if (occupy(head[0] + dx, head[1] + dy, side)) return true
    }
    return false
  }

  for (const [x, y] of seeds) occupy(x, y)
  let forceRandom = false
  let guard = 0
  while (cells.length > 0 && cells.length < budget && guard < 500) {
    guard++
    const head: [number, number] | undefined = !forceRandom && rng.random() < 0.7
      ? cells[cells.length - 1]
      : cells[rng.randrange(cells.length)]
    if (!head) break
    forceRandom = !step(head)
  }

  for (let n = 0; n < open && cells.length < budget + 4; n++) {
    let far: [number, number] | null = null
    let farDist = 4
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = cellKey(x, y)
        if (blocked.has(id) || halls.has(id)) continue
        let best = 99
        for (const [hx, hy] of cells) {
          const dist = Math.abs(hx - x) + Math.abs(hy - y)
          if (dist < best) best = dist
        }
        if (best > farDist) {
          far = [x, y]
          farDist = best
        }
      }
    }
    if (!far || cells.length === 0) break
    let nearest = cells[0]
    let nearDist = 99
    for (const cell of cells) {
      const dist = Math.abs(cell[0] - far[0]) + Math.abs(cell[1] - far[1])
      if (dist < nearDist) {
        nearDist = dist
        nearest = cell
      }
    }
    const toward: [number, number, Side][] = []
    const dx = Math.sign(far[0] - nearest[0])
    const dy = Math.sign(far[1] - nearest[1])
    if (dx !== 0) toward.push([nearest[0] + dx, nearest[1], dx > 0 ? 'e' : 'w'])
    if (dy !== 0) toward.push([nearest[0], nearest[1] + dy, dy > 0 ? 's' : 'n'])
    rng.shuffle(toward)
    let moved = false
    for (const [x, y, side] of toward) {
      if (occupy(x, y, side)) {
        moved = true
        break
      }
    }
    if (!moved) break
  }
  return cells
}

export function auditPlan(plan: FloorPlan): string[] {
  const problems: string[] = []
  const grid = new Map<string, number>()
  plan.rooms.forEach((room, index) => {
    for (let j = 0; j < room.h; j++) {
      for (let i = 0; i < room.w; i++) {
        const key = cellKey(room.x + i, room.y + j)
        if (room.x + i < 0 || room.y + j < 0 || room.x + i >= plan.cols || room.y + j >= plan.rows) {
          problems.push(`room ${index} out of grid`)
        }
        if (grid.has(key)) problems.push(`overlap ${key}`)
        grid.set(key, index)
      }
    }
  })
  if (plan.rooms[plan.start]?.role !== 'start') problems.push('missing start')
  if (plan.floor === 5 && !plan.rooms.some((room) => room.role === 'boss')) problems.push('missing boss')
  if (plan.floor < 5 && !plan.rooms.some((room) => room.role === 'stairs')) problems.push('missing stairs')
  const graph = new Map<number, Set<number>>()
  plan.rooms.forEach((_, index) => graph.set(index, new Set()))
  plan.rooms.forEach((room, index) => {
    for (const door of room.doors) {
      if (door.state === 'front') continue
      const [dx, dy] = DV[door.side]
      const nx = room.x + door.cx + dx
      const ny = room.y + door.cy + dy
      const other = grid.get(cellKey(nx, ny))
      if (other === undefined) {
        problems.push(`door ${index} ${door.cx},${door.cy},${door.side} has no neighbor`)
        continue
      }
      graph.get(index)!.add(other)
      const back = OPP[door.side]
      const neighbor = plan.rooms[other]
      const match = neighbor.doors.some((item) => (
        item.side === back
        && neighbor.x + item.cx === nx
        && neighbor.y + item.cy === ny
      ))
      if (!match) problems.push(`door ${index} ${door.side} missing pair`)
    }
  })
  const seen = new Set<number>([plan.start])
  const queue = [plan.start]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of graph.get(id) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  plan.rooms.forEach((room, index) => {
    if (!seen.has(index)) problems.push(`unreachable ${index} ${room.theme}`)
  })
  return problems
}

function rollSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export function bootFloor(): { floor: number; seed: number } {
  const query = new URLSearchParams(location.search)
  const floor = Number(query.get('floor') ?? 1)
  const pinned = query.get('seed')
  const seed = pinned === null ? rollSeed() : Number(pinned)
  return {
    floor: floor >= 1 && floor <= 5 ? floor : 1,
    seed: Number.isFinite(seed) ? seed : rollSeed(),
  }
}

