// Moongates and the moon cycle, per xu4 game.cpp (updateMoons, activeMoongateAt,
// checkMoongates) and module/Ultima-IV/maps.b. The cycle has 24 steps: Felucca
// advances every step (step % 8), Trammel every third step (step / 3).
import { RUNES } from './constants'

export const MOON_STEPS = 24

export const PHASE_NAMES = [
  'New', 'Crescent Waxing', 'First Quarter', 'Gibbous Waxing', 'Full', 'Gibbous Waning', 'Last Quarter', 'Crescent Waning'
] as const

export interface Moongate {
  phase: number
  x: number
  y: number
  near: string
}

/** Gate position for each moon phase. */
export const MOONGATES: Moongate[] = [
  { phase: 0, x: 224, y: 133, near: 'Moonglow' },
  { phase: 1, x: 96, y: 102, near: 'Britain' },
  { phase: 2, x: 38, y: 224, near: 'Jhelom' },
  { phase: 3, x: 50, y: 37, near: 'Yew' },
  { phase: 4, x: 166, y: 19, near: 'Minoc' },
  { phase: 5, x: 104, y: 194, near: 'Trinsic' },
  { phase: 6, x: 23, y: 126, near: 'Skara Brae' },
  { phase: 7, x: 187, y: 167, near: 'Magincia' }
]

export const phasesAt = (step: number) => ({ trammel: Math.min(7, Math.floor(step / 3)), felucca: step % 8 })

/** Position in the 24-step cycle for a Trammel/Felucca pair, or null if the pair can't occur. */
export function cycleStep(trammel: number, felucca: number): number | null {
  for (let k = 0; k < 3; k++) {
    const step = trammel * 3 + k
    if (step % 8 === felucca) return step
  }
  return null
}

export interface GateState {
  /** The gate that is open: Trammel's phase picks where it stands. */
  open: Moongate
  /** Where it leads: Felucca's phase picks the destination. */
  destination: Moongate
  /** Trammel and Felucca both full: the Minoc gate leads to the Shrine of Spirituality (with its rune). */
  spirituality: boolean
}

export function gateState(trammel: number, felucca: number): GateState {
  return {
    open: MOONGATES[trammel & 7]!,
    destination: MOONGATES[felucca & 7]!,
    spirituality: trammel === 4 && felucca === 4
  }
}

export interface UpcomingGate extends GateState {
  stepsAhead: number
  trammel: number
  felucca: number
}

/** The next `count` gate configurations after the current one. */
export function upcomingGates(trammel: number, felucca: number, count = 8): UpcomingGate[] {
  const now = cycleStep(trammel, felucca)
  if (now === null) return []
  return Array.from({ length: count }, (_, i) => {
    const phases = phasesAt((now + i + 1) % MOON_STEPS)
    return { ...gateState(phases.trammel, phases.felucca), ...phases, stepsAhead: i + 1 }
  })
}

/** Steps until the gate at `from` leads to `to` (0 = right now), or null if never in a cycle. */
export function stepsUntilRoute(trammel: number, felucca: number, from: number, to: number): number | null {
  const now = cycleStep(trammel, felucca)
  if (now === null) return null
  for (let i = 0; i < MOON_STEPS; i++) {
    const p = phasesAt((now + i) % MOON_STEPS)
    if (p.trammel === from && p.felucca === to) return i
  }
  return null
}

export const SPIRITUALITY_RUNE = RUNES.indexOf('Spirituality')
