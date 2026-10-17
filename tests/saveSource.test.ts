import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE } from '@parsers/party'
import { join } from 'node:path'
import { cloudSavePath, pickSavePath, rootSavePath, selectGameDir } from '../src/main/gameLocator'
import { isPartial, readState } from '../src/main/saveFileSource'

const G = 'C:\\Games\\U4'
const has = (...paths: string[]) => (p: string) => paths.includes(p)
const world = (d: string) => join(d, 'WORLD.MAP')

describe('selectGameDir', () => {
  it('prefers earlier valid candidates', () => {
    const exists = has(world('A'), world('B'))
    expect(selectGameDir(['A', 'B'], exists)).toBe('A')
  })
  it('skips invalid and empty candidates', () => {
    expect(selectGameDir([undefined, '', 'A', 'B'], has(world('B')))).toBe('B')
  })
  it('returns null when none valid', () => {
    expect(selectGameDir(['A'], has())).toBeNull()
  })
})

describe('pickSavePath', () => {
  it('prefers cloud_saves', () => {
    expect(pickSavePath(G, has(cloudSavePath(G), rootSavePath(G)))).toBe(cloudSavePath(G))
  })
  it('falls back to root', () => {
    expect(pickSavePath(G, has(rootSavePath(G)))).toBe(rootSavePath(G))
  })
  it('returns null when neither or no dir', () => {
    expect(pickSavePath(G, has())).toBeNull()
    expect(pickSavePath(null, has())).toBeNull()
  })
})

describe('readState', () => {
  it('parses a full file', async () => {
    const s = await readState(G, 'p', async () => new Uint8Array(PARTY_SAV_SIZE), () => 42)
    expect(s.status).toBe('ok')
    expect(s.updatedAt).toBe(42)
    expect(s.party).not.toBeNull()
  })
  it('tolerates a short (mid-write) file', async () => {
    const s = await readState(G, 'p', async () => new Uint8Array(100))
    expect(s.status).toBe('error')
    expect(s.party).toBeNull()
    expect(isPartial(s)).toBe(true)
  })
  it('reports a missing file as noSave', async () => {
    const s = await readState(G, 'p', async () => {
      throw Object.assign(new Error('x'), { code: 'ENOENT' })
    })
    expect(s.status).toBe('noSave')
  })
  it('reports noGame and noSave without reading', async () => {
    const fail = async () => { throw new Error('should not read') }
    expect((await readState(null, null, fail)).status).toBe('noGame')
    expect((await readState(G, null, fail)).status).toBe('noSave')
  })
})
