// Quest progress derived from a save. Abyss requirements follow xu4 (item.cpp
// useBBC / abyss entry, dungeon altars needing the stones, the three-part key).
import type { PartySave } from '@parsers/party'
import { ITEM_FLAGS, STONES, VIRTUES } from './constants'
import type { ItemName } from './constants'

export interface VirtueProgress {
  virtue: string
  rune: boolean
  karma: number
  /** Partial Avatarhood achieved (karma reset to 0 after meditating). */
  avatar: boolean
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
  group: 'virtues' | 'runes' | 'stones' | 'items' | 'abyss'
  /** Required to finish the game, as opposed to merely helpful. */
  required: boolean
}

export interface Progress {
  virtues: VirtueProgress[]
  checklist: ChecklistItem[]
  avatarCount: number
  requiredDone: number
  requiredTotal: number
  /** Everything needed to descend into the Abyss is in hand. */
  abyssReady: boolean
}

const has = (p: PartySave, item: ItemName) => (p.items & ITEM_FLAGS[item]) !== 0
const bit = (field: number, i: number) => (field & (1 << i)) !== 0

export function progress(p: PartySave): Progress {
  const virtues = VIRTUES.map((virtue, i) => {
    const karma = p.karma[i] ?? 0
    return { virtue, rune: bit(p.runes, i), karma, avatar: karma === 0 }
  })
  const keyParts = has(p, 'keyC') && has(p, 'keyL') && has(p, 'keyT')
  const bbc = ['bell', 'book', 'candle'] as const

  const checklist: ChecklistItem[] = [
    ...virtues.map((v) => ({ id: `avatar-${v.virtue}`, label: `Partial Avatarhood: ${v.virtue}`, done: v.avatar, group: 'virtues' as const, required: true })),
    ...virtues.map((v) => ({ id: `rune-${v.virtue}`, label: `Rune of ${v.virtue}`, done: v.rune, group: 'runes' as const, required: true })),
    ...STONES.map((s, i) => ({ id: `stone-${s}`, label: `${s} Stone`, done: bit(p.stones, i), group: 'stones' as const, required: true })),
    ...bbc.map((b) => ({ id: b, label: `The ${b[0]!.toUpperCase()}${b.slice(1)}`, done: has(p, b) || has(p, `${b}Used`), group: 'items' as const, required: true })),
    { id: 'keyT', label: 'Key part: Truth', done: has(p, 'keyT'), group: 'items', required: true },
    { id: 'keyL', label: 'Key part: Love', done: has(p, 'keyL'), group: 'items', required: true },
    { id: 'keyC', label: 'Key part: Courage', done: has(p, 'keyC'), group: 'items', required: true },
    { id: 'horn', label: 'Silver Horn', done: has(p, 'horn'), group: 'items', required: false },
    { id: 'wheel', label: 'Wheel of H.M.S. Cape', done: has(p, 'wheel'), group: 'items', required: false },
    { id: 'skull', label: 'Skull of Mondain', done: has(p, 'skull') || has(p, 'skullDestroyed'), group: 'items', required: false },
    { id: 'skullDestroyed', label: 'Skull cast into the Abyss', done: has(p, 'skullDestroyed'), group: 'items', required: false },
    ...bbc.map((b) => ({ id: `${b}Used`, label: `${b[0]!.toUpperCase()}${b.slice(1)} used at the Abyss`, done: has(p, `${b}Used`), group: 'abyss' as const, required: false }))
  ]

  const required = checklist.filter((c) => c.required)
  const avatarCount = virtues.filter((v) => v.avatar).length
  return {
    virtues,
    checklist,
    avatarCount,
    requiredDone: required.filter((c) => c.done).length,
    requiredTotal: required.length,
    abyssReady: avatarCount === 8 && p.stones === 0xff && keyParts && bbc.every((b) => has(p, b) || has(p, `${b}Used`))
  }
}
