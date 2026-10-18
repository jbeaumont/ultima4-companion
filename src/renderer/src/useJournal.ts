import { useSyncExternalStore } from 'react'
import { emptyJournal, mergeMet, mergeVisited } from '@shared/journal'
import type { Journal } from '@shared/journal'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
interface Snap { journal: Journal | null; save: SaveState }

// One journal shared by every view (Journal, Hints, Dialogue): edits in one show up in the others.
let snap: Snap = { journal: null, save: 'idle' }
let started = false
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const set = (next: Partial<Snap>): void => {
  snap = { ...snap, ...next }
  listeners.forEach((l) => l())
}

function flush(): void {
  if (timer) clearTimeout(timer)
  timer = null
  if (!snap.journal) return
  set({ save: 'saving' })
  window.u4.saveJournal(snap.journal).then(() => !timer && set({ save: 'saved' }), () => set({ save: 'error' }))
}

/** Replace the journal (or derive it from the latest one) and save after `delay` ms. */
function update(next: Journal | ((j: Journal) => Journal), delay = 0): void {
  const cur = snap.journal ?? emptyJournal()
  set({ journal: typeof next === 'function' ? next(cur) : next, save: 'saving' })
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, delay)
}

const fromMain = (mine: Journal, main: Journal): Journal => ({
  ...mine,
  visited: mergeVisited(mine.visited, main.visited),
  met: mergeMet(mine.met, main.met)
})

function start(): void {
  if (started) return
  started = true
  window.u4.getJournal().then(
    (j) => set({ journal: snap.journal ? fromMain(snap.journal, j) : j }),
    () => set({ journal: snap.journal ?? emptyJournal() })
  )
  // main owns `visited` and `met`; take only those from its pushes so in-progress notes are never overwritten
  window.u4.onJournal((j) => {
    if (snap.journal) set({ journal: fromMain(snap.journal, j) })
  })
  window.addEventListener('pagehide', () => timer && flush())
}

const subscribe = (l: () => void): (() => void) => {
  start()
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useJournal() {
  const s = useSyncExternalStore(subscribe, () => snap)
  return { journal: s.journal, save: s.save, update }
}
