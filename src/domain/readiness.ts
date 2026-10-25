// Readiness (#72): when the next quest goal needs preparation first. Levels come
// from realistic test parties (stone.ts --party; results on issue #72): a level 2
// party took the Despise stone (dungeon level 5), level 3 the Destard stone
// (level 7). Wandering monsters scale with depth the same way in every dungeon
// (U4_AI.C C_95AA), with Reapers and Gazers from level 6. Places that cannot be
// reached on foot were computed from WORLD.MAP (tests/readiness.test.ts redoes it).
import type { PartySave } from '../parsers/party'
import { LOCATIONS } from './constants'
import { STONE_ALTARS } from './dungeonInfo'
import type { HintTopic, SpoilerLevel } from './hints'
import { disclosure } from './spoilers'

export interface ReadinessStep {
  id: string
  title: string
  detail: string
}

/** Recommended party level for a goal on this dungeon level (1-8). */
export const recommendedLevel = (dungeonLevel: number): number => (dungeonLevel <= 5 ? 2 : 3)

/** Settlements, dungeons and shrines no walk from Britain (with the moongates) reaches. */
export const NOT_ON_FOOT_PLACES = new Set([4, 14, 16, 17, 21, 22, 23, 24, 25, 27, 32])
/** Quest topics whose spot is at sea or cut off by mountains. */
export const NOT_ON_FOOT_TOPICS = new Set(['item-bell', 'item-wheel', 'item-skull', 'item-horn', 'stone-white'])

const SHIP = (t: number) => t >= 0x10 && t <= 0x13
const BALLOON = 0x18

/** Whether a quest topic's place can't be reached on foot. */
export const needsShip = (t: HintTopic): boolean =>
  NOT_ON_FOOT_TOPICS.has(t.id) || (t.relevantAt ?? []).some((l) => NOT_ON_FOOT_PLACES.has(l))

/** The dungeon and altar depth of a stone topic, if it is one with an altar in a dungeon. */
function stoneDepth(t: HintTopic): { dungeon: string; level: number } | null {
  for (const l of t.relevantAt ?? []) {
    const a = STONE_ALTARS[l]
    if (a) return { dungeon: LOCATIONS[l]!.name, level: a.level + 1 }
  }
  return null
}

/** At most one preparation step for the next quest topics, most pressing first. */
export function readinessSteps(p: PartySave, level: SpoilerLevel, upcoming: readonly HintTopic[]): ReadinessStep[] {
  const me = p.allRecords[0]
  if (!me) return []
  const full = disclosure(level).hintTiers >= 3
  const partyLevel = Math.floor(me.hpMax / 100)
  const next = upcoming.slice(0, 3)
  const out: ReadinessStep[] = []

  const deep = next.map((t) => ({ t, d: stoneDepth(t) })).find((x) => x.d)
  if (deep?.d) {
    const want = recommendedLevel(deep.d.level)
    if (partyLevel < want) {
      out.push({
        id: 'readiness-strength',
        title: 'Grow stronger first',
        detail: full
          ? `${deep.t.title}: its altar is on level ${deep.d.level} of ${deep.d.dungeon}. Parties of about level ${want} have managed it; yours is level ${partyLevel}. Fight on the surface, then see Lord British to level up (a bigger party also needs a higher level).`
          : `Your next stone lies deep underground: about level ${want} is wise, and yours is level ${partyLevel}. Fight on the surface, then see Lord British to level up.`
      })
    }
    const healing = (p.mixtures[2] ?? 0) + (p.mixtures[7] ?? 0)
    const light = p.torches + (p.mixtures[11] ?? 0)
    const fields = ['Deceit', 'Despise', 'Wrong'].includes(deep.d.dungeon) && (p.mixtures[3] ?? 0) === 0
    if (healing < 3 || light < 3 || (fields && full)) {
      const need = [healing < 3 && 'Cure and Heal mixtures', light < 3 && 'torches (or Light)', fields && full && 'Dispel for the energy fields'].filter(Boolean)
      out.push({ id: 'readiness-supplies', title: 'Stock up before the dungeon', detail: `Bring ${need.join(', ')}.` })
    }
  }

  const far = next.find(needsShip)
  if (far && !SHIP(p.transport) && p.transport !== BALLOON) {
    out.push({
      id: 'readiness-ship',
      title: 'You will need a ship',
      detail: full
        ? `${far.title} can't be reached on foot or by moongate. Ships aren't sold: win one from pirates along the coast.`
        : 'Your next goal can’t be reached on foot or by moongate.'
    })
  }
  return out.slice(0, 1)
}
