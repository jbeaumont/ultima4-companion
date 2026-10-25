// The Controls view's command table against the game's own key handlers
// (u4-decompiled U4_DNG.C and U4_COMBA.C dispatch: the letters each one acts on).
import { describe, expect, it } from 'vitest'
import { GAME_COMMANDS } from '@shared/controls'

// letters the dungeon loop dispatches to a command (the rest answer "Not here"); Q is dispatched but
// refuses off the surface, so the view lists it as surface-only
const DUNGEON = 'CDGHIKMNPRSUVWZ'
const COMBAT = 'ACGRUVZ'

describe('controls', () => {
  it('lists every command letter A to Z once', () => {
    expect(GAME_COMMANDS.map((x) => x.key).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })

  it('knows where the game accepts each command', () => {
    expect(GAME_COMMANDS.filter((x) => x.dungeon).map((x) => x.key).join('')).toBe(DUNGEON)
    expect(GAME_COMMANDS.filter((x) => x.combat).map((x) => x.key).join('')).toBe(COMBAT)
    expect(GAME_COMMANDS.every((x) => x.surface)).toBe(true)
  })
})
