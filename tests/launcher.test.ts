import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { encodePartySav } from '@parsers/partyWriter'
import { emptyDungeonFog, isDungeonCellSeen, revealDungeon } from '@domain/dungeonFog'
import { canSaveHere, unsavedMoves } from '@domain/unsaved'
import { buildConf } from '../src/main/launcher'
import { isAllowedOverlay, realOverlay } from '../src/main/saveLocation'
import { WriteRefused, writeSaveFiles } from '../src/main/saves/safeWrite'
import { SnapshotStore } from '../src/main/saves/snapshots'

const party = (moves: number, name = 'Danny', location = 0) => {
  const s = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  s.memberCount = 1
  s.allRecords[0] = { ...s.allRecords[0]!, name, hp: 200, hpMax: 200, sex: 'male', status: 'G' }
  s.moves = moves
  s.location = location
  return s
}

describe('buildConf', () => {
  const base = { gameDir: 'C:\\Games\\Ultima 4', overlayDir: 'C:\\Users\\me\\AppData\\Roaming\\u4c-test\\game-saves' }
  it('test profile: turbo, windowed at a fixed size, test overlay', () => {
    const c = buildConf({ ...base, profile: 'test' })
    expect(c).toContain('cycles=max')
    expect(c).toContain('fullscreen=false')
    expect(c).toContain('windowresolution=960x600')
    expect(c).toContain(`mount C "${base.gameDir}"`)
    expect(c).toContain(`mount C "${base.overlayDir}" -t overlay`)
    expect(c.trimEnd().endsWith('exit')).toBe(true)
  })
  it('play profile keeps the authentic speed but is windowed', () => {
    const c = buildConf({ ...base, overlayDir: realOverlay(base.gameDir), profile: 'play' })
    expect(c).not.toContain('cycles=')
    expect(c).toContain('fullscreen=false')
    expect(c).toContain('cloud_saves')
  })
})

describe('isAllowedOverlay', () => {
  const game = 'C:\\Games\\Ultima 4'
  const testRoot = 'C:\\Users\\me\\AppData\\Roaming\\u4c-test\\game-saves'
  it('allows only cloud_saves and the test folder', () => {
    expect(isAllowedOverlay(realOverlay(game), game, testRoot)).toBe(true)
    expect(isAllowedOverlay(testRoot, game, testRoot)).toBe(true)
    expect(isAllowedOverlay(game, game, testRoot)).toBe(false)
    expect(isAllowedOverlay(join(testRoot, '..'), game, testRoot)).toBe(false)
    expect(isAllowedOverlay('D:\\elsewhere', game, testRoot)).toBe(false)
  })
})

describe('unsavedMoves', () => {
  it('counts moves since the save for the same game only', () => {
    expect(unsavedMoves(party(80), party(42))).toBe(38)
    expect(unsavedMoves(party(42), party(42))).toBe(0)
    expect(unsavedMoves(party(80, 'Iolo'), party(42))).toBeNull() // a different game
    expect(unsavedMoves(party(10), party(42))).toBeNull() // save is ahead: not comparable
    expect(unsavedMoves(null, party(42))).toBeNull()
  })
  it('knows saving only works on the surface', () => {
    expect(canSaveHere(party(1, 'Danny', 0))).toBe(true)
    expect(canSaveHere(party(1, 'Danny', 5))).toBe(false)
  })
})

describe('dungeon fog', () => {
  it('reveals the cell and its neighbours, wrapping at edges', () => {
    const f = emptyDungeonFog()
    expect(revealDungeon(f, 17, 0, 0, 0)).toBe(true)
    expect(isDungeonCellSeen(f, 17, 0, 0, 0)).toBe(true)
    expect(isDungeonCellSeen(f, 17, 0, 7, 0)).toBe(true) // wrapped west neighbour
    expect(isDungeonCellSeen(f, 17, 0, 1, 1)).toBe(false) // diagonal stays hidden
    expect(isDungeonCellSeen(f, 17, 1, 0, 0)).toBe(false) // other level
    expect(isDungeonCellSeen(f, 18, 0, 0, 0)).toBe(false) // other dungeon
    expect(revealDungeon(f, 17, 0, 0, 0)).toBe(false) // idempotent
    expect(revealDungeon(f, 5, 0, 0, 0)).toBe(false) // not a dungeon
  })
})

describe('writeSaveFiles into a test overlay', () => {
  let tmp: string
  let game: string
  let testRoot: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'u4c-l-'))
    game = join(tmp, 'game')
    testRoot = join(tmp, 'test-saves')
    mkdirSync(join(game, 'cloud_saves'), { recursive: true })
    mkdirSync(testRoot, { recursive: true })
    writeFileSync(join(game, 'WORLD.MAP'), new Uint8Array(65536))
    writeFileSync(join(game, 'cloud_saves', 'PARTY.SAV'), encodePartySav(party(100)))
    writeFileSync(join(testRoot, 'PARTY.SAV'), encodePartySav(party(5)))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))
  const deps = (store: SnapshotStore) => ({ isGameRunning: async () => false, snapshots: store, testRoot })

  it('writes only the test overlay, leaving the real save alone', async () => {
    const store = new SnapshotStore(join(tmp, 'snaps'))
    await writeSaveFiles({ gameDir: game, overlayDir: testRoot }, { 'PARTY.SAV': encodePartySav(party(999)) }, 'pre-edit', deps(store))
    expect(parsePartySav(new Uint8Array(readFileSync(join(testRoot, 'PARTY.SAV')))).moves).toBe(999)
    expect(parsePartySav(new Uint8Array(readFileSync(join(game, 'cloud_saves', 'PARTY.SAV')))).moves).toBe(100)
    // the backup came from the test overlay
    expect((await store.list())[0]!.summary!.moves).toBe(5)
  })

  it('refuses overlays outside cloud_saves and the test root', async () => {
    const store = new SnapshotStore(join(tmp, 'snaps'))
    await expect(writeSaveFiles({ gameDir: game, overlayDir: game }, { 'PARTY.SAV': encodePartySav(party(1)) }, 'pre-edit', deps(store)))
      .rejects.toBeInstanceOf(WriteRefused)
  })
})
