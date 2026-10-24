import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { LOCATIONS } from '@domain/constants'
import { progress } from '@domain/progress'
import { toSextant } from '@domain/sextant'
import { gameFile, hasGame } from './gameFiles'
import { parseDng } from '@parsers/dungeon'
import { dungeonPath, roomExits } from '../src/domain/dungeonRoute'
import { combatWalkable } from '../src/domain/combatPlan'
import { HINTS, canReveal, dialogueUnlocked, isSolved, maxTier, recordVisit, suggestedTopics, visibleTiers } from '@domain/hints'

interface Npc { name: string; job: string; health: string; keyword1Response: string; keyword2Response: string; question: string; yesResponse: string; noResponse: string }
const dialogue: { location: string; npcs: Npc[] }[] = JSON.parse(readFileSync('data/dialogue.json', 'utf8'))
const allText = (n: Npc) => [n.job, n.health, n.keyword1Response, n.keyword2Response, n.question, n.yesResponse, n.noResponse].join(' ').replace(/\n/g, ' ')
const npc = (location: string, name: string) => dialogue.find((d) => d.location === location)?.npcs.find((n) => n.name === name)

const fresh = () => {
  const p = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  p.karma = [50, 50, 50, 50, 50, 50, 50, 50]
  return p
}

describe('sextant notation matches in-game dialogue', () => {
  it.each([
    ["Serpent's Hold", 'Garam', 176, 208], // the bell
    ['Trinsic', 'Virgil', 46, 149], // nightshade
    ['Minoc', 'Jude', 197, 245], // the skull
    ["Lord British's Castle", 'Shawn', 187, 169] // Magincia ruins
  ])('%s / %s', (location, name, x, y) => {
    expect(allText(npc(location, name)!)).toContain(toSextant(x, y))
  })
})

describe('hint content integrity', () => {
  it('has unique ids and three non-empty tiers', () => {
    expect(new Set(HINTS.map((h) => h.id)).size).toBe(HINTS.length)
    for (const h of HINTS) expect(h.tiers.every((t) => t.trim().length > 0), h.id).toBe(true)
  })

  it('cites NPCs that really exist in the game dialogue', () => {
    for (const h of HINTS) {
      for (const s of h.sources ?? []) expect(npc(s.location, s.npc), `${h.id}: ${s.location} / ${s.npc}`).toBeDefined()
    }
  })

  it('references real checklist items, topics and locations', () => {
    const ids = new Set(progress(fresh()).checklist.map((c) => c.id))
    const topics = new Set(HINTS.map((h) => h.id))
    for (const h of HINTS) {
      for (const s of h.solvedBy ?? []) expect(ids.has(s), `${h.id} solvedBy ${s}`).toBe(true)
      for (const a of h.after ?? []) expect(topics.has(a), `${h.id} after ${a}`).toBe(true)
      for (const l of h.relevantAt ?? []) expect(LOCATIONS[l], `${h.id} relevantAt ${l}`).toBeDefined()
    }
  })

  it('mantra answers match the mantras the dialogue gives', () => {
    const answer = (id: string) => HINTS.find((h) => h.id === id)!.tiers[2]
    expect(allText(npc('Moonglow', 'Cromwell')!)).toContain("'AHM'")
    expect(answer('mantra-honesty')).toContain('AHM')
    expect(allText(npc('Trinsic', 'Kline')!)).toContain("'SUMM'")
    expect(answer('mantra-honor')).toContain('SUMM')
    expect(allText(npc('Magincia', 'Faultless')!)).toContain("'MUL'")
    expect(answer('mantra-humility')).toContain('LUM') // MUL reversed
  })
})

