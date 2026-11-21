/** Master, music, and effects, 0–100. Settings sliders write these. */
export const mix = [80, 55, 70]

const VARIANTS: Record<string, number> = {
  'player/attack_p0_bump': 3,
  'player/attack_p1_bump_strong': 3,
  'player/attack_p2_brush_spin': 2,
  'player/attack_p3_suction_pull': 2,
  'player/attack_p4_zap': 2,
  'player/attack_p5_zap_storm': 2,
  'player/hit_taken': 3,
  'enemies/dust_bunny_hop': 3,
  'enemies/enemy_death_scrap_burst': 3,
  'enemies/enemy_hit': 4,
  'enemies/rogue_mop_wet_slap': 2,
  'enemies/tin_soldier_march': 2,
  'pickups/bolt': 2,
  'pickups/coin': 4,
  'pickups/xp_orb': 4,
  'ui/tidy_text_blip': 4,
  'world/furniture_break': 3,
}

const STINGER_MS: Record<string, number> = {
  run_start: 3260,
  level_up: 2940,
  room_clear: 3030,
  boss_defeated: 4230,
  victory: 10120,
  power_down_game_over: 9100,
}

const AMBIENCE = [
  '',
  'world/ambience_floor1_clock_hall_loop',
  'world/ambience_floor2_laundry_loop',
  'world/ambience_floor3_boiler_basement_loop',
  'world/ambience_floor4_security_wing_loop',
  'world/ambience_floor5_butlers_quarters_loop',
]

const UI = {
  hover: 'ui/button_hover',
  select: 'ui/button_select',
  back: 'ui/button_back',
  pause: 'ui/pause',
  unpause: 'ui/unpause',
  tick: 'ui/slider_tick',
  on: 'ui/toggle_on',
  off: 'ui/toggle_off',
} as const

type Bed = { file: string; node: AudioBufferSourceNode; gain: GainNode }

class Sound {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private musicEl: HTMLAudioElement | null = null
  private stingerEl: HTMLAudioElement | null = null
  private musicId = ''
  private blockUntil = 0
  private duckUntil = 0
  private voices = 0
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>()
  private readonly gap = new Map<string, number>()
  private readonly beds = new Map<string, Bed>()
  private readonly bedToken = new Map<string, number>()

