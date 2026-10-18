import { describe, expect, it } from 'vitest'
import { CLASSES } from '@domain/constants'
import { COMPANIONS, companionStatus, joinReadiness } from '@domain/companions'
import { PARTY_SAV_SIZE } from '@parsers/party'
import { AVATAR_TILE, CARD_BG, VIRTUE_IMAGES, cardRects, classTile, crop, indicesToRgbaKeyed } from '@domain/dashboardArt'
import { decodeEgaImage } from '@parsers/egaImage'
import { parsePartySav } from '@parsers/party'
import type { CharacterRecord } from '@parsers/party'
import { gameFile, hasGame } from './gameFiles'

function synthetic(): Uint8Array {
  const px = new Uint8Array(320 * 200).fill(CARD_BG)
  const fill = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px[y * 320 + x] = v
  }
  fill(20, 30, 89, 122, 4)
  px[30 * 320 + 20] = 0 // black counts as card, not background
  fill(200, 10, 50, 60, 7)
  return px
}

describe('cardRects', () => {
  it('finds the box of non-green pixels in each half', () => {
    expect(cardRects(synthetic())).toEqual([{ x: 20, y: 30, w: 89, h: 122 }, { x: 200, y: 10, w: 50, h: 60 }])
  })
  it('returns null for an empty half', () => {
    const px = new Uint8Array(320 * 200).fill(CARD_BG)
    px[5 * 320 + 10] = 3
    expect(cardRects(px)).toEqual([{ x: 10, y: 5, w: 1, h: 1 }, null])
  })
  it('crop copies the rectangle', () => {
    const c = crop(synthetic(), 320, { x: 19, y: 29, w: 3, h: 3 })
    expect([...c]).toEqual([10, 10, 10, 10, 0, 4, 10, 4, 4])
  })
})

describe('sprites', () => {
  it('maps tiles and keys black transparent', () => {
    expect(AVATAR_TILE).toBe(31)
    expect(classTile(0)).toBe(32)
    expect(classTile(7)).toBe(46)
    const rgba = indicesToRgbaKeyed(Uint8Array.from([0, 4]), true)
    expect([...rgba]).toEqual([0, 0, 0, 0, 0xaa, 0, 0, 255])
    expect(indicesToRgbaKeyed(Uint8Array.from([0]), false)[3]).toBe(255)
  })
})

describe('companionStatus', () => {
  const rec = (name: string) => ({ name }) as CharacterRecord
  it('is party, same class, or unmet', () => {
    expect(companionStatus(COMPANIONS[1], [rec('Iolo')], 0)).toBe('party')
    expect(companionStatus(COMPANIONS[0], [], 0)).toBe('sameClass')
    expect(companionStatus(COMPANIONS[2], [rec('Iolo')], 0)).toBe('unmet')
  })
})

describe.skipIf(!hasGame)('COMPANIONS vs the template PARTY.SAV', () => {
  it('matches names and classes', () => {
    const recs = parsePartySav(gameFile('PARTY.SAV')).allRecords
    expect(recs.slice(0, 8).map((r) => ({ name: r.name, classIndex: r.classIndex }))).toEqual(COMPANIONS.map((c) => ({ ...c })))
    expect(COMPANIONS.map((c) => CLASSES[c.classIndex])).toEqual([...CLASSES])
  })
})

describe.skipIf(!hasGame)('virtue card art from the real install', () => {
  it('crops all eight cards to 89x122', () => {
    for (const { file } of VIRTUE_IMAGES) {
      const img = decodeEgaImage(file, gameFile(file))!
      for (const r of cardRects(img.pixels)) expect(r && [r.w, r.h]).toEqual([89, 122])
    }
  })
})

describe('joinReadiness', () => {
  const base = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  const party = (hpMax: number, karma: number[], members = 1) => {
    const avatar = { ...base.allRecords[0]!, name: 'Danny', classIndex: 0, hpMax }
    const all = [avatar, ...base.allRecords.slice(1)]
    return { ...base, allRecords: all, members: all.slice(0, members), memberCount: members, karma }
  }
  const k = (compassion: number) => [50, compassion, 50, 50, 50, 50, 50, 50]

  it('follows the game: class, the town virtue at 40, and 100 max HP per member plus one', () => {
    expect(joinReadiness(COMPANIONS[1], party(200, k(60)))).toEqual({ kind: 'ready', town: 'Britain' })
    expect(joinReadiness(COMPANIONS[0], party(200, k(60))).kind).toBe('sameClass')
    expect(joinReadiness(COMPANIONS[1], party(200, k(35)))).toEqual({ kind: 'needs', town: 'Britain', reasons: ['Compassion 40 (now 35)'] })
    expect(joinReadiness(COMPANIONS[1], party(200, k(0))).kind).toBe('ready') // a partial Avatar counts
    expect(joinReadiness(COMPANIONS[1], party(200, k(60), 2)).kind).toBe('needs') // needs 300 with two members
  })
})
