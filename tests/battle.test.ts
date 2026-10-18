import { describe, expect, it } from 'vitest'
import { BATTLE_DS, BATTLE_SIZE, isBattleMode, monsterInfo, parseBattle, woundText } from '@parsers/battle'

describe('battle parser', () => {
  it('names monsters by tile, across animation frames', () => {
    expect(monsterInfo(0x90).name).toBe('Rat')
    expect(monsterInfo(0x93).name).toBe('Rat')
    expect(monsterInfo(0x94)).toEqual({ name: 'Bat', maxHp: 48 })
    expect(monsterInfo(0x84).name).toBe('Nixie')
    expect(monsterInfo(0xfc).name).toBe('Balron')
    expect(monsterInfo(0x50).name).toBe('Guard')
    expect(monsterInfo(0x2e).name).toBe('Shepherd')
  })

  it('uses the game wording for wounds', () => {
    expect(woundText(20, 255)).toBe('Fleeing')
    expect(woundText(50, 255)).toBe('Critical')
    expect(woundText(100, 255)).toBe('Heavily wounded')
    expect(woundText(150, 255)).toBe('Lightly wounded')
    expect(woundText(250, 255)).toBe('Barely wounded')
  })

  it('reads monsters, the party and the map from the Combat and Fighters globals', () => {
    const combat = new Uint8Array(BATTLE_DS.combatSize)
    const fighters = new Uint8Array(BATTLE_DS.fightersSize)
    combat[3] = 4 // monster 3 at 4,7
    combat[0x10 + 3] = 7
    fighters[0x20 + 3] = 30
    fighters[0x30 + 3] = 0x90
    combat[0x20 + 1] = 5 // member 1 at 5,9
    combat[0x28 + 1] = 9
    fighters[0x60 + 1] = 0x21
    combat[0x40 + 2 * BATTLE_SIZE + 6] = 0x7f
    const b = parseBattle(6, combat, fighters, 1)
    expect(b.room).toBe(true)
    expect(b.monsters).toEqual([{ slot: 3, x: 4, y: 7, tile: 0x90, hp: 30, name: 'Rat', maxHp: 48 }])
    expect(b.party[0]).toBeNull()
    expect(b.party[1]).toEqual({ x: 5, y: 9, tile: 0x21 })
    expect(b.map[2 * BATTLE_SIZE + 6]).toBe(0x7f)
    expect([3, 4, 5, 6, 7].map(isBattleMode)).toEqual([false, true, true, true, false])
  })
})
