// IPC for snapshots and the save editor. Every write goes through writeSaveFiles
// (DOSBox closed, whitelist, backup first, atomic) and is preceded by a native
// confirmation dialog shown by the main process, so a renderer bug can't skip it.
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { readFile } from 'node:fs/promises'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { PartySave } from '@parsers/party'
import { encodePartySav, validateParty } from '@parsers/partyWriter'
import { describeChanges } from '@shared/saveDiff'
import { IPC } from '@shared/types'
import type { GameState } from '@shared/types'
import { findPids } from '../memory/win32'
import { loadSettings, saveSettings } from '../store'
import { WriteRefused, writeSaveFiles } from './safeWrite'
import { existsSync } from 'node:fs'
import type { SaveLocation } from '../saveLocation'
import { SnapshotStore, effectiveSavePaths } from './snapshots'
import type { SnapshotMeta } from './snapshots'

export type SavesResult<T = unknown> = { ok: true; value: T } | { ok: false; message: string; cancelled?: true }

const CANCELLED = { ok: false as const, message: 'Cancelled.', cancelled: true as const }

/** Minimal shape check of an edited save coming from the renderer. */
function isPartyShape(x: unknown): x is PartySave {
  const p = x as Partial<PartySave> | null
  const nums = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number')
  return !!p && typeof p === 'object' && Array.isArray(p.allRecords) && p.allRecords.length === 8 &&
    p.allRecords.every((r) => !!r && typeof r === 'object' && typeof r.name === 'string' && typeof r.status === 'string' && typeof r.hp === 'number') &&
    nums(p.karma, 8) && nums(p.reagents, 8) && nums(p.mixtures, 26) && nums(p.armorCounts, 8) && nums(p.weaponCounts, 16) &&
    typeof p.memberCount === 'number' && typeof p.gold === 'number' && typeof p.items === 'number'
}

const isGameRunning = async (): Promise<boolean> => (await findPids('dosbox.exe')).length > 0

async function confirm(e: IpcMainInvokeEvent, message: string, detail: string, action: string): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(e.sender)
  const opts = { type: 'warning' as const, buttons: [action, 'Cancel'], defaultId: 1, cancelId: 1, noLink: true, message, detail }
  const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  return r.response === 0
}

const fail = (err: unknown): SavesResult<never> => ({
  ok: false,
  message: err instanceof WriteRefused ? err.message : `Failed: ${err instanceof Error ? err.message : String(err)}`
})

export interface SavesContext {
  loc: SaveLocation | null
  /** Real and test saves keep separate snapshot stores. */
  store: SnapshotStore
  testRoot: string
}

