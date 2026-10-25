// The fortune teller at character creation (#68), from u4-decompiled
// SRC-TITLE/TITLE_1.C: seven questions as a knockout of the eight virtues (a loser
// never returns), card A always the earlier virtue, +5 karma and stat points per
// win, and the final winner decides the class and starting town. Pure: shared by
// the memory reader (main) and the class picker (renderer).
import { CLASSES, LOCATIONS, VIRTUES } from '@domain/constants'

/** Stat points per win, by virtue (D_30B2 str, D_30BA dex, D_30C2 int); every stat starts at 15. */
export const WIN_STR = [0, 0, 3, 0, 1, 1, 1, 0]
export const WIN_DEX = [0, 3, 0, 1, 1, 0, 1, 0]
export const WIN_INT = [3, 0, 0, 1, 0, 1, 1, 0]
/** Starting level by class: the PARTY.NEW record the Avatar takes (max HP / 100). */
export const START_LEVEL = [2, 3, 3, 2, 2, 3, 2, 1]

/** What a run of the fortune telling leads to when `virtue` wins the final. */
export function outcomeOf(virtue: number): { cls: string; virtue: string; town: string; level: number } {
  return {
    cls: CLASSES[virtue]!,
    virtue: VIRTUES[virtue]!,
    town: LOCATIONS[virtue + 5]?.name ?? '?', // Moonglow (5) for the Mage through Magincia (12) for the Shepherd
    level: START_LEVEL[virtue]!
  }
}

/**
 * Which card to choose for the class of `target`: its own card whenever it is
 * shown (then it can never be knocked out, so it wins the final); otherwise the
 * card whose win adds most to the stats the target's class gains from its own
 * virtue (a Mage favours intelligence). Ties go to card A.
 */
export function pickCard(target: number, a: number, b: number): 'A' | 'B' {
  if (a === target) return 'A'
  if (b === target) return 'B'
  const score = (v: number) => WIN_STR[v]! * WIN_STR[target]! + WIN_DEX[v]! * WIN_DEX[target]! + WIN_INT[v]! * WIN_INT[target]!
  return score(b) > score(a) ? 'B' : 'A'
}

/** The fortune telling as read from TITLE.EXE's memory. */
export interface FortuneState {
  /** Questions answered so far (0-7). */
  question: number
  /** Karma per virtue (50 at the start, +5 per win). */
  karma: number[]
  /** The two cards on offer (virtue indexes, a < b), when a question is showing. */
  cards: { a: number; b: number } | null
  /** Virtues knocked out so far. */
  out: number[]
  name: string
}

/** Data-segment offsets in TITLE.EXE (TITLE_1.C statics; the cards are C_2C12's stack locals, found live). */
export const TITLE = {
  question: 0x6946,
  name: 0x6948,
  int: 0x695c,
  karma: 0x695e,
  cardB: 0x7862,
  cardA: 0x7864,
  knockout: 0x785a
} as const

/**
 * Read the fortune state from a window of TITLE's data segment starting at
 * TITLE.question, or null when the bytes are not a fortune telling in progress.
 * `seg(off)` returns the byte at that data-segment offset.
 */
export function readFortune(seg: (off: number) => number): FortuneState | null {
  const question = seg(TITLE.question) | (seg(TITLE.question + 1) << 8)
  const karma = Array.from({ length: 8 }, (_, i) => seg(TITLE.karma + i))
  if (question > 7 || karma.some((k) => k < 50 || k > 65 || k % 5 !== 0)) return null
  if (karma.reduce((n, k) => n + k, 0) !== 400 + 5 * question) return null
  let name = ''
  for (let i = 0; i < 16; i++) {
    const c = seg(TITLE.name + i)
    if (c === 0) break
    if (c < 32 || c > 126) return null
    name += String.fromCharCode(c)
  }
  const knock = Array.from({ length: 8 }, (_, i) => seg(TITLE.knockout + i))
  const out = knock.flatMap((v, i) => (v === 0xff ? [i] : []))
  const a = seg(TITLE.cardA)
  const b = seg(TITLE.cardB)
  // the cards are stack locals: trust them only while they fit the knockout so far
  const valid = question < 7 && knock.every((v) => v === 0 || v === 1 || v === 0xff) && out.length === question &&
    a < b && b < 8 && knock[a] === 0 && knock[b] === 0
  return { question, karma, cards: valid ? { a, b } : null, out, name }
}
