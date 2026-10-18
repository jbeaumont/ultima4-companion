// IPC for the AI sage. Answers stream back as sage:delta events, then sage:done.
import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/types'
import type { GameState } from '@shared/types'
import { loadJournal } from '../journal'
import { Sage, SAGE_MODEL } from './sage'
import { PERSONAS } from './prompt'
import type { Persona } from './prompt'

export interface SageStatus {
  model: string
  hasStoredKey: boolean
  envKey: boolean
}

export function setupSageIpc(keyFile: string, getState: () => GameState | null, send: (channel: string, payload: unknown) => void): void {
  const sage = new Sage(keyFile)

  ipcMain.handle(IPC.sageStatus, async (): Promise<SageStatus> => ({
    model: SAGE_MODEL,
    hasStoredKey: await sage.hasStoredKey(),
    envKey: !!process.env['ANTHROPIC_API_KEY']
  }))

  ipcMain.handle(IPC.sageAsk, async (_e, question: unknown, persona: unknown): Promise<string> => {
    const id = randomUUID()
    const p: Persona = typeof persona === 'string' && persona in PERSONAS ? (persona as Persona) : 'hawkwind'
    const level = (await loadJournal()).spoilerLevel
    void sage.ask(id, typeof question === 'string' ? question : '', p, level, getState(), {
      delta: (rid, text) => send(IPC.sageDelta, { id: rid, text }),
      done: (rid, result) => send(IPC.sageDone, { id: rid, ...result })
    })
    return id
  })

  ipcMain.handle(IPC.sageCancel, () => sage.cancel())
  ipcMain.handle(IPC.sageReset, () => sage.reset())
  ipcMain.handle(IPC.sageSetKey, async (_e, key: unknown) => {
    if (typeof key !== 'string') throw new Error('Invalid key')
    await sage.setKey(key)
  })
  ipcMain.handle(IPC.sageClearKey, () => sage.clearKey())
}
