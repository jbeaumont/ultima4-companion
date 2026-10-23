// One Sage conversation: streaming, cancellation, history and error wording.
// No Electron here, and the client is injected, so it is tested with a fake.
import Anthropic from '@anthropic-ai/sdk'
import type { SpoilerLevel } from '@domain/hints'
import type { GameState } from '@shared/types'
import { disclosure } from '@domain/spoilers'
import { fixedCounsel } from './fixedCounsel'
import { buildStateMessage } from './prompt'
import type { Persona } from './prompt'
import { buildRequest, trimHistory } from './request'
import type { SageRequest } from './request'

type Message = Anthropic.Beta.BetaMessageParam

/** The part of a streamed response the sage uses. */
export interface SageStream {
  on(event: 'text', listener: (delta: string) => void): unknown
  finalMessage(): Promise<{ content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null; model: string }>
  abort(): void
}

/** Starts a streamed request (the real one wraps `client.beta.messages.stream`). */
export type StartStream = (request: SageRequest) => Promise<SageStream>

export interface SageEvents {
  delta: (id: string, text: string) => void
  done: (id: string, result: { ok: true; stopReason: string | null; servedBy: string } | { ok: false; message: string }) => void
}

export const TRUNCATED_NOTE = '\n\n(The answer was cut short. Ask the sage to continue.)'

export class SageConversation {
  private history: Message[] = []
  private persona: Persona = 'hawkwind'
  private level: SpoilerLevel = 'nudges'
  private current: { id: string; abort: () => void } | null = null

  constructor(private readonly start: StartStream) {}

  /** Messages kept for the next question (for tests and diagnostics). */
  get kept(): readonly Message[] {
    return this.history
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
    // a different persona or spoiler level is a different conversation: nothing said under the old rules carries over
    if (persona !== this.persona || level !== this.level) {
      this.history = []
      this.persona = persona
      this.level = level
    }

    // hints off is strict: fixed counsel from the player's own state, no model request
    if (disclosure(level).sage === 'fixed') {
      on.delta(id, fixedCounsel(state?.party ?? null, persona))
      return on.done(id, { ok: true, stopReason: 'end_turn', servedBy: 'fixed counsel (hints off)' })
    }

    const turn: Message[] = [
      { role: 'user', content: text },
      // per-turn state: shown for this turn only, kept in history unchanged (append-only)
      { role: 'system', content: buildStateMessage(state?.party ?? null, state?.source ?? null, level), clear_at: 'next_user_message' }
    ]

    let aborted = false
    this.current = { id, abort: () => (aborted = true) }
    try {
      const stream = await this.start(buildRequest(persona, level, this.history, turn))
      this.current = { id, abort: () => stream.abort() }
      if (aborted) stream.abort()
      stream.on('text', (delta) => on.delta(id, delta))
      const message = await stream.finalMessage()

      if (message.stop_reason === 'refusal') {
        // nothing appended: the declined turn is dropped so the conversation stays clean
        return on.done(id, { ok: false, message: 'The sage will not answer that. Try asking another way.' })
      }
      if (message.stop_reason === 'max_tokens') on.delta(id, TRUNCATED_NOTE)
      // append the full content (thinking blocks included) and keep the conversation within its budget
      this.history = trimHistory([...this.history, ...turn, { role: 'assistant', content: message.content }])
      on.done(id, { ok: true, stopReason: message.stop_reason, servedBy: message.model })
    } catch (err) {
      on.done(id, { ok: false, message: describeError(err) })
    } finally {
      this.current = null
    }
  }
}

export function describeError(err: unknown): string {
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
