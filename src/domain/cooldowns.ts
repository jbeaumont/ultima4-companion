// Time-gated actions, derived from PARTY.SAV timers. Rules mirror xu4:
// camp.cpp / shrine.cpp (moves/100), party.cpp virtueIncreaseTimeout (moves/16),
// item.cpp SC_REAGENTDELAY (moves & 0xF0) and SC_NEWMOONS.
import type { PartySave } from '@parsers/party'

export interface Timer {
  ready: boolean
  /** Moves until ready again; 0 when ready. */
  movesLeft: number
}

export interface Cooldowns {
  camp: Timer
  meditation: Timer
  virtue: Timer
  /** Mandrake/nightshade search window (also requires both moons new). */
  reagent: Timer & { newMoons: boolean; canSearch: boolean }
}

/** Timer stored as (moves / interval) & 0xFFFF; ready once the bucket changes. */
export function bucketTimer(moves: number, interval: number, last: number): Timer {
  const bucket = Math.floor(moves / interval)
  const ready = bucket >= 0x10000 || (bucket & 0xffff) !== last
  return { ready, movesLeft: ready ? 0 : interval - (moves % interval) }
}

export function reagentTimer(moves: number, last: number): Timer {
  const ready = (moves & 0xf0) !== last
  return { ready, movesLeft: ready ? 0 : 16 - (moves & 0x0f) }
}

export const newMoons = (p: Pick<PartySave, 'trammel' | 'felucca'>): boolean => p.trammel === 0 && p.felucca === 0

export function cooldowns(p: PartySave): Cooldowns {
  const reagent = reagentTimer(p.moves, p.lastReagent)
  const moons = newMoons(p)
  return {
    camp: bucketTimer(p.moves, 100, p.lastCamp),
    meditation: bucketTimer(p.moves, 100, p.lastMeditation),
    virtue: bucketTimer(p.moves, 16, p.lastVirtueTalk),
    reagent: { ...reagent, newMoons: moons, canSearch: reagent.ready && moons }
  }
}
