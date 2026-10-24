// Game speed (#70): DOSBox cycles presets and the speed DOSBox shows in its window
// title. Pure, shared by main and renderer.

/** Presets in DOSBox cycles. GOG ships 500, about an original PC. Measured with
 * scripts/hillclimb/speed.ts: idle turns run on a real-time clock at every speed
 * (one per 30 s), while the moons change 8, 11, 19 and 117 times in 30 s at 500,
 * 3000, 10000 and max, so the presets stop well short of max. */
export const SPEEDS = { original: 500, faster: 3000, fast: 10000 } as const
export type Speed = keyof typeof SPEEDS
export const SPEED_NAMES: Record<Speed, string> = { original: 'Original', faster: 'Faster', fast: 'Fast' }
/** The default for new installs: text reads at a modern pace and the moons barely change. */
export const DEFAULT_SPEED: Speed = 'faster'
/** Ctrl+F11/F12 step in the generated config, so a live change takes a few presses. */
export const CYCLE_STEP = 500

export const isSpeed = (x: unknown): x is Speed => typeof x === 'string' && x in SPEEDS

/** "DOSBox 0.74-2.1, Cpu speed:     3000 cycles, ..." -> 3000; "max 100% cycles" -> 'max'; otherwise null. */
export function cyclesFromTitle(title: string): number | 'max' | null {
  const m = /Cpu speed:\s*(max\b[^,]*|\d+)\s*cycles/i.exec(title)
  if (!m) return null
  return /^max/i.test(m[1]!) ? 'max' : Number(m[1])
}

/** The preset a cycle count matches, if any. */
export function speedOf(cycles: number | 'max' | null): Speed | null {
  if (cycles === null || cycles === 'max') return null
  return (Object.keys(SPEEDS) as Speed[]).find((s) => SPEEDS[s] === cycles) ?? null
}
