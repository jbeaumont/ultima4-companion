import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { encodePartySav } from '@parsers/partyWriter'
import { describeChanges } from '@shared/saveDiff'
import { WriteRefused, writeSaveFiles } from '../src/main/saves/safeWrite'
import { SnapshotStore, effectiveSavePaths, restoreWarning, toPrune } from '../src/main/saves/snapshots'
import type { SnapshotMeta } from '../src/main/saves/snapshots'

function party(gold: number, name = 'Danny'): Uint8Array {
  const s = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  s.memberCount = 1
  s.allRecords[0] = { ...s.allRecords[0]!, name, hp: 200, hpMax: 200, sex: 'male', status: 'G' }
  s.gold = gold
  s.karma = [50, 50, 50, 50, 50, 50, 50, 50]
  return encodePartySav(s)
}

let tmp: string
let game: string
let store: SnapshotStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'u4c-'))
  game = join(tmp, 'game')
  mkdirSync(join(game, 'cloud_saves'), { recursive: true })
  writeFileSync(join(game, 'WORLD.MAP'), new Uint8Array(65536))
  writeFileSync(join(game, 'PARTY.SAV'), party(1, 'Template')) // pristine root copy
  writeFileSync(join(game, 'MONSTERS.SAV'), new Uint8Array(256))
  writeFileSync(join(game, 'cloud_saves', 'PARTY.SAV'), party(100))
  store = new SnapshotStore(join(tmp, 'snapshots'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const notRunning = { isGameRunning: async () => false }
const goldIn = (p: string) => parsePartySav(new Uint8Array(readFileSync(p))).gold

describe('effectiveSavePaths', () => {
  it('prefers the cloud_saves overlay and falls back to the game folder', () => {
    const p = effectiveSavePaths(game)
    expect(p['PARTY.SAV']).toBe(join(game, 'cloud_saves', 'PARTY.SAV'))
    expect(p['MONSTERS.SAV']).toBe(join(game, 'MONSTERS.SAV'))
    expect(p['DNGMAP.SAV']).toBeUndefined()
  })
})

describe('SnapshotStore', () => {
  it('takes, lists and reads snapshots with a summary', async () => {
    const meta = await store.take(game, 'manual', 'before Despise')
    expect(meta?.summary).toMatchObject({ names: ['Danny'], location: 'Britannia' })
    expect(meta?.files.sort()).toEqual(['MONSTERS.SAV', 'PARTY.SAV'])
    const list = await store.list()
    expect(list.map((m) => m.label)).toEqual(['before Despise'])
    const { files } = await store.read(meta!.id)
    expect(parsePartySav(files['PARTY.SAV']!).gold).toBe(100)
  })

  it('skips auto snapshots identical to the newest one', async () => {
    expect(await store.take(game, 'auto', undefined, new Date(1000))).not.toBeNull()
    expect(await store.take(game, 'auto', undefined, new Date(2000))).toBeNull()
    writeFileSync(join(game, 'cloud_saves', 'PARTY.SAV'), party(150))
    expect(await store.take(game, 'auto', undefined, new Date(3000))).not.toBeNull()
    expect(await store.list()).toHaveLength(2)
  })

  it('detects damaged snapshots and rejects odd ids', async () => {
    const meta = (await store.take(game, 'manual'))!
    writeFileSync(join(tmp, 'snapshots', meta.id, 'PARTY.SAV'), party(9999))
    await expect(store.read(meta.id)).rejects.toThrow(/damaged/)
    await expect(store.read('../../etc')).rejects.toThrow(/Invalid/)
  })

  it('prunes only old auto snapshots', () => {
    const m = (id: string, reason: SnapshotMeta['reason'], t: number): SnapshotMeta => ({ id, reason, createdAt: t, hash: id, files: [], summary: null })
    const metas = [m('a1', 'auto', 1), m('a2', 'auto', 2), m('a3', 'auto', 3), m('man', 'manual', 0)]
    expect(toPrune(metas, 2)).toEqual(['a1'])
  })

  it('records the active playthrough and prunes each playthrough separately', async () => {
    let active = { id: 'first', name: 'First', avatar: 'Danny' }
    const tagged = new SnapshotStore(join(tmp, 'tagged'), () => active)
    expect((await tagged.take(game, 'manual'))!.playthrough).toEqual(active)
    active = { id: 'second', name: 'Second', avatar: 'Ann' }
    expect((await tagged.take(game, 'manual', undefined, new Date(Date.now() + 5)))!.playthrough?.id).toBe('second')

    const m = (id: string, p: string, t: number): SnapshotMeta => ({ id, reason: 'auto', createdAt: t, hash: id, files: [], summary: null, playthrough: { id: p, name: p } })
    // the busy playthrough b prunes its own oldest, never a's
    expect(toPrune([m('a1', 'a', 1), m('b1', 'b', 2), m('b2', 'b', 3), m('b3', 'b', 4)], 2)).toEqual(['b1'])
  })
})

describe('restoreWarning', () => {
  const meta = (playthrough?: SnapshotMeta['playthrough'], avatar = 'Danny'): SnapshotMeta => ({
    id: 'x', reason: 'manual', createdAt: 0, hash: '', files: [],
    summary: { names: [avatar], moves: 0, location: 'Britannia', x: 0, y: 0, avatarCount: 0 },
    ...(playthrough ? { playthrough } : {})
  })
  const me = { id: 'main', name: 'Main', avatar: 'Danny' }

  it('is quiet for this playthrough and for older untagged snapshots of the same Avatar', () => {
    expect(restoreWarning(meta({ id: 'main', name: 'Main' }), me)).toBeNull()
    expect(restoreWarning(meta(), me)).toBeNull()
    expect(restoreWarning(meta(), { id: 'main', name: 'Main' })).toBeNull()
  })

  it("warns for another playthrough's snapshot or another Avatar", () => {
    expect(restoreWarning(meta({ id: 'alt', name: 'Alt run' }), me)).toMatch(/"Alt run" \(Avatar Danny\)/)
    expect(restoreWarning(meta(undefined, 'Ann'), me)).toMatch(/another character \(Avatar Ann\)/)
  })
})

describe('writeSaveFiles', () => {
  it('refuses while the game is running', async () => {
    await expect(writeSaveFiles(game, { 'PARTY.SAV': party(5) }, 'pre-edit', { isGameRunning: async () => true, snapshots: store })).rejects.toBeInstanceOf(WriteRefused)
    expect(goldIn(join(game, 'cloud_saves', 'PARTY.SAV'))).toBe(100)
  })

  it('refuses files outside the whitelist and wrong sizes', async () => {
    await expect(writeSaveFiles(game, { 'WORLD.MAP': new Uint8Array(10) }, 'pre-edit', { ...notRunning, snapshots: store })).rejects.toThrow(/not a save file/)
    await expect(writeSaveFiles(game, { '../PARTY.SAV': party(5) }, 'pre-edit', { ...notRunning, snapshots: store })).rejects.toThrow(/not a save file/)
    await expect(writeSaveFiles(game, { 'PARTY.SAV': new Uint8Array(10) }, 'pre-edit', { ...notRunning, snapshots: store })).rejects.toThrow(/502 bytes/)
    await expect(writeSaveFiles(join(tmp, 'nowhere'), { 'PARTY.SAV': party(5) }, 'pre-edit', { ...notRunning, snapshots: store })).rejects.toThrow(/not found/)
  })

  it('backs up first, writes into cloud_saves only, and can be undone', async () => {
    const { backup, written } = await writeSaveFiles(game, { 'PARTY.SAV': party(777) }, 'pre-edit', { ...notRunning, snapshots: store })
    expect(written).toEqual(['PARTY.SAV'])
    expect(goldIn(join(game, 'cloud_saves', 'PARTY.SAV'))).toBe(777)
    expect(goldIn(join(game, 'PARTY.SAV'))).toBe(1) // root copy untouched
    expect(existsSync(join(game, 'cloud_saves', 'PARTY.SAV.u4c.tmp'))).toBe(false)

    // the backup holds the old save; restoring it brings the old gold back
    const { files } = await store.read(backup!.id)
    expect(parsePartySav(files['PARTY.SAV']!).gold).toBe(100)
    await writeSaveFiles(game, files, 'pre-restore', { ...notRunning, snapshots: store })
    expect(goldIn(join(game, 'cloud_saves', 'PARTY.SAV'))).toBe(100)
    expect((await store.list()).map((m) => m.reason).sort()).toEqual(['pre-edit', 'pre-restore'])
  })
})

describe('describeChanges', () => {
  it('lists changed fields only', () => {
    const a = parsePartySav(party(100))
    const b = parsePartySav(party(250))
    b.karma[3] = 0
    expect(describeChanges(a, b)).toEqual(['gold: 100 → 250', 'karma[3]: 50 → 0'])
  })
})
