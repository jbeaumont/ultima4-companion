// One wording for where the companion's view comes from, used by the Dashboard,
// HUD and Tracker. "Unchanged" is not "stale": a live view is stale only when no
// successful read has arrived for a while (the reader reports one every few seconds).
import type { GameState } from './types'

export const STALE_MS = 6000

export interface SourceLabel {
  text: string
  short: string
  level: 'live' | 'warn' | 'plain'
  title: string
}

export function sourceLabel(state: GameState, now: number): SourceLabel {
  const o = state.observation
  if (state.source === 'memory') {
    const age = o ? now - o.observedAt : 0
    if (o?.status === 'retrying') {
      return { text: '● LIVE · checking', short: 'LIVE?', level: 'warn', title: 'Reads from the game disagreed; showing the last consistent state while it retries.' }
    }
    if (age > STALE_MS) {
      return { text: `● LIVE · no update for ${Math.round(age / 1000)}s`, short: 'STALE', level: 'warn', title: 'No successful read from the game recently.' }
    }
    return { text: '● LIVE (memory)', short: 'LIVE', level: 'live', title: 'Read from the running game.' }
  }
  if (o?.status === 'detached') {
    return { text: 'Game closed · last save', short: 'Save', level: 'warn', title: 'The game is no longer readable; showing the last saved state.' }
  }
  return { text: 'Save file', short: 'Save', level: 'plain', title: 'Read from the save file (updated when you save with Q).' }
}
