// The AI sage: a streamed, spoiler-aware Claude conversation that runs in the
// main process (the API key never reaches the renderer).
import Anthropic from '@anthropic-ai/sdk'
import { safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import type { SpoilerLevel } from '@domain/hints'
import type { GameState } from '@shared/types'
import { SageConversation } from './conversation'
import type { SageEvents } from './conversation'
import type { Persona } from './prompt'

export type { SageEvents } from './conversation'

export class Sage {
  private readonly conversation = new SageConversation(async (request) => (await this.client()).beta.messages.stream(request))

  constructor(private readonly keyFile: string) {}

  // --- API key: optional; otherwise the SDK uses ANTHROPIC_API_KEY or an `ant auth login` profile ---
  async hasStoredKey(): Promise<boolean> {
    try {
      await readFile(this.keyFile)
      return true
    } catch {
      return false
    }
  }

  async setKey(key: string): Promise<void> {
    const k = key.trim()
    if (!k) throw new Error('Empty key')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system')
    await writeFile(this.keyFile, safeStorage.encryptString(k))
  }

  async clearKey(): Promise<void> {
    await rm(this.keyFile, { force: true })
  }

  private async client(): Promise<Anthropic> {
    try {
      const key = safeStorage.decryptString(await readFile(this.keyFile))
      return new Anthropic({ apiKey: key })
    } catch {
      return new Anthropic() // environment / ant profile
    }
  }

  reset(): void {
    this.conversation.reset()
  }

  cancel(): void {
    this.conversation.cancel()
  }

  /** Ask a question; streams deltas and resolves when done. One request at a time. */
  ask(id: string, question: string, persona: Persona, level: SpoilerLevel, state: GameState | null, on: SageEvents): Promise<void> {
    return this.conversation.ask(id, question, persona, level, state, on)
  }
}
