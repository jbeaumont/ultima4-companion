// How a Sage request is built: the one place that knows about provider-specific
// options (betas, fallbacks, effort). Pure, so budgets and history limits are tested.
import type Anthropic from '@anthropic-ai/sdk'
import type { SpoilerLevel } from '@domain/hints'
import { SAGE_MODEL, buildSystemPrompt } from './prompt'
import type { Persona } from './prompt'

type Message = Anthropic.Beta.BetaMessageParam

/**
 * Output cap per answer, covering the model's thinking plus the answer. Measured
 * with scripts/sage-budget.ts (28 questions, both personas, Nudges and Full, Opus
 * 5.5 at medium effort): median 399, p90 608, max 654 output tokens, of which the
 * visible answer was at most about 240. The cap leaves about 3x headroom; an
 * answer that hits it is shown with a note rather than silently cut.
 */
export const SAGE_MAX_TOKENS = 2000

/** Conversation kept per persona and spoiler level, measured in characters of text (about 4 per token). */
export const SAGE_HISTORY_CHARS = 30_000

/**
 * What each supported model takes. Haiku 5.5 (the default, lowest cost) has no
 * server-side fallback (a `fallbacks` field is a 400) and no mid-conversation
 * system messages, so the game state rides in the user message instead.
 */
export const SAGE_MODELS = {
  'claude-haiku-5-5': { fallbacks: false, systemMessages: false },
  'claude-opus-5-5': { fallbacks: true, systemMessages: true }
} as const
export type SageModel = keyof typeof SAGE_MODELS

/** Exactly what the SDK's beta stream helper takes. */
export type SageRequest = Parameters<Anthropic['beta']['messages']['stream']>[0]

/**
 * One question and the game state at that moment. Where the model allows it the
 * state is a turn-scoped system message (shown for this turn only); otherwise a
 * second text block of the question. Either way it stays in history unchanged
 * (append-only, so the cache and earlier thinking stay valid).
 */
export function buildTurn(question: string, state: string, model: SageModel = SAGE_MODEL): Message[] {
  return SAGE_MODELS[model].systemMessages
    ? [{ role: 'user', content: question }, { role: 'system', content: state, clear_at: 'next_user_message' }]
    : [{ role: 'user', content: [{ type: 'text', text: question }, { type: 'text', text: state }] }]
}

export function buildRequest(persona: Persona, level: SpoilerLevel, history: Message[], turn: Message[], model: SageModel = SAGE_MODEL): SageRequest {
  const m = SAGE_MODELS[model]
  const betas = [...(m.fallbacks ? ['server-side-fallback-2026-07-01'] : []), ...(m.systemMessages ? ['mid-conversation-system-clear-at-2026-08-21'] : [])]
  return {
    model,
    max_tokens: SAGE_MAX_TOKENS,
    ...(betas.length ? { betas } : {}),
    ...(m.fallbacks ? { fallbacks: 'default' as const } : {}),
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: buildSystemPrompt(persona, level), cache_control: { type: 'ephemeral' } }],
    messages: [...history, ...turn]
  }
}

const textOf = (m: Message): string =>
  typeof m.content === 'string'
    ? m.content
    : m.content.map((b) => ('text' in b && typeof b.text === 'string' ? b.text : '')).join('')

/** Assistant content without thinking blocks (always valid in earlier turns). */
const withoutThinking = (m: Message): Message =>
  m.role !== 'assistant' || typeof m.content === 'string'
    ? m
    : { ...m, content: m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking') }

/**
 * Keep the conversation under `budget` characters by dropping the oldest whole
 * exchanges (a question, its state message and the answer). When anything is
 * dropped, the kept answers lose their thinking blocks, since those belong to the
 * conversation as it was.
 */
export function trimHistory(history: Message[], budget = SAGE_HISTORY_CHARS): Message[] {
  // split into exchanges, each starting at a user message
  const exchanges: Message[][] = []
  for (const m of history) {
    if (m.role === 'user' || !exchanges.length) exchanges.push([m])
    else exchanges[exchanges.length - 1]!.push(m)
  }
  let size = history.reduce((n, m) => n + textOf(m).length, 0)
  let dropped = 0
  while (exchanges.length > 1 && size > budget) {
    size -= exchanges.shift()!.reduce((n, m) => n + textOf(m).length, 0)
    dropped++
  }
  const kept = exchanges.flat()
  return dropped ? kept.map(withoutThinking) : kept
}