describe('gating rules', () => {
  const topic = HINTS[0]!
  it('caps visible tiers by spoiler level', () => {
    expect(maxTier('off')).toBe(0)
    expect(visibleTiers(topic, 'off', 3)).toEqual([])
    expect(visibleTiers(topic, 'nudges', 3)).toEqual([topic.tiers[0]])
    expect(visibleTiers(topic, 'full', 2)).toEqual(topic.tiers.slice(0, 2))
    expect(canReveal('nudges', 1)).toBe(false)
    expect(canReveal('full', 2)).toBe(true)
  })

  it('marks topics solved from progress and suggests sensible next steps', () => {
    const p = fresh()
    const prog = progress(p)
    expect(isSolved(HINTS.find((h) => h.id === 'rune-honesty')!, prog)).toBe(false)
    const next = suggestedTopics(prog, 5).map((h) => h.id)
    expect(next[0]).toBe('rune-honesty') // relevant in Moonglow (id 5)
    expect(next).not.toContain('shrine-humility') // needs the horn first

    p.runes = 1
    expect(isSolved(HINTS.find((h) => h.id === 'rune-honesty')!, progress(p))).toBe(true)
  })

  it('gates dialogue by visited settlements', () => {
    expect(dialogueUnlocked(6, 'visited', [5])).toBe(false)
    expect(dialogueUnlocked(6, 'all', [])).toBe(true)
    expect(recordVisit([5], 6)).toEqual([5, 6])
    expect(recordVisit([5], 0)).toEqual([5]) // surface
    expect(recordVisit([5], 17)).toEqual([5]) // dungeon
    expect(recordVisit([5, 6], 6)).toEqual([5, 6])
  })
})

describe.skipIf(!hasGame)('stone hints vs the dungeon altars (real install)', () => {
  it('names the level where each dungeon has its altar', () => {
    const DUNGEON_FILES: Record<string, string> = { Deceit: 'DECEIT.DNG', Despise: 'DESPISE.DNG', Destard: 'DESTARD.DNG', Wrong: 'WRONG.DNG', Covetous: 'COVETOUS.DNG', Shame: 'SHAME.DNG' }
    // the six dungeon stones (White and Black lie on the surface)
    const stones = HINTS.filter((h) => h.category === 'stones' && /level \d of \w+/.test(h.tiers[2]))
    expect(stones.length).toBe(6)
    for (const h of stones) {
      const m = /level (\d) of (\w+)/.exec(h.tiers[2])!
      const dng = gameFile(DUNGEON_FILES[m[2]!]!)
      const level = Number(m[1]) - 1
      const altars = [...dng.subarray(level * 64, level * 64 + 64)].filter((c) => (c & 0xf0) === 0xb0)
      expect(altars.length, `${h.title}: altar on level ${m[1]} of ${m[2]}`).toBeGreaterThan(0)
    }
  })
})

describe.skipIf(!hasGame)('stone hints say what the way to the altar needs (real install)', () => {
  it('mentions Dispel exactly when energy fields seal the altar, and a switch when only a room trigger opens it', () => {
    for (const h of HINTS.filter((t) => t.category === 'stones' && /level \d of \w+/.test(t.tiers[2]))) {
      const dungeon = /level \d of (\w+)/.exec(h.tiers[2])![1]!
      const d = parseDng(gameFile(`${dungeon.toUpperCase()}.DNG`))
      const L = d.levels
      const startI = [...L[0]!].findIndex((c) => (c & 0xf0) === 0x10 || (c & 0xf0) === 0x30)
      const start = { z: 0, x: startI % 8, y: Math.floor(startI / 8) }
      let altar = start
      L.forEach((l, z) => l.forEach((c, i) => { if ((c & 0xf0) === 0xb0) altar = { z, x: i % 8, y: Math.floor(i / 8) } }))
      const plain = d.rooms.map((r) => roomExits({ tiles: r.tiles, triggers: [] }, combatWalkable))
      const trig = d.rooms.map((r) => roomExits(r, combatWalkable))
      const needsDispel = !dungeonPath(L, start, altar, false, (r) => trig[r]!)
      const needsSwitch = !needsDispel && !dungeonPath(L, start, altar, false, (r) => plain[r]!)
      // Dispel is named when energy fields seal the dungeon; otherwise only for fields inside a room's fight
      if (needsDispel) expect(h.tiers[2], `${h.title}: Dispel`).toMatch(/Dispel/)
      else if (/Dispel/.test(h.tiers[2])) expect(h.tiers[2], `${h.title}: Dispel only in a fight`).toMatch(/in the fight/)
      if (needsSwitch) expect(h.tiers[2], `${h.title}: switch`).toMatch(/switch/)
    }
  })
})
