import { describe, expect, it } from 'vitest'
import { arrowAngle, altarRoomLabel, liveMonsters, orbLabel, stoneAltarAt } from '@domain/dungeonInfo'
import { LZW_IMAGES, RLE_IMAGES } from '@parsers/egaImage'
import { decodeDungeonCell, parseDng } from '@parsers/dungeon'
import { LOCATIONS } from '@domain/constants'
import { gameFile, hasGame } from './gameFiles'

const room15 = decodeDungeonCell(0xd0 | 15)

describe('orbLabel', () => {
  it('names the attributes each dungeon raises', () => {
    expect(orbLabel(17)).toBe('Magic orb: +5 Intelligence')
    expect(orbLabel(20)).toBe('Magic orb: +5 Intelligence and Dexterity')
    expect(orbLabel(23)).toBe('Magic orb: +5 Strength and Dexterity and Intelligence')
    expect(orbLabel(24)).toBeNull()
  })
})

describe('altarRoomLabel', () => {
  it('labels the three level-8 altar room cells', () => {
    expect(altarRoomLabel(17, 7, 1, 1, room15)).toBe('Truth altar')
    expect(altarRoomLabel(19, 7, 3, 3, room15)).toBe('Love altar')
    expect(altarRoomLabel(23, 7, 7, 7, room15)).toBe('Courage altar')
  })
  it('ignores other levels, cells, rooms and the Abyss', () => {
    expect(altarRoomLabel(17, 6, 1, 1, room15)).toBeNull()
    expect(altarRoomLabel(17, 7, 2, 2, room15)).toBeNull()
    expect(altarRoomLabel(17, 7, 1, 1, decodeDungeonCell(0xd0 | 3))).toBeNull()
    expect(altarRoomLabel(17, 7, 1, 1, decodeDungeonCell(0x00))).toBeNull()
    expect(altarRoomLabel(24, 7, 1, 1, room15)).toBeNull()
  })
})

describe('stoneAltarAt', () => {
  it('matches only the exact dungeon, level and cell', () => {
    expect(stoneAltarAt(17, 6, 1, 7)?.stone).toBe('Blue stone')
    expect(stoneAltarAt(22, 1, 7, 7)?.stone).toBe('Purple stone')
    expect(stoneAltarAt(17, 5, 1, 7)).toBeNull()
    expect(stoneAltarAt(23, 6, 1, 7)).toBeNull()
  })
})

describe('arrowAngle', () => {
  it('points up for north and turns clockwise', () => {
    expect([0, 1, 2, 3].map(arrowAngle)).toEqual([270, 0, 90, 180])
  })
})

describe('liveMonsters', () => {
  it('maps cell index to monster name, skipping special tiles', () => {
    const level = new Uint8Array(64)
    level[5] = 0x01 // corridor + Rat
    level[9] = 0x0e // corridor + Skeleton
    level[10] = 0xd0 | 2 // room 2 (low nibble is the room, not a monster)
    expect([...liveMonsters(level, decodeDungeonCell)]).toEqual([[5, 'Rat'], [9, 'Skeleton']])
  })
})

describe.skipIf(!hasGame)('altar rooms against the real install', () => {
  it('labels every room-15 cell on level 8, and only those', () => {
    const labels = new Set<string>()
    for (const [id, loc] of Object.entries(LOCATIONS)) {
      if (loc.kind !== 'dungeon' || Number(id) === 24) continue
      const d = parseDng(gameFile(loc.file!))
      let found = 0
      d.levels[7]!.forEach((raw, i) => {
        const cell = decodeDungeonCell(raw)
        const label = altarRoomLabel(Number(id), 7, i % 8, Math.floor(i / 8), cell)
        if (cell.feature === 'room' && cell.variant === 15) {
          expect(label, `${loc.name} ${i}`).not.toBeNull()
          found++
          labels.add(label!)
        } else expect(label).toBeNull()
      })
      expect(found, loc.name).toBeGreaterThan(0)
    }
    expect([...labels].sort()).toEqual(['Courage altar', 'Love altar', 'Truth altar'])
  })
})