export function setupSavesIpc(ctx: () => SavesContext, send: (channel: string, payload: unknown) => void): {
  autoSnapshot: (state: GameState) => void
} {
  const changed = async () => send(IPC.snapshotsChanged, await ctx().store.list())
  const getGameDir = () => ctx().loc?.gameDir ?? null
  const overlay = () => ctx().loc?.overlayDir
  const deps = () => ({ isGameRunning, snapshots: ctx().store, testRoot: ctx().testRoot })

  // one auto snapshot at a time; identical saves are skipped by the store
  let chain: Promise<unknown> = Promise.resolve()
  const autoSnapshot = (state: GameState): void => {
    const dir = getGameDir()
    if (state.status !== 'ok' || !dir) return
    chain = chain.then(async () => {
      if (await ctx().store.take(dir, 'auto', undefined, new Date(), overlay())) await changed()
    }).catch(() => undefined)
  }

  ipcMain.handle(IPC.snapshotsList, () => ctx().store.list())

  ipcMain.handle(IPC.snapshotsTake, async (_e, label: unknown): Promise<SavesResult<SnapshotMeta | null>> => {
    const dir = getGameDir()
    if (!dir) return { ok: false, message: 'Ultima IV install not found.' }
    try {
      const meta = await ctx().store.take(dir, 'manual', typeof label === 'string' ? label : undefined, new Date(), overlay())
      await changed()
      return { ok: true, value: meta }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.snapshotsRestore, async (e, id: unknown): Promise<SavesResult<SnapshotMeta | null>> => {
    try {
      if (typeof id !== 'string') throw new WriteRefused('Invalid snapshot id.')
      if (await isGameRunning()) throw new WriteRefused('Close DOSBox first: the game must not be running while its save is changed.')
      const { meta, files } = await ctx().store.read(id)
      const s = meta.summary
      const detail = `${new Date(meta.createdAt).toLocaleString()}${s ? `\n${s.names.join(', ')} · ${s.location} (${s.x},${s.y}) · ${s.moves} moves · ${s.avatarCount}/8 Avatarhoods` : ''}\n\nYour current save is backed up first, so this can be undone.`
      if (!(await confirm(e, 'Restore this snapshot over your current save?', detail, 'Restore'))) return CANCELLED
      const { backup } = await writeSaveFiles(ctx().loc, files, 'pre-restore', deps())
      await changed()
      return { ok: true, value: backup }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.snapshotsDelete, async (e, id: unknown): Promise<SavesResult<null>> => {
    try {
      if (typeof id !== 'string') throw new WriteRefused('Invalid snapshot id.')
      if (!(await confirm(e, 'Delete this snapshot?', 'This only removes the companion\'s backup copy, never your game save.', 'Delete'))) return CANCELLED
      await ctx().store.remove(id)
      await changed()
      return { ok: true, value: null }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.setEditorEnabled, (_e, on: unknown) => {
    saveSettings({ editorEnabled: on === true })
    return on === true
  })

  /** The save as it is on disk (not live memory): that is what an edit replaces. */
  ipcMain.handle(IPC.editorLoad, async (): Promise<SavesResult<{ party: PartySave; path: string; gameRunning: boolean }>> => {
    const dir = getGameDir()
    const path = dir ? effectiveSavePaths(dir, existsSync, overlay())['PARTY.SAV'] : undefined
    if (!path) return { ok: false, message: 'No PARTY.SAV found.' }
    try {
      return { ok: true, value: { party: parsePartySav(new Uint8Array(await readFile(path))), path, gameRunning: await isGameRunning() } }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.editorApply, async (e, edited: unknown): Promise<SavesResult<SnapshotMeta | null>> => {
    try {
      if (!loadSettings().editorEnabled) throw new WriteRefused('The save editor is turned off in Settings.')
      if (await isGameRunning()) throw new WriteRefused('Close DOSBox first: the game must not be running while its save is changed.')
      const dir = getGameDir()
      const path = dir ? effectiveSavePaths(dir, existsSync, overlay())['PARTY.SAV'] : undefined
      if (!path) throw new WriteRefused('No PARTY.SAV found.')
      const base = new Uint8Array(await readFile(path))
      if (base.length < PARTY_SAV_SIZE) throw new WriteRefused('The current PARTY.SAV is incomplete.')
      const before = parsePartySav(base)
      if (!isPartyShape(edited)) throw new WriteRefused('The edited save is malformed; nothing was written.')
      const next = edited
      const issues = validateParty(next)
      if (issues.length) throw new WriteRefused(`Invalid values: ${issues.slice(0, 5).map((i) => `${i.field} ${i.message}`).join('; ')}`)
      const bytes = encodePartySav(next, base)
      const after = parsePartySav(bytes) // what will actually be written
      const changes = describeChanges(before, after)
      if (!changes.length) throw new WriteRefused('No changes to write.')
      const detail = `${changes.slice(0, 20).join('\n')}${changes.length > 20 ? `\n…and ${changes.length - 20} more` : ''}\n\nYour current save is backed up first, so this can be undone from Snapshots.`
      if (!(await confirm(e, `Write ${changes.length} change${changes.length === 1 ? '' : 's'} to PARTY.SAV?`, detail, 'Write save'))) return CANCELLED
      const { backup } = await writeSaveFiles(ctx().loc, { 'PARTY.SAV': bytes }, 'pre-edit', deps())
      await changed()
      return { ok: true, value: backup }
    } catch (err) {
      return fail(err)
    }
  })

  return { autoSnapshot }
}
