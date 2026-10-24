// The one spoiler policy: what each hint level lets the companion show, on every
// surface (Dashboard, Map, Dialogue, Hints, Journal) and to the Sage. Views ask
// this module instead of comparing levels themselves.
//
//   off     Strict. Nothing that helps solve the quest: no hint text, no quest
//           leads, no hidden places, no deed guide. The sage gives only fixed,
//           spoiler-free counsel (no generated answers).
//   nudges  Gentle first hints, quest leads and where companions wait; the deed
//           guide without quest-item secrets. The sage's answers are generated
//           and limited by its instructions: best effort, not a guarantee.
//   full    Everything the player chooses to reveal, including answers and the
//           whole map.
//
// Explicit reveals: the player reveals hint tiers one at a time, never beyond
// the level. Discovered knowledge: what the player has already found (a solved
// topic, a visited town, a dungeon cell seen) is not a spoiler, so it shows at
// any level that shows hints at all.

export type SpoilerLevel = 'off' | 'nudges' | 'full'

export interface Disclosure {
  level: SpoilerLevel
  /** Highest hint tier the player may reveal: 0 none, 1 nudge, 3 nudge, clue and answer. */
  hintTiers: 0 | 1 | 3
  /** The nudge line under Dashboard suggestions. */
  suggestionNudges: boolean
  /** "Quest lead" marks on people who give clues, and "who to ask" lines. */
  questLeads: boolean
  /** Where each companion waits. */
  companionTowns: boolean
  /** Unvisited towns and unseen dungeon cells on the map. */
  wholeMap: boolean
  /** The deed guide: hidden, deeds without quest-item secrets, or all. */
  deedGuide: 'hidden' | 'deeds' | 'all'
  /** The sage: fixed counsel only, or generated answers (best effort). */
  sage: 'fixed' | 'generated'
}

export const DISCLOSURE: Record<SpoilerLevel, Disclosure> = {
  off: { level: 'off', hintTiers: 0, suggestionNudges: false, questLeads: false, companionTowns: false, wholeMap: false, deedGuide: 'hidden', sage: 'fixed' },
  nudges: { level: 'nudges', hintTiers: 1, suggestionNudges: true, questLeads: true, companionTowns: true, wholeMap: false, deedGuide: 'deeds', sage: 'generated' },
  full: { level: 'full', hintTiers: 3, suggestionNudges: true, questLeads: true, companionTowns: true, wholeMap: true, deedGuide: 'all', sage: 'generated' }
}

/** The policy for a level; anything unknown is treated as the strictest. */
export function disclosure(level: string | null | undefined): Disclosure {
  return level === 'nudges' || level === 'full' ? DISCLOSURE[level] : DISCLOSURE.off
}

/**
 * Hint tiers to show: those the player revealed, capped by the level; a topic
 * already solved in the game shows every tier the level allows without revealing.
 */
export function shownTiers(tiers: readonly string[], level: string | null | undefined, revealed: number, solved = false): string[] {
  const cap = disclosure(level).hintTiers
  return tiers.slice(0, Math.max(0, Math.min(solved ? cap : revealed, cap)))
}

/** Whether another tier can be revealed with a click. */
export const canRevealMore = (level: string | null | undefined, revealed: number): boolean => revealed < disclosure(level).hintTiers

/** A town on the map: once visited, with the whole map allowed, or when revealed for the session. */
export const townShown = (id: number, visited: readonly number[], level: string | null | undefined, override: boolean): boolean =>
  override || disclosure(level).wholeMap || visited.includes(id)

/** A dungeon cell on the map: once seen, with the whole map allowed, or when the dungeon is revealed. */
export const cellShown = (seen: boolean, level: string | null | undefined, reveal: boolean): boolean => reveal || disclosure(level).wholeMap || seen
