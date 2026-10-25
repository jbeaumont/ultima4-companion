// The fortune teller at character creation (#68): shown while the game's title
// program asks its questions. Pick a class and the companion says which card to
// choose, or answers for you. "Answer honestly" (the default) gives no advice.
import { useEffect, useState } from 'react'
import { CLASSES, VIRTUES } from '@domain/constants'
import { outcomeOf, pickCard } from '@shared/fortune'
import type { FortuneUpdate } from '../../../main/fortune'

export function FortunePanel() {
  const [u, setU] = useState<FortuneUpdate | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    window.u4.getFortune().then((x) => { if (live) setU(x) }, () => undefined)
    const off = window.u4.onFortune(setU)
    return () => { live = false; off() }
  }, [])
  // keep the picker in step with "answer for me" set elsewhere (or by a script)
  useEffect(() => { if (u?.auto !== null && u?.auto !== undefined) setTarget(u.auto) }, [u?.auto])

  const s = u?.state
  if (!s) return null
  const auto = u?.auto ?? null
  const choose = (t: number | null): void => {
    setTarget(t)
    if (auto !== null) void window.u4.setFortuneAuto(t).then(setU) // keep answering for the new choice, or stop
  }
  const card = s.cards && target !== null ? pickCard(target, s.cards.a, s.cards.b) : null
  const o = target !== null ? outcomeOf(target) : null

  return (
    <section className="panel fortune">
      <h3>The fortune teller</h3>
      <p className="small">
        {s.question < 7 ? `Question ${s.question + 1} of 7.` : 'All seven questions answered.'} Her answers decide your class: the virtue
        you favour to the end becomes your calling. Choosing a class below gives away how the cards work.
      </p>
      <div className="fortune-classes">
        <button className={`btn small${target === null ? ' active' : ''}`} onClick={() => choose(null)}>Answer honestly</button>
        {CLASSES.map((c, i) => (
          <button key={c} className={`btn small${target === i ? ' active' : ''}`} disabled={s.out.includes(i)} title={s.out.includes(i) ? `${VIRTUES[i]} is out: this class can no longer be chosen` : `${VIRTUES[i]} · starts in ${outcomeOf(i).town} at level ${outcomeOf(i).level}`} onClick={() => choose(i)}>
            {c}
          </button>
        ))}
      </div>
      {o && (
        <p className="small muted">{o.cls}: the virtue of {o.virtue}. You start in {o.town} at level {o.level}. Pick {o.virtue} whenever it is offered and it cannot lose.</p>
      )}
      {s.cards && (
        <p className="fortune-cards">
          Cards: <strong>A</strong> {VIRTUES[s.cards.a]} · <strong>B</strong> {VIRTUES[s.cards.b]}
          {card && <> → press <strong>{card}</strong> ({VIRTUES[card === 'A' ? s.cards.a : s.cards.b]})</>}
        </p>
      )}
      {target !== null && (
        <label className="small fortune-auto">
          <input type="checkbox" checked={auto !== null} onChange={(e) => void window.u4.setFortuneAuto(e.target.checked ? target : null).then(setU)} />
          {' '}Answer for me: the companion presses Space and the card key in the game (DOSBox comes to the front)
        </label>
      )}
      {u?.error && <p className="result small error">{u.error}</p>}
    </section>
  )
}
