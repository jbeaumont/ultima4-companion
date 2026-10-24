import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProfileStore } from '../src/main/profiles'
import { DEFAULT_PROFILE, adoption, differentAvatar, normalizeIndex, profileId } from '@shared/profiles'

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

  it("a new playthrough waits for a new game instead of adopting the save's character (#67)", async () => {
    const base = await temp()
    const store = new ProfileStore(base)
    await store.init()
    await store.noteAvatar('Danny', 42)
    const fresh = await store.create('Second run', { avatar: 'Danny', moves: 42 })
    await store.switchTo(fresh.id)
    // still Danny from the old save: not adopted, however long it is seen
    expect(store.waiting('Danny', 50)).toBe(true)
    expect(await store.noteAvatar('Danny', 50)).toBe(false)
    expect(store.active().avatar).toBeUndefined()
    // a new game: Initiate New Game resets the moves, even under the same name
    expect(store.waiting('Danny', 1)).toBe(false)
    expect(await store.noteAvatar('Danny', 1)).toBe(true)
    expect(store.active()).toMatchObject({ avatar: 'Danny' })
    expect(store.active().waitingFor).toBeUndefined()
    // kept across restarts
    const again = new ProfileStore(base)
    await again.init()
    expect(again.active().avatar).toBe('Danny')
  })

  it('adopts a newly named character, or the old one when the player chooses to follow it', async () => {
    const store = new ProfileStore(await temp())
    await store.init()
    const a = await store.create('A', { avatar: 'Danny', moves: 42 })
    await store.switchTo(a.id)
    expect(await store.noteAvatar('Danno', 1)).toBe(true)
    const b = await store.create('B', { avatar: 'Danno', moves: 5 })
    await store.switchTo(b.id)
    expect(store.waiting('Danno', 9)).toBe(true)
    expect(await store.follow('Danno')).toBe(true)
    expect(store.waiting('Danno', 9)).toBe(false)
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
  it('older playthroughs without a note never adopt a character another one owns', () => {
    const main = { id: 'main', name: 'Main', createdAt: 0, avatar: 'Danny' }
    const old = { id: 'old', name: 'Old', createdAt: 0 }
    expect(adoption(old, [main, old], 'Danny', 500)).toBe('wait')
    expect(adoption(old, [main, old], 'Sam', 1)).toBe('adopt')
    expect(adoption(main, [main, old], 'Sam', 1)).toBe('has')
    expect(normalizeIndex({ active: 'x', profiles: [{ id: 'x', name: 'X', waitingFor: { avatar: 'Danny', moves: 3 } }] }).profiles[0]!.waitingFor)
      .toEqual({ avatar: 'Danny', moves: 3 })
  })
  it('makes unique ids from names', () => {
    expect(profileId('Second run!', ['second-run'])).toBe('second-run-2')
    expect(profileId('???', [])).toBe('playthrough')
  })
})
