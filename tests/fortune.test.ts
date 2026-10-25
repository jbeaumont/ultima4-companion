// The fortune teller's rules (#68), from u4-decompiled TITLE_1.C and the live
// memory research (scripts/hillclimb/fortune-research.ts).
import { describe, expect, it } from 'vitest'
import { TITLE, outcomeOf, pickCard, readFortune } from '@shared/fortune'

/** A data segment as seen live before question 5 (round two) of the research run. */
function segment(question: number, karma: number[], knock: number[], a: number, b: number, name = 'qzxfort'): (off: number) => number {
  const m = new Map<number, number>()
  m.set(TITLE.question, question & 0xff)
  m.set(TITLE.question + 1, question >> 8)
  ;[...name].forEach((c, i) => m.set(TITLE.name + i, c.charCodeAt(0)))
  m.set(TITLE.name + name.length, 0)
  karma.forEach((k, i) => m.set(TITLE.karma + i, k))
  knock.forEach((k, i) => m.set(TITLE.knockout + i, k))
  m.set(TITLE.cardA, a)
  m.set(TITLE.cardB, b)
  return (off) => m.get(off) ?? 0
}

describe('fortune teller', () => {
  it('reads the cards on offer as the live run saw them', () => {
    // after round one (2,3) (4,6) (0,5) (1,7) won by 2, 4, 0, 1: losers 3, 5, 6, 7 are out, winners reset to 0
    const seg = segment(4, [55, 55, 55, 50, 55, 50, 50, 50], [0, 0, 0, 0xff, 0, 0xff, 0xff, 0xff], 0, 1)
    expect(readFortune(seg)).toEqual({ question: 4, karma: [55, 55, 55, 50, 55, 50, 50, 50], cards: { a: 0, b: 1 }, out: [3, 5, 6, 7], name: 'qzxfort' })
  })

  it('distrusts cards that do not fit the knockout, and rejects other memory', () => {
    const base = [55, 55, 55, 50, 55, 50, 50, 50]
    expect(readFortune(segment(4, base, [0, 0, 0, 0xff, 0, 0xff, 0xff, 0xff], 3, 4))!.cards).toBeNull() // 3 is already out
    expect(readFortune(segment(4, base, [0, 0, 0, 0xff, 0, 0xff, 0xff, 0xff], 2, 1))!.cards).toBeNull() // A must be the earlier
    expect(readFortune(segment(4, [50, 50, 50, 50, 50, 50, 50, 50], [], 0, 1))).toBeNull() // karma does not add up
    expect(readFortune(segment(9, base, [], 0, 1))).toBeNull()
  })

  it('always picks the target class when shown, so it wins the final', () => {
    // play a whole knockout with random pairs and check the target always wins
    for (let target = 0; target < 8; target++) {
      for (let run = 0; run < 50; run++) {
        let alive = [0, 1, 2, 3, 4, 5, 6, 7]
        let winner = -1
        for (const round of [4, 2, 1]) {
          const pool = [...alive].sort(() => Math.random() - 0.5)
          alive = []
          for (let i = 0; i < round; i++) {
            const [x, y] = [pool[2 * i]!, pool[2 * i + 1]!].sort((p, q) => p - q) as [number, number]
            winner = pickCard(target, x, y) === 'A' ? x : y
            alive.push(winner)
          }
        }
        expect(winner, `target ${target}`).toBe(target)
      }
    }
  })

  it('prefers the stat the class gains when its card is not shown, and knows the outcome', () => {
    expect(pickCard(0, 1, 6)).toBe('B') // a Mage (int) prefers Spirituality's +1 int over Compassion's dex
    expect(outcomeOf(0)).toEqual({ cls: 'Mage', virtue: 'Honesty', town: 'Moonglow', level: 2 })
    expect(outcomeOf(7)).toMatchObject({ cls: 'Shepherd', town: 'Magincia', level: 1 })
  })
})
