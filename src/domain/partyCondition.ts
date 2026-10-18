// Alerts about the party's health for the Dashboard: who is dead, poisoned,
// asleep or badly hurt, and what can fix it with what the party carries.
import type { PartySave } from '../parsers/party'
import { SPELLS } from './constants'

export type AlertLevel = 'good' | 'warn' | 'bad'

export interface PartyAlert {
  level: AlertLevel
  text: string
  /** What to do about it. */
  hint: string
}

const mixture = (p: PartySave, spell: string) => p.mixtures[SPELLS.indexOf(spell as (typeof SPELLS)[number])] ?? 0

/**
 * Max HP Lord British would grant for this much experience (U4_LB.C C_E4C3):
 * 100 per level, level 2 at 100 XP and each further level at double the XP.
 */
export function lordBritishMaxHp(xp: number): number {
  let hp = 100
  for (let need = 100; need <= xp; need <<= 1) hp += 100
  return hp
}

/** Warn when food would last fewer moves than this. */
export const FOOD_WARN_MOVES = 300

/** Health alerts, most serious first. Low HP is below a third (bad below a fifth). */
export function partyAlerts(p: PartySave): PartyAlert[] {
  const out: PartyAlert[] = []
  const cure = mixture(p, 'Cure')
  const heal = mixture(p, 'Heal')
  for (const [i, m] of p.members.entries()) {
    if (m.status === 'D') {
      // Lord British revives the Avatar when spoken to (U4_LB.C); healers resurrect anyone
      out.push({ level: 'bad', text: `${m.name} is dead`, hint: i === 0 ? 'Lord British or a healer can revive them' : 'A healer in town can resurrect them' })
      continue
    }
    if (m.status === 'P') {
      out.push({
        level: 'warn',
        text: `${m.name} is poisoned`,
        hint: cure ? `Cast Cure (${cure} mixed)` : 'Visit a healer, or mix Cure: Ginseng + Garlic'
      })
    }
    if (m.status === 'S') out.push({ level: 'warn', text: `${m.name} is asleep`, hint: 'They wake in time, or cast Awaken' })
    if (m.hpMax > 0 && m.hp * 3 < m.hpMax) {
      out.push({
        level: m.hp * 5 < m.hpMax ? 'bad' : 'warn',
        text: `${m.name} ${m.hp}/${m.hpMax} HP`,
        hint: heal ? `Cast Heal (${heal} mixed)` : 'Visit a healer, or mix Heal: Ginseng + Spider Silk'
      })
    }
  }
  // food is kept in hundredths and each turn eats one per member (U4_UTIL.C food_dec)
  const movesOfFood = Math.floor(p.food / Math.max(1, p.memberCount))
  if (p.food <= 0) {
    out.push({ level: 'bad', text: 'Starving!', hint: 'Every member loses 2 HP a turn: buy food at a market or inn' })
  } else if (movesOfFood < FOOD_WARN_MOVES) {
    out.push({ level: 'warn', text: `Food for ${movesOfFood} moves`, hint: 'Buy food at a market or inn before it runs out' })
  }
  for (const m of p.members) {
    const hp = lordBritishMaxHp(m.xp)
    if (m.status !== 'D' && m.hpMax < hp) {
      out.push({ level: 'good', text: `${m.name} can reach level ${hp / 100}`, hint: 'Visit Lord British: he raises thy level and restores thy health' })
    }
  }
  const rank = { bad: 0, warn: 1, good: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
