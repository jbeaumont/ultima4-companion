// The opening of a game (#71): what a new Avatar does before the quest topics make
// sense. Each step is suggested from the save and the playthrough's journal, and
// drops away once done. Advice here is general play knowledge; companion towns
// follow the spoiler policy like the Dashboard's companion cards.
import type { PartySave } from '../parsers/party'
import { CLASSES } from './constants'
import { COMPANIONS, joinReadiness } from './companions'
import { lordBritishMaxHp } from './partyCondition'
import type { SpoilerLevel } from './hints'
import { disclosure } from './spoilers'

/** What the playthrough's journal knows: settlements visited and people talked to ("location|name"). */
export interface Knowledge {
  visited: readonly number[]
  met: readonly string[]
}

export interface OpeningStep {
  id: string
  title: string
  detail: string
}

const CASTLE = 1 // Lord British's castle
// classes with magic points to cast with (Fighter and Shepherd have none)
const CASTERS = new Set([0, 1, 3, 4, 5, 6])
const STARTING_WEAPON = 3 // Hands, Staff, Dagger, Sling
const STARTING_ARMOUR = 1 // Skin, Cloth
const GEAR_GOLD = 250

/** Opening steps still to do, most useful first. */
export function openingSteps(p: PartySave, level: SpoilerLevel, k: Knowledge): OpeningStep[] {
  const towns = disclosure(level).companionTowns
  const me = p.allRecords[0]
  if (!me) return []
  const out: OpeningStep[] = []

  const levelUp = p.members.some((m) => m.status !== 'D' && m.hpMax < lordBritishMaxHp(m.xp))
  if (!k.visited.includes(CASTLE)) {
    out.push({
      id: 'opening-lord-british',
      title: 'Visit Lord British',
      detail: 'His castle stands by Britain. He raises thy level once thou hast the experience, heals thee, and speaks of the quest.'
    })
  } else if (levelUp) {
    out.push({ id: 'opening-level-up', title: 'Level up with Lord British', detail: 'Thou hast the experience for a new level: ask him about thy health in his castle.' })
  }

  if (p.memberCount < 3) {
    const ready = COMPANIONS.map((c) => ({ c, r: joinReadiness(c, p) })).filter((x) => x.r.kind === 'ready')
    const needs = COMPANIONS.map((c) => joinReadiness(c, p)).find((r) => r.kind === 'needs')
    const first = ready[0]
    out.push({
      id: 'opening-companions',
      title: p.memberCount <= 1 ? 'Find companions' : 'Grow thy party',
      detail: first
        ? towns && first.r.kind === 'ready'
          ? `${first.c.name} the ${CLASSES[first.c.classIndex]} would join thee now, in ${first.r.town}: ask ${first.c.name} to join.`
          : 'A companion would join thee now. Seek them in the towns and ask them to join.'
        : needs?.kind === 'needs'
          ? `Companions join once thou art ready: ${needs.reasons.join(', ')}.`
          : 'Companions wait in the towns of the virtues; ask them to join.'
    })
  }

  const mixtures = p.mixtures.reduce((n, x) => n + x, 0)
  if (CASTERS.has(me.classIndex) && mixtures === 0) {
    out.push({
      id: 'opening-spells',
      title: 'Buy reagents and mix spells',
      detail: 'Spells are cast from mixtures: buy reagents at a herb shop, then Mix them (M) into Cure, Heal and other spells before thou needest them.'
    })
  }

  if (me.weapon <= STARTING_WEAPON && me.armor <= STARTING_ARMOUR && p.gold >= GEAR_GOLD) {
    out.push({ id: 'opening-gear', title: 'Better weapon and armour', detail: 'Thou hast the gold for an upgrade at a weapon or armour shop.' })
  }

  if (k.met.length < 3) {
    out.push({
      id: 'opening-talk',
      title: 'Talk to the townsfolk',
      detail: 'Ask people their NAME and JOB, then about the words they use. Quests, mantras and secrets are learned this way.'
    })
  }
  return out
}
