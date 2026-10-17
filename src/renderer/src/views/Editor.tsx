import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PartySave } from '@parsers/party'
import { LIMITS, validateParty } from '@parsers/partyWriter'
import { ARMOR, CLASSES, ITEM_FLAGS, REAGENTS, RUNES, SPELLS, STONES, VIRTUES, WEAPONS } from '@domain/constants'
import type { ItemName } from '@domain/constants'
import {
  cheats, foodToText, hasBit, isEdited, issueFor, patchList, patchMember, setBit, textToFood, textToInt
} from '@shared/editorForm'
import { ResultNote, outcomeOf } from '../components/ResultNote'
import type { Outcome } from '../components/ResultNote'

type Issues = { field: string; message: string }[]

const ITEM_LABELS: Record<ItemName, string> = {
  skull: 'Skull of Mondain', skullDestroyed: 'Skull destroyed', candle: 'Candle', book: 'Book',
  bell: 'Bell', keyC: 'Key of Courage', keyL: 'Key of Love', keyT: 'Key of Truth',
  horn: 'Horn', wheel: 'Wheel', candleUsed: 'Candle used', bookUsed: 'Book used', bellUsed: 'Bell used'
}

function Field({ label, issues, field, children }: { label: string; issues: Issues; field: string; children: React.ReactNode }) {
  const msg = issueFor(issues, field)
  return (
    <label className={`field${msg ? ' invalid' : ''}`}>
      <span>{label}</span>
      {children}
      {msg && <em className="bad small">{msg}</em>}
    </label>
  )
}

function Num({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" min={0} max={max} step={1} value={Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(textToInt(e.target.value))}
    />
  )
}

