// The companion never shows the game's slur for the fortune teller (#69).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import dialogue from '../data/dialogue.json'
import { HINTS } from '@domain/hints'
import { buildSystemPrompt } from '../src/main/sage/prompt'
import { needsRewording, reword, rewordFields } from '@shared/wording'

const WORD = ['gy', 'psy'].join('')

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|css|html)$/.test(f) ? [p] : []
  })

describe('fortune teller wording', () => {
  it('rewords game text, keeping its capitalisation', () => {
    expect(reword(`An old ${WORD}.`)).toBe('An old fortune teller.')
    expect(reword(`${WORD[0]!.toUpperCase()}${WORD.slice(1)} camp`)).toBe('Fortune teller camp')
    expect(reword(WORD.toUpperCase())).toBe('FORTUNE TELLER')
    expect(reword(`two ${WORD.slice(0, -1)}ies`)).toBe('two fortune tellers')
    expect(reword('a gypsum mine')).toBe('a gypsum mine') // only the whole word
  })

  it('every NPC as the Dialogue view shows it is reworded', () => {
    const towns = dialogue as unknown as { npcs: Record<string, unknown>[] }[]
    const raw = towns.flatMap((t) => t.npcs)
    expect(raw.some((n) => JSON.stringify(n).toLowerCase().includes(WORD))).toBe(true) // the game data itself is kept
    for (const n of raw) expect(needsRewording(JSON.stringify(rewordFields(n).value))).toBe(false)
  })

  it('no hint, sage prompt or source file the UI is built from uses the word', () => {
    for (const h of HINTS) expect(needsRewording(JSON.stringify(h)), h.id).toBe(false)
    for (const persona of ['hawkwind', 'lordbritish'] as const) {
      for (const level of ['off', 'nudges', 'full'] as const) expect(needsRewording(buildSystemPrompt(persona, level))).toBe(false)
    }
    // the only allowed use is the game's own image file name, which is opened, never shown
    for (const f of files(join(__dirname, '..', 'src'))) {
      const text = readFileSync(f, 'utf8').replace(/'GYPSY\.EGA'/g, '')
      expect(needsRewording(text), f).toBe(false)
    }
  })
})
