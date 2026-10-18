// A battle in progress, read from the game's globals in DOSBox memory (layout
// from u4-decompiled U4.H): `Combat` at DS:9470 and `Fighters` at DS:9530.
// Monster names and starting HP come from U4_COMBC.C (D_23D2 and C_7C25).

export const BATTLE_SIZE = 11

/** Offsets in the game's data segment; the party block (`Party`) sits at 0x9144. */
export const BATTLE_DS = {
  party: 0x9144,
  curMode: 0x946a,
  combat: 0x9470, // _npcX[16] _npcY[16] _charaX[8] _charaY[8] pad[16] _map[121]
  combatSize: 0x40 + BATTLE_SIZE * BATTLE_SIZE,
  fighters: 0x9530, // _x _y _HP _tile _gtile _sleeping [16] each, then _chtile[8]
  fightersSize: 0x68,
  activeChara: 0x959a
} as const

export const MODE_COMBAT = 4
export const MODE_CAMP = 5
export const MODE_ROOM = 6
export const isBattleMode = (mode: number): boolean => mode >= MODE_COMBAT && mode <= MODE_ROOM

// [name, highest starting HP] by monster index (C_7C25)
const MONSTERS: [string, number][] = [
  ['Pirate ship', 255], ['Pirate ship', 255], ['Nixie', 64], ['Giant squid', 96], ['Sea serpent', 128], ['Seahorse', 96],
  ['Whirlpool', 255], ['Twister', 255], ['Rat', 48], ['Bat', 48], ['Giant spider', 64], ['Ghost', 80], ['Slime', 48],
  ['Troll', 96], ['Gremlin', 48], ['Mimic', 192], ['Reaper', 255], ['Insect swarm', 48], ['Gazer', 240], ['Phantom', 128],
  ['Orc', 80], ['Skeleton', 48], ['Rogue', 80], ['Python', 48], ['Ettin', 112], ['Headless', 64], ['Cyclops', 128],
  ['Wisp', 64], ['Evil mage', 176], ['Lich', 192], ['Lava lizard', 96], ['Zorn', 240], ['Daemon', 112], ['Hydra', 208],
  ['Dragon', 224], ['Balron', 255]
]
// people: tiles 0x20-0x2f and 0x50-0x5f, two animation frames each
const PEOPLE: [string, number][] = [
  ['Mage', 112], ['Bard', 48], ['Fighter', 96], ['Druid', 64], ['Tinker', 96], ['Paladin', 128], ['Ranger', 144], ['Shepherd', 48],
  ['Guard', 128], ['Merchant', 48], ['Bard', 48], ['Jester', 48], ['Beggar', 32], ['Child', 32], ['Bull', 128], ['Lord British', 255]
]

/** Name and highest starting HP for a fighter tile. */
export function monsterInfo(tile: number): { name: string; maxHp: number } {
  if (tile >= 0x80) {
    const t = tile & 0x7f
    const i = t >> 1 < 8 ? t >> 1 : (t >> 2) + 4
    const m = MONSTERS[i]
    return m ? { name: m[0], maxHp: m[1] } : { name: `Monster #${tile}`, maxHp: 255 }
  }
  const p = tile >= 0x20 && tile < 0x30 ? PEOPLE[(tile - 0x20) >> 1] : tile >= 0x50 && tile < 0x60 ? PEOPLE[8 + ((tile - 0x50) >> 1)] : undefined
  return p ? { name: p[0], maxHp: p[1] } : { name: `Foe #${tile}`, maxHp: 255 }
}

/** The game's own wording for a monster's state (COM_DoDamage). */
export function woundText(hp: number, maxHp: number): string {
  const half = maxHp >> 1
  const quarter = half >> 1
  if (hp < 24) return 'Fleeing'
  if (hp < quarter) return 'Critical'
  if (hp < half) return 'Heavily wounded'
  if (hp < quarter + half) return 'Lightly wounded'
  return 'Barely wounded'
}

export interface BattleMonster {
  /** Fighter slot (0-15), stable for the whole battle. */
  slot: number
  x: number
  y: number
  tile: number
  hp: number
  name: string
  maxHp: number
  /** HP when first seen this battle (monsters start with random HP); filled in by the live reader. */
  startHp?: number
}

export interface BattleState {
  mode: number
  /** A dungeon room (leave it by walking off an edge once it is clear). */
  room: boolean
  /** 11x11 combat map tiles, row-major. */
  map: number[]
  monsters: BattleMonster[]
  /** Party members still on the field, by party slot. */
  party: ({ x: number; y: number; tile: number } | null)[]
  /** Slot whose turn it is (or was last). */
  active: number
}

export function parseBattle(mode: number, combat: Uint8Array, fighters: Uint8Array, active: number): BattleState {
  const monsters: BattleMonster[] = []
  for (let i = 0; i < 16; i++) {
    const tile = fighters[0x30 + i]!
    if (tile) monsters.push({ slot: i, x: combat[i]!, y: combat[0x10 + i]!, tile, hp: fighters[0x20 + i]!, ...monsterInfo(tile) })
  }
  const party = Array.from({ length: 8 }, (_, i) => {
    const tile = fighters[0x60 + i]!
    return tile ? { x: combat[0x20 + i]!, y: combat[0x28 + i]!, tile } : null
  })
  return {
    mode,
    room: mode === MODE_ROOM,
    map: [...combat.subarray(0x40, 0x40 + BATTLE_SIZE * BATTLE_SIZE)],
    monsters,
    party,
    active
  }
}
