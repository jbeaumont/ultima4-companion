import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProfileStore } from '../src/main/profiles'
import { DEFAULT_PROFILE, differentAvatar, normalizeIndex, profileId } from '@shared/profiles'

const temp = () => mkdtemp(join(tmpdir(), 'u4c-profiles-'))

describe('profile store', () => {
  it('moves an existing journal and explored map into the default playthrough without losing them', async () => {
    const base = await temp()
    await writeFile(join(base, 'journal.json'), '{"notes":"my notes"}')
    await writeFile(join(base, 'explored.bin'), Uint8Array.of(1, 2, 3))
    const store = new ProfileStore(base)
    const index = await store.init()
    expect(index.active).toBe(DEFAULT_PROFILE.id)
    expect(await readFile(join(store.dir(), 'journal.json'), 'utf8')).toBe('{"notes":"my notes"}')
    expect([...(await readFile(join(store.dir(), 'explored.bin')))]).toEqual([1, 2, 3])
    const kept = await readdir(base)
    expect(kept).toContain('journal.json.pre-profiles') // the original is kept, not deleted
    expect(kept).toContain('explored.bin.pre-profiles')
  })

  it('starts a fresh install with an empty default playthrough', async () => {
    const store = new ProfileStore(await temp())
    expect((await store.init()).profiles.map((p) => p.id)).toEqual(['main'])
  })

  it('gives each playthrough its own folder, and switching changes where files go', async () => {
    const base = await temp()
    const store = new ProfileStore(base)
    await store.init()
    const mainDir = store.dir()
    const sam = await store.create("Sam's run")
    expect(sam.id).toBe('sam-s-run')
    expect(store.active().id).toBe('main') // creating does not switch
    await store.switchTo(sam.id)
    expect(store.dir()).not.toBe(mainDir)
    // reopening restores the same active playthrough
    const again = new ProfileStore(base)
    expect((await again.init()).active).toBe('sam-s-run')
    await expect(again.switchTo('nope')).rejects.toThrow()
  })

  it('records the Avatar once, so a different character can be flagged', async () => {
    const store = new ProfileStore(await temp())
    await store.init()
    expect(await store.noteAvatar('Danny')).toBe(true)
    expect(await store.noteAvatar('Sam')).toBe(false)
    expect(store.active().avatar).toBe('Danny')
    expect(differentAvatar(store.active(), 'Sam')).toBe(true)
    expect(differentAvatar(store.active(), 'Danny')).toBe(false)
  })

  it('recovers from a damaged index without losing the playthroughs folder', async () => {
    const base = await temp()
    await writeFile(join(base, 'profiles.json'), '{ not json')
    const index = await new ProfileStore(base).init()
    expect(index.profiles.length).toBe(1)
  })
})

describe('profile model', () => {
  it('normalizes what is on disk', () => {
    const i = normalizeIndex({ active: 'gone', profiles: [{ id: 'a', name: ' A ' }, { id: 'a', name: 'dup' }, { id: 'Bad Id' }, 7] })
    expect(i).toEqual({ active: 'a', profiles: [{ id: 'a', name: 'A', createdAt: 0 }] })
  })
  it('makes unique ids from names', () => {
    expect(profileId('Second run!', ['second-run'])).toBe('second-run-2')
    expect(profileId('???', [])).toBe('playthrough')
  })
})
