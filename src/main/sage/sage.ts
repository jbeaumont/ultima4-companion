// The AI sage: a streamed, spoiler-aware Claude conversation that runs in the
// main process (the API key never reaches the renderer).
import Anthropic from '@anthropic-ai/sdk'
import { safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import type { SpoilerLevel } from '@domain/hints'
import type { GameState } from '@shared/types'
import { buildStateMessage, buildSystemPrompt } from './prompt'
import type { Persona } from './prompt'

export const SAGE_MODEL = 'claude-opus-5-5'
const BETAS = ['server-side-fallback-2026-07-01', 'mid-conversation-system-clear-at-2026-08-21']

export interface SageEvents {
  delta: (id: string, text: string) => void
  done: (id: string, result: { ok: true; stopReason: string | null; servedBy: string } | { ok: false; message: string }) => void
}

export class Sage {
  private history: Anthropic.Beta.BetaMessageParam[] = []
  private persona: Persona = 'hawkwind'
  private level: SpoilerLevel = 'nudges'
  private current: { id: string; abort: () => void } | null = null

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
    this.current?.abort()
    this.history = []
  }

  cancel(): void {
    this.current?.abort()
  }

  /** Ask a question; streams deltas and resolves when done. One request at a time. */
  async ask(id: string, question: string, persona: Persona, level: SpoilerLevel, state: GameState | null, on: SageEvents): Promise<void> {
    if (this.current) return on.done(id, { ok: false, message: 'The sage is still answering.' })
    const text = question.trim().slice(0, 4000)
    if (!text) return on.done(id, { ok: false, message: 'Ask something first.' })
    // a different persona or spoiler level is a different conversation (different system prompt)
    if (persona !== this.persona || level !== this.level) {
      this.history = []
      this.persona = persona
      this.level = level
    }

    const turn: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: text },
      // per-turn state: shown for this turn only, kept in history unchanged (append-only)
      { role: 'system', content: buildStateMessage(state?.party ?? null, state?.source ?? null, level), clear_at: 'next_user_message' }
    ]

    try {
      const client = await this.client()
      const stream = client.beta.messages.stream({
        model: SAGE_MODEL,
        max_tokens: 64000,
        betas: BETAS,
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: buildSystemPrompt(persona, level), cache_control: { type: 'ephemeral' } }],
        messages: [...this.history, ...turn]
      })
      this.current = { id, abort: () => stream.abort() }
      stream.on('text', (delta) => on.delta(id, delta))
      const message = await stream.finalMessage()

      if (message.stop_reason === 'refusal') {
        // nothing appended: the declined turn is dropped so the conversation stays clean
        return on.done(id, { ok: false, message: 'The sage will not answer that. Try asking another way.' })
      }
      // append the full content (thinking blocks included, unchanged) to keep the history valid
      this.history.push(...turn, { role: 'assistant', content: message.content })
      on.done(id, { ok: true, stopReason: message.stop_reason, servedBy: message.model })
    } catch (err) {
      on.done(id, { ok: false, message: describeError(err) })
    } finally {
      this.current = null
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.'
  if (err instanceof Anthropic.AuthenticationError) return 'No valid API key. Add one in Settings, set ANTHROPIC_API_KEY, or run `ant auth login`.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use the sage model.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited. Wait a moment and ask again.'
  if (err instanceof Anthropic.BadRequestError) return `The request was rejected: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your internet connection.'
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ''}: ${err.message}`
  if (err instanceof Error && /api key|apiKey|authentication/i.test(err.message)) {
    return 'No API key found. Add one in Settings, set ANTHROPIC_API_KEY, or run `ant auth login`.'
  }
  return `Something went wrong: ${err instanceof Error ? err.message : String(err)}`
}
