import { useEffect, useMemo, useState } from 'react'
import type { SnapshotMeta, SnapshotReason } from '../../../main/saves/snapshots'
import { ResultNote, outcomeOf } from '../components/ResultNote'
import type { Outcome } from '../components/ResultNote'

const REASONS: Record<SnapshotReason, string> = {
  auto: 'auto', manual: 'manual', 'pre-restore': 'before restore', 'pre-edit': 'before edit'
}

const when = (t: number) => new Date(t).toLocaleString()

function Row({ m, active, busy, outcome, onRestore, onDelete }: {
  m: SnapshotMeta
  active: string
  busy: boolean
  outcome: Outcome | undefined
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}) {
  const s = m.summary
  return (
    <li className="snap">
      <div className="snap-main">
        <div className="snap-head">
          <strong>{when(m.createdAt)}</strong>
          <span className={`reason r-${m.reason}`}>{REASONS[m.reason]}</span>
          {m.label && <span className="snap-label">{m.label}</span>}
          {m.playthrough && m.playthrough.id !== active && (
            <span className="snap-other" title="Taken while another playthrough was active">from {m.playthrough.name}</span>
          )}
        </div>
        <div className="muted small">
          {s ? `${s.names.join(', ')} · ${s.location} (${s.x},${s.y}) · ${s.moves} moves · ${s.avatarCount}/8 Avatarhoods` : 'No readable party data'}
        </div>
        <ResultNote o={outcome} />
      </div>
      <div className="snap-actions">
        <button className="btn small" disabled={busy} onClick={() => onRestore(m.id)}>Restore</button>
        <button className="btn small" disabled={busy} onClick={() => onDelete(m.id)}>Delete</button>
      </div>
    </li>
  )
}

export function Snapshots() {
  const [list, setList] = useState<SnapshotMeta[]>([])
  const [label, setLabel] = useState('')
  const [hideAuto, setHideAuto] = useState(false)
  const [mineOnly, setMineOnly] = useState(true)
  const [active, setActive] = useState('')
  const [busy, setBusy] = useState(false)
  const [takeNote, setTakeNote] = useState<Outcome | null>(null)
  const [rowNotes, setRowNotes] = useState<Record<string, Outcome>>({})

  useEffect(() => {
    let live = true
    window.u4.listSnapshots().then((l) => { if (live) setList(l) }, () => undefined)
    window.u4.listProfiles().then((p) => { if (live) setActive(p.active) }, () => undefined)
    const off = window.u4.onSnapshots(setList)
    return () => { live = false; off() }
  }, [])

  // snapshots from before playthroughs existed carry no tag and show everywhere
  const others = list.filter((m) => m.playthrough && m.playthrough.id !== active).length
  const shown = useMemo(
    () => list
      .filter((m) => !(hideAuto && m.reason === 'auto'))
      .filter((m) => !(mineOnly && m.playthrough && m.playthrough.id !== active))
      .sort((a, b) => b.createdAt - a.createdAt),
    [list, hideAuto, mineOnly, active]
  )

  const take = async () => {
    setBusy(true)
    try {
      const r = await window.u4.takeSnapshot(label.trim() || undefined)
      if (r.ok && r.value === null) setTakeNote({ kind: 'cancelled', text: 'Nothing to snapshot (no save found)' })
      else {
        setTakeNote(outcomeOf(r, 'Snapshot taken.'))
        if (r.ok) setLabel('')
      }
    } catch (err) {
      setTakeNote({ kind: 'error', text: `Failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, run: () => Promise<{ ok: true } | { ok: false; message: string }>, okText: string) => {
    setBusy(true)
    try {
      const o = outcomeOf(await run(), okText)
      setRowNotes((n) => ({ ...n, [id]: o }))
    } catch (err) {
      setRowNotes((n) => ({ ...n, [id]: { kind: 'error', text: `Failed: ${err instanceof Error ? err.message : String(err)}` } }))
    } finally {
      setBusy(false)
    }
  }

  const restore = (id: string) => {
    void act(id, () => window.u4.restoreSnapshot(id), 'Restored. Your previous save was backed up first (see "before restore"). Your notes, visits and explored map stay with this playthrough.')
  }
  const remove = (id: string) => { void act(id, () => window.u4.deleteSnapshot(id), 'Deleted.') }

  return (
    <>
      <h2>Snapshots</h2>
      <section className="panel">
        <p className="small">
          Ultima IV has a single save slot. The companion copies your save every time it changes. Restoring a snapshot
          backs up your current save first, so it can be undone. Restoring needs DOSBox to be closed, and you will be
          asked to confirm in a dialog. Each snapshot records the playthrough that was active; restoring another
          playthrough's save asks again, since this playthrough's journal and map stay loaded.
        </p>
        <form className="snap-take" onSubmit={(e) => { e.preventDefault(); void take() }}>
          <input
            className="search" placeholder="Label (optional)" value={label} maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>Take snapshot</button>
          <ResultNote o={takeNote} />
        </form>
      </section>
      <div className="toolbar snap-bar">
        <label>
          <input type="checkbox" checked={hideAuto} onChange={(e) => setHideAuto(e.target.checked)} /> Hide auto snapshots
        </label>
        {others > 0 && (
          <label>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> This playthrough only ({others} from others)
          </label>
        )}
        <span className="muted small">{shown.length} of {list.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{list.length === 0 ? 'No snapshots yet.' : 'None match the filters; untick them to see the rest.'}</p>
      ) : (
        <ul className="snaps">
          {shown.map((m) => (
            <Row key={m.id} m={m} active={active} busy={busy} outcome={rowNotes[m.id]} onRestore={restore} onDelete={remove} />
          ))}
        </ul>
      )}
    </>
  )
}
