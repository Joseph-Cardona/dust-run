import type { Fx } from './fx.ts'
import { type State } from './spec.ts'

export interface DockTick {
  emptying: boolean
  emptyFrame: number
  visualPct: number | null
}

export function beginDock(state: State): void {
  const player = state.player
  state.mode = 'docking'
  state.dockMs = 0
  state.dockStartPct = (player.tank / player.capacity) * 100
  player.facing = 'down'
}

export function tickDock(state: State, dtMs: number, fx: Fx): DockTick {
  void fx
  state.dockMs += dtMs
  const ms = state.dockMs
  const start = Math.round((1 - state.dockStartPct / 100) * 11)
  const visualPct = ms < 200
    ? null
    : (1 - Math.min(11, start + Math.floor((ms - 200) / 100)) / 11) * 100

  if (ms < 1600) {
    return {
      emptying: true,
      emptyFrame: Math.min(15, Math.floor(ms / 100)),
      visualPct,
    }
  }

  const player = state.player
  player.tank = 0
  const heal = Math.max(1, Math.round(player.maxHp * 0.25))
  player.hp = Math.min(player.maxHp, player.hp + heal)
  state.mode = 'play'
  state.afterEmpty = true
  state.dockMs = 0
  return { emptying: false, emptyFrame: 15, visualPct: null }
}
