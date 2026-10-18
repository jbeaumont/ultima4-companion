// IPC for the optional AI sage. Answers stream back as sage:delta events, then
// sage:done. The sage is off by default: until it is enabled in Settings, the
// Anthropic SDK is never loaded and every request is refused.
import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/types'
import type { GameState } from '@shared/types'
import { loadJournal } from '../journal'
import { loadSettings, saveSettings } from '../store'
import { PERSONAS, SAGE_MODEL } from './prompt'
import type { Persona } from './prompt'
import type { Sage } from './sage'

export interface SageStatus {
  enabled: boolean
  model: string
  hasStoredKey: boolean
  envKey: boolean
}

const OFF = 'The AI sage is turned off. Enable it in Settings.'

export function setupSageIpc(keyFile: string, getState: () => GameState | null, send: (channel: string, payload: unknown) => void): void {
  let sage: Sage | null = null
  const enabled = () => loadSettings().sageEnabled === true
  // loaded on first use, so the SDK stays out of the app unless the sage is used
  const getSage = async (): Promise<Sage> => (sage ??= new (await import('./sage')).Sage(keyFile))

  ipcMain.handle(IPC.setSageEnabled, (_e, on: unknown) => {
    saveSettings({ sageEnabled: on === true })
    if (on !== true) sage?.reset()
    return on === true
  })

  ipcMain.handle(IPC.sageStatus, async (): Promise<SageStatus> => ({
    enabled: enabled(),
    model: SAGE_MODEL,
    hasStoredKey: enabled() ? await (await getSage()).hasStoredKey() : false,
    envKey: !!process.env['ANTHROPIC_API_KEY']
  }))

  ipcMain.handle(IPC.sageAsk, async (_e, question: unknown, persona: unknown): Promise<string> => {
    const id = randomUUID()
    const done = (rid: string, result: object) => send(IPC.sageDone, { id: rid, ...result })
    if (!enabled()) {
      setTimeout(() => done(id, { ok: false, message: OFF }), 0)
      return id
    }
    const p: Persona = typeof persona === 'string' && persona in PERSONAS ? (persona as Persona) : 'hawkwind'
    const level = (await loadJournal()).spoilerLevel
    void (await getSage()).ask(id, typeof question === 'string' ? question : '', p, level, getState(), {
      delta: (rid, text) => send(IPC.sageDelta, { id: rid, text }),
      done
    })
    return id
  })

  ipcMain.handle(IPC.sageCancel, () => sage?.cancel())
  ipcMain.handle(IPC.sageReset, () => sage?.reset())
  ipcMain.handle(IPC.sageSetKey, async (_e, key: unknown) => {
    if (!enabled()) throw new Error(OFF)
    if (typeof key !== 'string') throw new Error('Invalid key')
    await (await getSage()).setKey(key)
  })
  ipcMain.handle(IPC.sageClearKey, async () => (await getSage()).clearKey())
}
