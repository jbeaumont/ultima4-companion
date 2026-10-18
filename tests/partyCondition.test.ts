import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { PartySave } from '@parsers/party'
import { partyAlerts } from '../src/domain/partyCondition'

const base = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
const member = (over: Partial<PartySave['members'][number]>) => ({ ...base.allRecords[0]!, ...over })

describe('partyAlerts', () => {
  const p: PartySave = {
    ...base,
    mixtures: base.mixtures.map(() => 0),
    members: [member({ name: 'Danny', status: 'P', hp: 52, hpMax: 200 }), member({ name: 'Iolo', status: 'D', hp: 0, hpMax: 300 })]
  }

  it('lists death first, then poison and low HP', () => {
    expect(partyAlerts(p).map((x) => x.text)).toEqual(['Iolo is dead', 'Danny is poisoned', 'Danny 52/200 HP'])
  })

  it('suggests a cure from what the party carries', () => {
    expect(partyAlerts(p)[1]!.hint).toMatch(/Ginseng \+ Garlic/)
    const mixed = { ...p, mixtures: p.mixtures.map((_, i) => (i === 2 ? 3 : 0)) }
    expect(partyAlerts(mixed)[1]!.hint).toBe('Cast Cure (3 mixed)')
  })

  it('stays quiet for a healthy party', () => {
    expect(partyAlerts({ ...p, members: [member({ status: 'G', hp: 150, hpMax: 200 })] })).toEqual([])
  })
})
