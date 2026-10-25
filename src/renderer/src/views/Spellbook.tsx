// The spellbook (#79): every spell's recipe, cost and uses, with what the party can
// mix and cast now. Recipes the game's manual withholds follow the spoiler level.
import { useMemo, useState } from 'react'
import { REAGENTS } from '@domain/constants'
import { disclosure } from '@domain/spoilers'
import { SPELLBOOK, WHERE_TEXT, canMix, castersOf, placeOf, reagentsOf, recipeShown, worksIn } from '@domain/spells'
import type { Spell } from '@domain/spells'
import type { GameState } from '@shared/types'
import { useJournal } from '../useJournal'

type Filter = 'all' | 'castable' | 'mixtures' | 'here'
const FILTERS: [Filter, string][] = [['all', 'All'], ['castable', 'Can cast now'], ['mixtures', 'Have mixtures'], ['here', 'Works here']]
// staples worth keeping a few of
const STAPLES = new Set(['C', 'H', 'D'])

export function Spellbook({ state }: { state: GameState | null }) {
  const { journal } = useJournal()
  const [filter, setFilter] = useState<Filter>('all')
  const p = state?.party ?? null
  const level = journal?.spoilerLevel ?? 'off'
  const place = p ? placeOf(p, !!state?.battle) : null

  const rows = useMemo(() => SPELLBOOK.map((s, i) => {
    const mixtures = p?.mixtures[i] ?? 0
    const casters = p ? castersOf(p, s) : []
    return { s, mixtures, casters, more: p ? canMix(p, s) : 0, here: place ? worksIn(s, place) : true }
  }), [p, place])

  const shown = rows.filter((r) =>
    filter === 'castable' ? r.mixtures > 0 && r.casters.length > 0 && r.here
      : filter === 'mixtures' ? r.mixtures > 0
        : filter === 'here' ? r.here : true)

  const learned = (s: Spell): string =>
    disclosure(level).hintTiers >= 3 ? `Learned from ${s.learnedFrom}.`
      : disclosure(level).hintTiers >= 1 ? 'Not in the manual: some who study magic will share it, and one you must work out.'
        : 'Not in the manual: learned in play.'

  return (
    <>
      <h2>Spellbook</h2>
      <section className="panel spell-how small">
        <p>
          <strong>Mix</strong>: M, the spell letter, the reagent letters, then Enter. One of each reagent is enough: the game only checks
          which went in, so extra portions are wasted. <strong>Cast</strong>: C, the party member, the spell letter, then a target or direction.
          Casting uses one mixture and the caster's MP.
        </p>
        {p && (
          <p className="muted">
            Reagents: {REAGENTS.map((r, i) => `${r} ${p.reagents[i] ?? 0}`).join(' · ')}
            {place && <> · You are {place === 'combat' ? 'in combat' : place === 'dungeon' ? 'in a dungeon' : place === 'outdoors' ? 'outdoors' : 'in a town'}.</>}
          </p>
        )}
      </section>
      <div className="toolbar">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`btn small${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <span className="muted small">{shown.length} of {rows.length}</span>
      </div>
      <div className="spell-list">
        {shown.map(({ s, mixtures, casters, more, here }) => {
          const recipe = recipeShown(s, level, p)
          return (
            <article key={s.letter} className={`panel spell${here ? '' : ' spell-elsewhere'}`}>
              <header className="spell-head">
                <span className="spell-letter">{s.letter}</span>
                <strong>{s.name}</strong>
                <span className="spell-mp" title="Magic points to cast">{s.mp} MP</span>
                <span className={`spell-where${here ? '' : ' muted'}`}>{WHERE_TEXT[s.where]}</span>
              </header>
              <p className="small">{s.effect}</p>
              <div className="spell-recipe small">
                {recipe ? reagentsOf(s.mask).map((i) => (
                  <span key={i} className={`spell-reagent${p && (p.reagents[i] ?? 0) === 0 ? ' spell-reagent-missing' : ''}`}>{REAGENTS[i]}</span>
                )) : <span className="muted">{learned(s)}</span>}
              </div>
              {p && (
                <div className="spell-stock small">
                  <span className={mixtures === 0 ? 'muted' : STAPLES.has(s.letter) && mixtures < 3 ? 'warn' : ''}>
                    {mixtures} mixture{mixtures === 1 ? '' : 's'}{STAPLES.has(s.letter) && mixtures < 3 ? ' (low)' : ''}
                  </span>
                  {recipe && <span className="muted"> · reagents for {more} more</span>}
                  <span className="muted"> · {casters.length ? `can cast: ${casters.join(', ')}` : 'no one has the MP now'}</span>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}
