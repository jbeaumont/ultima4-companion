import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEV_DATA, INSTALLED_DATA, TEST_DATA, dataFolder, seedDevData } from '../src/main/devData'

let appData: string
beforeEach(() => { appData = mkdtempSync(join(tmpdir(), 'u4c-devdata-')) })
afterEach(() => rmSync(appData, { recursive: true, force: true }))

describe('dev userData', () => {
  it('test runs, dev runs and the installed app each get their own folder', () => {
    expect(dataFolder(true, false)).toBe(TEST_DATA)
    expect(dataFolder(true, true)).toBe(TEST_DATA)
    expect(dataFolder(false, false)).toBe(DEV_DATA)
    expect(dataFolder(false, true)).toBeNull() // installed: Electron's default, ultima4-companion
  })

  it("copies the companion's files once, leaving the shared folder and caches alone", () => {
    const shared = join(appData, INSTALLED_DATA)
    mkdirSync(join(shared, 'profiles', 'main'), { recursive: true })
    writeFileSync(join(shared, 'settings.json'), '{"liveMemory":true}')
    writeFileSync(join(shared, 'profiles', 'main', 'journal.json'), '{}')
    mkdirSync(join(shared, 'Cache'))
    writeFileSync(join(shared, 'sage-key.bin'), 'secret')

    expect(seedDevData(appData).sort()).toEqual(['profiles', 'settings.json'])
    const dev = join(appData, DEV_DATA)
    expect(readFileSync(join(dev, 'settings.json'), 'utf8')).toBe('{"liveMemory":true}')
    expect(existsSync(join(dev, 'profiles', 'main', 'journal.json'))).toBe(true)
    expect(existsSync(join(dev, 'Cache'))).toBe(false)
    expect(existsSync(join(dev, 'sage-key.bin'))).toBe(false)
    expect(existsSync(join(shared, 'settings.json'))).toBe(true) // copied, not moved

    writeFileSync(join(shared, 'settings.json'), '{"liveMemory":false}')
    expect(seedDevData(appData)).toEqual([]) // only the first time
    expect(readFileSync(join(dev, 'settings.json'), 'utf8')).toBe('{"liveMemory":true}')
  })

  it('does nothing on a fresh machine', () => {
    expect(seedDevData(appData)).toEqual([])
    expect(existsSync(join(appData, DEV_DATA))).toBe(false)
  })
})
