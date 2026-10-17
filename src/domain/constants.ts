// Ultima IV game constants, indexed exactly as the game stores them.

export const VIRTUES = [
  'Honesty', 'Compassion', 'Valor', 'Justice', 'Sacrifice', 'Honor', 'Spirituality', 'Humility'
] as const

export const CLASSES = [
  'Mage', 'Bard', 'Fighter', 'Druid', 'Tinker', 'Paladin', 'Ranger', 'Shepherd'
] as const

export const WEAPONS = [
  'Hands', 'Staff', 'Dagger', 'Sling', 'Mace', 'Axe', 'Sword', 'Bow',
  'Crossbow', 'Flaming Oil', 'Halberd', 'Magic Axe', 'Magic Sword', 'Magic Bow', 'Magic Wand', 'Mystic Sword'
] as const

export const ARMOR = [
  'Skin', 'Cloth', 'Leather', 'Chain Mail', 'Plate Mail', 'Magic Chain', 'Magic Plate', 'Mystic Robe'
] as const

export const REAGENTS = [
  'Sulfurous Ash', 'Ginseng', 'Garlic', 'Spider Silk', 'Blood Moss', 'Black Pearl', 'Nightshade', 'Mandrake Root'
] as const

export const SPELLS = [
  'Awaken', 'Blink', 'Cure', 'Dispel', 'Energy Field', 'Fireball', 'Gate', 'Heal', 'Iceball',
  'Jinx', 'Kill', 'Light', 'Magic Missile', 'Negate', 'Open', 'Protection', 'Quickness',
  'Resurrect', 'Sleep', 'Tremor', 'Undead', 'View', 'Winds', 'X-it', 'Y-up', 'Z-down'
] as const

/** Bit i of the stones byte. */
export const STONES = ['Blue', 'Yellow', 'Red', 'Green', 'Orange', 'Purple', 'White', 'Black'] as const

/** Bit i of the runes byte; same order as VIRTUES. */
export const RUNES = VIRTUES

/** Bits of the 16-bit item word at PARTY.SAV 0x1D2. */
export const ITEM_FLAGS = {
  skull: 0x0001,
  skullDestroyed: 0x0002,
  candle: 0x0004,
  book: 0x0008,
  bell: 0x0010,
  keyC: 0x0020,
  keyL: 0x0040,
  keyT: 0x0080,
  horn: 0x0100,
  wheel: 0x0200,
  candleUsed: 0x0400,
  bookUsed: 0x0800,
  bellUsed: 0x1000
} as const
export type ItemName = keyof typeof ITEM_FLAGS

export const STATUS = { G: 'Good', P: 'Poisoned', S: 'Sleeping', D: 'Dead' } as const

export type LocationKind = 'castle' | 'town' | 'dungeon' | 'shrine'

/** PARTY.SAV 0x1F4 location ids. 0 = surface. */
export const LOCATIONS: Record<number, { name: string; file?: string; upperFloor?: string; talk?: string; kind: LocationKind }> = {
  1: { name: "Lord British's Castle", file: 'LCB_1.ULT', upperFloor: 'LCB_2.ULT', talk: 'LCB.TLK', kind: 'castle' },
  2: { name: 'The Lycaeum', file: 'LYCAEUM.ULT', talk: 'LYCAEUM.TLK', kind: 'castle' },
  3: { name: 'Empath Abbey', file: 'EMPATH.ULT', talk: 'EMPATH.TLK', kind: 'castle' },
  4: { name: "Serpent's Hold", file: 'SERPENT.ULT', talk: 'SERPENT.TLK', kind: 'castle' },
  5: { name: 'Moonglow', file: 'MOONGLOW.ULT', talk: 'MOONGLOW.TLK', kind: 'town' },
  6: { name: 'Britain', file: 'BRITAIN.ULT', talk: 'BRITAIN.TLK', kind: 'town' },
  7: { name: 'Jhelom', file: 'JHELOM.ULT', talk: 'JHELOM.TLK', kind: 'town' },
  8: { name: 'Yew', file: 'YEW.ULT', talk: 'YEW.TLK', kind: 'town' },
  9: { name: 'Minoc', file: 'MINOC.ULT', talk: 'MINOC.TLK', kind: 'town' },
  10: { name: 'Trinsic', file: 'TRINSIC.ULT', talk: 'TRINSIC.TLK', kind: 'town' },
  11: { name: 'Skara Brae', file: 'SKARA.ULT', talk: 'SKARA.TLK', kind: 'town' },
  12: { name: 'Magincia', file: 'MAGINCIA.ULT', talk: 'MAGINCIA.TLK', kind: 'town' },
  13: { name: 'Paws', file: 'PAWS.ULT', talk: 'PAWS.TLK', kind: 'town' },
  14: { name: "Buccaneer's Den", file: 'DEN.ULT', talk: 'DEN.TLK', kind: 'town' },
  15: { name: 'Vesper', file: 'VESPER.ULT', talk: 'VESPER.TLK', kind: 'town' },
  16: { name: 'Cove', file: 'COVE.ULT', talk: 'COVE.TLK', kind: 'town' },
  17: { name: 'Deceit', file: 'DECEIT.DNG', kind: 'dungeon' },
  18: { name: 'Despise', file: 'DESPISE.DNG', kind: 'dungeon' },
  19: { name: 'Destard', file: 'DESTARD.DNG', kind: 'dungeon' },
  20: { name: 'Wrong', file: 'WRONG.DNG', kind: 'dungeon' },
  21: { name: 'Covetous', file: 'COVETOUS.DNG', kind: 'dungeon' },
  22: { name: 'Shame', file: 'SHAME.DNG', kind: 'dungeon' },
  23: { name: 'Hythloth', file: 'HYTHLOTH.DNG', kind: 'dungeon' },
  24: { name: 'The Stygian Abyss', file: 'ABYSS.DNG', kind: 'dungeon' },
  25: { name: 'Shrine of Honesty', kind: 'shrine' },
  26: { name: 'Shrine of Compassion', kind: 'shrine' },
  27: { name: 'Shrine of Valor', kind: 'shrine' },
  28: { name: 'Shrine of Justice', kind: 'shrine' },
  29: { name: 'Shrine of Sacrifice', kind: 'shrine' },
  30: { name: 'Shrine of Honor', kind: 'shrine' },
  31: { name: 'Shrine of Spirituality', kind: 'shrine' },
  32: { name: 'Shrine of Humility', kind: 'shrine' }
}

export function describeTransport(code: number): string {
  if (code >= 0x10 && code <= 0x13) return 'Ship'
  if (code === 0x14 || code === 0x15) return 'Horse'
  if (code === 0x18) return 'Balloon'
  if (code === 0x1f) return 'On foot'
  return `Unknown (0x${code.toString(16)})`
}