  wake(): void {
    if (!this.ctx) {
      const ctx = new AudioContext()
      this.ctx = ctx
      this.sfxGain = ctx.createGain()
      this.sfxGain.connect(ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.apply()
  }

  blocked(): boolean {
    return performance.now() < this.blockUntil
  }

  apply(): void {
    const music = this.musicVol()
    if (this.musicEl) this.musicEl.volume = music
    if (this.stingerEl) this.stingerEl.volume = (mix[0] / 100) * (mix[1] / 100)
    if (this.sfxGain) this.sfxGain.gain.value = (mix[0] / 100) * (mix[2] / 100)
  }

  playMusic(id: string): void {
    if (this.blocked()) return
    this.wake()
    if (!this.musicEl) {
      this.musicEl = new Audio()
      this.musicEl.loop = true
      this.musicEl.preload = 'auto'
    }
    if (this.musicId !== id) {
      this.musicId = id
      this.musicEl.src = `assets/audio/${id}.ogg`
    }
    this.musicEl.volume = this.musicVol()
    if (this.musicEl.paused) void this.musicEl.play().catch(() => {})
  }

  hold(paused: boolean): void {
    if (!this.musicEl) return
    if (paused) this.musicEl.pause()
    else if (this.musicId && !this.blocked() && this.musicEl.paused) void this.musicEl.play().catch(() => {})
  }

  stinger(name: string, block = false): void {
    this.wake()
    const ms = STINGER_MS[name] ?? 3000
    if (block) {
      this.blockUntil = performance.now() + ms
      this.musicEl?.pause()
    } else this.duckUntil = performance.now() + ms
    if (!this.stingerEl) {
      this.stingerEl = new Audio()
      this.stingerEl.preload = 'auto'
    }
    this.stingerEl.loop = false
    this.stingerEl.volume = (mix[0] / 100) * (mix[1] / 100)
    this.stingerEl.src = `assets/audio/stingers/${name}.ogg`
    void this.stingerEl.play().catch(() => {})
  }

  sfx(name: string, gapMs = 0): void {
    if (gapMs > 0) {
      const now = performance.now()
      if (now < (this.gap.get(name) ?? 0)) return
      this.gap.set(name, now + gapMs)
    }
    const count = VARIANTS[name] ?? 0
    const pick = count > 0 ? Math.floor(Math.random() * count) + 1 : 0
    const file = pick > 0 ? `${name}_${String(pick).padStart(2, '0')}` : name
    this.shot(`assets/audio/sfx/${file}.wav`)
  }

  ui(kind: keyof typeof UI): void {
    this.sfx(UI[kind], kind === 'hover' || kind === 'tick' ? 45 : 0)
  }

  hum(kind: 'off' | 'idle' | 'move'): void {
    if (kind === 'off') this.bed('hum', null, 0)
    else this.bed('hum', kind === 'move' ? 'player/vacuum_hum_moving_loop' : 'player/vacuum_hum_idle_loop', 0.4)
  }

  low(on: boolean): void {
    this.bed('low', on ? 'player/low_hp_warning_loop' : null, 0.4)
  }

  room(floor: number): void {
    this.bed('room', AMBIENCE[floor] || null, 0.35)
  }

  private musicVol(): number {
    const duck = performance.now() < this.duckUntil ? 0.28 : 1
    return (mix[0] / 100) * (mix[1] / 100) * duck
  }

  private shot(url: string): void {
    if (this.voices >= 12) return
    void this.buffer(url).then((buf) => {
      if (!buf || !this.ctx || !this.sfxGain || this.voices >= 12) return
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.sfxGain)
      this.voices += 1
      src.onended = () => {
        this.voices = Math.max(0, this.voices - 1)
      }
      src.start()
    })
  }

  private bed(id: string, file: string | null, gain: number): void {
    const cur = this.beds.get(id)
    if (!file) {
      this.stopBed(id)
      return
    }
    if (cur?.file === file) {
      cur.gain.gain.value = gain
      return
    }
    this.stopBed(id)
    const token = (this.bedToken.get(id) ?? 0) + 1
    this.bedToken.set(id, token)
    void this.buffer(`assets/audio/sfx/${file}.wav`).then((buf) => {
      if (!buf || !this.ctx || !this.sfxGain || this.bedToken.get(id) !== token) return
      const node = this.ctx.createBufferSource()
      const knob = this.ctx.createGain()
      node.buffer = buf
      node.loop = true
      knob.gain.value = gain
      node.connect(knob)
      knob.connect(this.sfxGain)
      node.start()
      this.beds.set(id, { file, node, gain: knob })
    })
  }

  private stopBed(id: string): void {
    this.bedToken.set(id, (this.bedToken.get(id) ?? 0) + 1)
    const cur = this.beds.get(id)
    if (!cur) return
    this.beds.delete(id)
    try {
      cur.node.stop()
    } catch {
      /* already stopped */
    }
  }

  private buffer(url: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(url)
    if (hit) return Promise.resolve(hit)
    const pending = this.pending.get(url)
    if (pending) return pending
    const job = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`missing audio ${url}`)
        return res.arrayBuffer()
      })
      .then((raw) => {
        this.wake()
        if (!this.ctx) throw new Error('no audio context')
        return this.ctx.decodeAudioData(raw.slice(0))
      })
      .then((buf) => {
        this.buffers.set(url, buf)
        this.pending.delete(url)
        return buf
      })
      .catch(() => {
        this.pending.delete(url)
        return null
      })
    this.pending.set(url, job)
    return job
  }
}

export const audio = new Sound()
