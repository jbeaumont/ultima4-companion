// Alerts about the party's health for the Dashboard: who is dead, poisoned,
// asleep or badly hurt, and what can fix it with what the party carries.
import type { PartySave } from '../parsers/party'
import { SPELLS } from './constants'

export type AlertLevel = 'warn' | 'bad'

export interface PartyAlert {
  level: AlertLevel
  text: string
  /** What to do about it. */
  hint: string
}

const mixture = (p: PartySave, spell: string) => p.mixtures[SPELLS.indexOf(spell as (typeof SPELLS)[number])] ?? 0

/** Health alerts, most serious first. Low HP is below a third (bad below a fifth). */
export function partyAlerts(p: PartySave): PartyAlert[] {
  const out: PartyAlert[] = []
  const cure = mixture(p, 'Cure')
  const heal = mixture(p, 'Heal')
  for (const m of p.members) {
    if (m.status === 'D') {
      out.push({ level: 'bad', text: `${m.name} is dead`, hint: 'A healer in town can resurrect them' })
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
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1))
}