/** Food is typed as the game shows it (food/100); keep the raw text so "1." survives typing. */
function FoodInput({ food, onChange }: { food: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(foodToText(food))
  useEffect(() => {
    setText((t) => (textToFood(t) === food || (Number.isNaN(textToFood(t)) && Number.isNaN(food)) ? t : foodToText(food)))
  }, [food])
  return (
    <input
      type="number" min={0} max={LIMITS.food / 100} step={0.01} value={text}
      onChange={(e) => { setText(e.target.value); onChange(textToFood(e.target.value)) }}
    />
  )
}

export function Editor({ onNavigate }: { onNavigate: (v: 'Settings') => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [orig, setOrig] = useState<PartySave | null>(null)
  const [form, setForm] = useState<PartySave | null>(null)
  const [path, setPath] = useState('')
  const [running, setRunning] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Outcome | null>(null)

  const load = useCallback(async (keepNote = false) => {
    if (!keepNote) setNote(null)
    try {
      const r = await window.u4.loadEditor()
      if (r.ok) {
        setOrig(r.value.party)
        setForm(r.value.party)
        setPath(r.value.path)
        setRunning(r.value.gameRunning)
        setLoadError(null)
      } else {
        setLoadError(r.message)
      }
    } catch (err) {
      setLoadError(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => {
    let live = true
    window.u4.getSettings().then((s) => {
      if (!live) return
      setEnabled(s.editorEnabled)
      if (s.editorEnabled) void load()
    }, () => { if (live) setEnabled(false) })
    return () => { live = false }
  }, [load])

  // DOSBox may start or stop while the view is open; keep the banner honest
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => {
      window.u4.loadEditor().then((r) => { if (r.ok) setRunning(r.value.gameRunning) }, () => undefined)
    }, 3000)
    return () => clearInterval(t)
  }, [enabled])

  const issues = useMemo(() => (form ? validateParty(form) : []), [form])
  const edited = !!form && !!orig && isEdited(orig, form)

  if (enabled === null) return <><h2>Editor</h2><p className="muted">Loading…</p></>
  if (!enabled) {
    return (
      <>
        <h2>Editor</h2>
        <section className="panel">
          <p>The save editor is turned off.</p>
          <p className="muted small">
            When enabled, it lets you change party stats, supplies, karma and collections in your real PARTY.SAV.
            A backup is always taken first and DOSBox must be closed. Enable it in Settings.
          </p>
          <button className="btn" onClick={() => onNavigate('Settings')}>Go to Settings</button>
        </section>
      </>
    )
  }
  if (!form || !orig) {
    return (
      <>
        <h2>Editor</h2>
        {loadError ? <p className="bad" role="alert">{loadError}</p> : <p className="muted">Loading…</p>}
        {loadError && <button className="btn" onClick={() => void load()}>Retry</button>}
      </>
    )
  }

  const set = (patch: Partial<PartySave>) => { setForm((f) => (f ? { ...f, ...patch } : f)); setNote(null) }
  const member = (i: number, patch: Parameters<typeof patchMember>[2]) => { setForm((f) => (f ? patchMember(f, i, patch) : f)); setNote(null) }
  const cheat = (fn: (p: PartySave) => PartySave) => { setForm((f) => (f ? fn(f) : f)); setNote(null) }

  const write = async () => {
    setBusy(true)
    setNote(null)
    try {
      const r = await window.u4.applyEdit(form)
      const o = outcomeOf(r, r.ok ? (r.value ? `Saved, backup ${r.value.id} created` : 'Saved') : '')
      setNote(o)
      if (r.ok) await load(true)
    } catch (err) {
      setNote({ kind: 'error', text: `Failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  const count = Math.max(1, form.memberCount)
  const canWrite = !busy && edited && issues.length === 0

  return (
    <>
      <h2>Editor</h2>
      {running && (
        <div className="banner warn" role="alert">
          Close DOSBox before writing; your edits won't be saved while the game runs.
        </div>
      )}
      <p className="muted small">
        Editing the save file on disk (not live memory): <span className="path">{path}</span>
      </p>
      <p className="note">
        Writing replaces your real save. A backup is taken first (restorable from Snapshots) and you confirm in a dialog.
      </p>

      <div className="toolbar editor-bar">
        <span className="muted small">Quick cheats (edit the form only):</span>
        <button className="btn small" onClick={() => cheat(cheats.heal)}>Heal party</button>
        <button className="btn small" onClick={() => cheat(cheats.cure)}>Cure party</button>
        <button className="btn small" onClick={() => cheat(cheats.maxGold)}>Max gold</button>
        <button className="btn small" onClick={() => cheat(cheats.allReagents)}>99 reagents</button>
        <button className="btn small" onClick={() => cheat(cheats.allRunes)}>All runes</button>
        <button className="btn small" onClick={() => cheat(cheats.allStones)}>All stones</button>
      </div>

      <section className="panel">
        <h3>Party members</h3>
        <div className="cards">
          {form.allRecords.slice(0, count).map((m, i) => {
            const p = `members[${i}]`
            return (
              <div className="card editor-card" key={i}>
                <div className="form-grid">
                  <Field label="Name" issues={issues} field={`${p}.name`}>
                    <input type="text" maxLength={15} value={m.name} onChange={(e) => member(i, { name: e.target.value })} />
                  </Field>
                  <Field label="Class" issues={issues} field={`${p}.classIndex`}>
                    <select value={m.classIndex} onChange={(e) => member(i, { classIndex: Number(e.target.value) })}>
                      {CLASSES.map((c, ci) => <option key={c} value={ci}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Sex" issues={issues} field={`${p}.sex`}>
                    <select value={m.sex} onChange={(e) => member(i, { sex: e.target.value as typeof m.sex })}>
                      {m.sex === 'unknown' && <option value="unknown">unknown</option>}
                      <option value="male">male</option>
                      <option value="female">female</option>
                    </select>
                  </Field>
                  <Field label="Status" issues={issues} field={`${p}.status`}>
                    <select value={m.status} onChange={(e) => member(i, { status: e.target.value })}>
                      <option value="G">Good</option>
                      <option value="P">Poisoned</option>
                      <option value="S">Sleeping</option>
                      <option value="D">Dead</option>
                    </select>
                  </Field>
                  <Field label="HP" issues={issues} field={`${p}.hp`}><Num value={m.hp} max={m.hpMax} onChange={(v) => member(i, { hp: v })} /></Field>
                  <Field label="HP max" issues={issues} field={`${p}.hpMax`}><Num value={m.hpMax} max={LIMITS.hp} onChange={(v) => member(i, { hpMax: v })} /></Field>
                  <Field label="XP" issues={issues} field={`${p}.xp`}><Num value={m.xp} max={LIMITS.xp} onChange={(v) => member(i, { xp: v })} /></Field>
                  <Field label="STR" issues={issues} field={`${p}.str`}><Num value={m.str} max={LIMITS.stat} onChange={(v) => member(i, { str: v })} /></Field>
                  <Field label="DEX" issues={issues} field={`${p}.dex`}><Num value={m.dex} max={LIMITS.stat} onChange={(v) => member(i, { dex: v })} /></Field>
                  <Field label="INT" issues={issues} field={`${p}.int`}><Num value={m.int} max={LIMITS.stat} onChange={(v) => member(i, { int: v })} /></Field>
                  <Field label="MP" issues={issues} field={`${p}.mp`}><Num value={m.mp} max={LIMITS.mp} onChange={(v) => member(i, { mp: v })} /></Field>
                  <Field label="Weapon" issues={issues} field={`${p}.weapon`}>
                    <select value={m.weapon} onChange={(e) => member(i, { weapon: Number(e.target.value) })}>
                      {WEAPONS.map((w, wi) => <option key={w} value={wi}>{w}</option>)}
                    </select>
                  </Field>
                  <Field label="Armor" issues={issues} field={`${p}.armor`}>
                    <select value={m.armor} onChange={(e) => member(i, { armor: Number(e.target.value) })}>
                      {ARMOR.map((a, ai) => <option key={a} value={ai}>{a}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <h3>Supplies</h3>
        <div className="form-grid">
          <Field label="Gold" issues={issues} field="gold"><Num value={form.gold} max={LIMITS.gold} onChange={(v) => set({ gold: v })} /></Field>
          <Field label="Food" issues={issues} field="food"><FoodInput food={form.food} onChange={(v) => set({ food: v })} /></Field>
          <Field label="Torches" issues={issues} field="torches"><Num value={form.torches} max={LIMITS.count} onChange={(v) => set({ torches: v })} /></Field>
          <Field label="Gems" issues={issues} field="gems"><Num value={form.gems} max={LIMITS.count} onChange={(v) => set({ gems: v })} /></Field>
          <Field label="Keys" issues={issues} field="keys"><Num value={form.keys} max={LIMITS.count} onChange={(v) => set({ keys: v })} /></Field>
          <Field label="Sextants" issues={issues} field="sextants"><Num value={form.sextants} max={LIMITS.count} onChange={(v) => set({ sextants: v })} /></Field>
        </div>
        <p className="muted small">Food is shown as the game shows it; it is stored in hundredths.</p>
      </section>

      <section className="panel">
        <h3>Karma</h3>
        <div className="form-grid">
          {VIRTUES.map((v, i) => (
            <Field key={v} label={v} issues={issues} field={`karma[${i}]`}>
              <Num value={form.karma[i] ?? 0} max={LIMITS.karma} onChange={(n) => set({ karma: patchList(form.karma, i, n) })} />
            </Field>
          ))}
        </div>
        <p className="muted small">0 to 99. A karma of 0 means partial Avatarhood.</p>
      </section>

      <section className="panel">
        <h3>Runes, stones and quest items</h3>
        <h4>Runes</h4>
        <div className="checks">
          {RUNES.map((r, i) => (
            <label className="check" key={r}>
              <input type="checkbox" checked={hasBit(form.runes, 1 << i)} onChange={(e) => set({ runes: setBit(form.runes, 1 << i, e.target.checked) })} /> {r}
            </label>
          ))}
        </div>
        <h4>Stones</h4>
        <div className="checks">
          {STONES.map((s, i) => (
            <label className="check" key={s}>
              <input type="checkbox" checked={hasBit(form.stones, 1 << i)} onChange={(e) => set({ stones: setBit(form.stones, 1 << i, e.target.checked) })} /> {s}
            </label>
          ))}
        </div>
        <h4>Quest items</h4>
        <div className="checks">
          {(Object.keys(ITEM_FLAGS) as ItemName[]).map((k) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={hasBit(form.items, ITEM_FLAGS[k])} onChange={(e) => set({ items: setBit(form.items, ITEM_FLAGS[k], e.target.checked) })} /> {ITEM_LABELS[k]}
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Reagents</h3>
        <div className="form-grid">
          {REAGENTS.map((n, i) => (
            <Field key={n} label={n} issues={issues} field={`reagents[${i}]`}>
              <Num value={form.reagents[i] ?? 0} max={LIMITS.count} onChange={(v) => set({ reagents: patchList(form.reagents, i, v) })} />
            </Field>
          ))}
        </div>
        <h3 className="gap">Mixtures</h3>
        <div className="form-grid">
          {SPELLS.map((n, i) => (
            <Field key={n} label={n} issues={issues} field={`mixtures[${i}]`}>
              <Num value={form.mixtures[i] ?? 0} max={LIMITS.count} onChange={(v) => set({ mixtures: patchList(form.mixtures, i, v) })} />
            </Field>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Position</h3>
        <p className="muted small">
          Read-only: editing the position can trap the party. Currently location {form.location}, ({form.x},{form.y}), {form.moves} moves.
        </p>
      </section>

      <div className="editor-foot">
        {issues.length > 0 && (
          <ul className="bad small issue-list">
            {issues.slice(0, 5).map((i) => <li key={i.field}>{i.field}: {i.message}</li>)}
            {issues.length > 5 && <li>…and {issues.length - 5} more</li>}
          </ul>
        )}
        <div className="foot-actions">
          <button className="btn" disabled={busy || !edited} onClick={() => void load()}>Revert</button>
          <button className="btn primary" disabled={!canWrite} onClick={() => void write()}>Write save</button>
          {!edited && <span className="muted small">No changes yet.</span>}
          <ResultNote o={note} />
        </div>
      </div>
    </>
  )
}
