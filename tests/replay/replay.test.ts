// Replay regressions: checkpoints verified in live hill-climb journeys, stored as
// small normalized fixtures and run through the production guidance functions.
// No DOSBox, Windows or game files needed. See tests/replay/README.md.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { CharacterRecord, PartySave } from '@parsers/party'
import { HINTS, dialogueUnlocked, isSolved, visibleTiers } from '@domain/hints'
import type { SpoilerLevel } from '@domain/hints'
import { nextSteps } from '@domain/guidance'
import { progress } from '@domain/progress'

interface Fixture {
  name: string
  verifiedLive: string
  state: Partial<Omit<PartySave, 'members'>> & { members: Partial<CharacterRecord>[] }
  knowledge: { spoilerLevel: SpoilerLevel; revealed: Record<string, number>; visited: number[] }
  expect: {
    nextFirst?: string
    nextIncludes?: string[]
    nextExcludes?: string[]
    checklistDone?: string[]
    checklistNotDone?: string[]
    solved?: string[]
    notSolved?: string[]
    dialogueUnlocked?: number[]
  }
}

const dir = join(__dirname, 'fixtures')
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture] as const)

/** A full PartySave from a fixture's normalized fields (everything else blank). */
function partyFrom(f: Fixture): PartySave {
  const blank = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  const records = blank.allRecords.map((r, i) => ({ ...r, ...(f.state.members[i] ?? {}) }))
  const memberCount = f.state.members.length
  return { ...blank, ...f.state, allRecords: records, members: records.slice(0, memberCount), memberCount } as PartySave
}

const levels: SpoilerLevel[] = ['off', 'nudges', 'full']

describe('replay fixtures are clean', () => {
  it.each(fixtures)('%s holds only reviewed, normalized data', (_file, f) => {
    const text = JSON.stringify(f)
    expect(f.verifiedLive, 'say where the checkpoint was verified').toBeTruthy()
    expect(text).not.toMatch(/[A-Z]:\\\\|\/Users\/|AppData|sk-ant-/) // no paths or keys
    expect(f.state.members.every((m) => m.name === 'Avatar' || !m.name)).toBe(true) // no player names
  })
})

describe.each(fixtures)('replay %s', (_file, f) => {
  const party = partyFrom(f)
  const p = progress(party)
  const steps = nextSteps(party, f.knowledge.spoilerLevel)
  const ids = steps.map((s) => s.id)
  const e = f.expect

  it('suggests what was seen live', () => {
    if (e.nextFirst) expect(ids[0]).toBe(e.nextFirst)
    for (const id of e.nextIncludes ?? []) expect(ids).toContain(id)
    for (const id of e.nextExcludes ?? []) expect(ids).not.toContain(id)
  })

  it('tracks completion as the game did', () => {
    const done = new Set(p.checklist.filter((c) => c.done).map((c) => c.id))
    for (const id of e.checklistDone ?? []) expect(done.has(id), id).toBe(true)
    for (const id of e.checklistNotDone ?? []) expect(done.has(id), id).toBe(false)
    for (const id of e.solved ?? []) expect(isSolved(HINTS.find((h) => h.id === id)!, p), id).toBe(true)
    for (const id of e.notSolved ?? []) expect(isSolved(HINTS.find((h) => h.id === id)!, p), id).toBe(false)
    for (const loc of e.dialogueUnlocked ?? []) expect(dialogueUnlocked(loc, 'visited', f.knowledge.visited)).toBe(true)
  })

  it.each(levels)('discloses only what spoiler level %s permits', (level) => {
    const shown = nextSteps(party, level)
    for (const s of shown.filter((x) => !x.elevation)) {
      const topic = HINTS.find((h) => h.id === s.id)!
      if (level === 'off') expect(s.detail).toBeUndefined()
      else expect(s.detail).toBe(topic.tiers[0])
      // clues and answers never appear in suggestions, at any level
      expect(JSON.stringify(shown)).not.toContain(topic.tiers[2])
    }
    // the Hints view: fully revealed topics still show no more than the level allows
    for (const h of HINTS) {
      const tiers = visibleTiers(h, level, 3)
      expect(tiers.length).toBe(level === 'off' ? 0 : level === 'nudges' ? 1 : 3)
    }
  })
})
