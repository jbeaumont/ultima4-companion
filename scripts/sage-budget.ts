// Measure the Sage's output budget on real questions (issue #53). Asks a fixed set
// of advisor questions at each persona and model-backed spoiler level, through the
// app's own conversation code (same request, history and truncation), and records
// output tokens, the share that was thinking, and cost. Without --yes it only
// prints the plan and an estimate: nothing is sent and nothing is spent.
//   npx tsx scripts/sage-budget.ts [outDir] [--yes] [--model claude-haiku-5-5|claude-opus-5-5] [--personas hawkwind,lordbritish] [--levels nudges,full]
// Needs ANTHROPIC_API_KEY (or an `ant auth login` profile). The game state comes
// from the install's save, read only.
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../src/parsers/party'
import type { SpoilerLevel } from '../src/domain/hints'
import type { GameState } from '../src/shared/types'
import { SageConversation } from '../src/main/sage/conversation'
import type { SageStream } from '../src/main/sage/conversation'
import { SAGE_MAX_TOKENS, SAGE_MODELS } from '../src/main/sage/request'
import type { SageModel } from '../src/main/sage/request'
import { SAGE_MODEL, buildStateMessage, buildSystemPrompt } from '../src/main/sage/prompt'
import type { Persona } from '../src/main/sage/prompt'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const OUT = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? join(process.cwd(), 'sage-budget-out')
const SPEND = args.includes('--yes')
const PERSONAS = (flag('--personas') ?? 'hawkwind,lordbritish').split(',') as Persona[]
const LEVELS = (flag('--levels') ?? 'nudges,full').split(',') as SpoilerLevel[]
const MODEL = (flag('--model') ?? SAGE_MODEL) as SageModel
const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'

// one conversation per persona and level, asked in order (the follow-ups lean on history)
const QUESTIONS = [
  'What should I do next?',
  'How do I become an Avatar of Honesty?',
  'Where can I find the Rune of Valor?',
  'What is the mantra of Spirituality?',
  'My party keeps dying in dungeons. Any advice?',
  'How do I get into the Stygian Abyss, and what do I need first?',
  'Tell me more about that last part.'
]

// USD per million tokens (cache writes at 1.25x input for the 5-minute TTL; Haiku at prompts of 100k tokens or fewer)
const PRICES: Record<SageModel, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }
}
const PRICE = PRICES[MODEL] ?? PRICES['claude-opus-5-5']

interface Row {
  persona: Persona
  level: SpoilerLevel
  question: string
  stopReason: string | null
  outputTokens: number
  /** Output tokens of the visible answer, estimated at 4 characters per token. */
  answerTokens: number
  thinkingTokens: number
  inputTokens: number
  cacheRead: number
  cacheWrite: number
  usd: number
  answer: string
}

function gameState(): GameState | null {
  for (const p of [join(GAME, 'cloud_saves', 'PARTY.SAV'), join(GAME, 'PARTY.SAV')]) {
    if (existsSync(p)) return { status: 'ok', source: 'saveFile', party: parsePartySav(new Uint8Array(readFileSync(p))) } as unknown as GameState
  }
  return null
}

const tokens = (text: string) => Math.ceil(text.length / 4)
const usd = (n: number, perM: number) => (n * perM) / 1e6

function plan(state: GameState | null): void {
  let input = 0
  for (const persona of PERSONAS) {
    for (const level of LEVELS) {
      const system = tokens(buildSystemPrompt(persona, level))
      const turn = tokens(buildStateMessage(state?.party ?? null, 'saveFile', level))
      // the system prompt is written to the cache once, then read; history grows by about one answer per question
      QUESTIONS.forEach((q, i) => (input += turn + tokens(q) + i * 300))
      input += system * 1.25 + system * 0.05 * (QUESTIONS.length - 1)
      console.log(`${persona}/${level}: system prompt about ${system} tokens, state about ${turn}`)
    }
  }
  const calls = PERSONAS.length * LEVELS.length * QUESTIONS.length
  const outLow = calls * 400
  const outHigh = calls * SAGE_MAX_TOKENS
  console.log(`${calls} requests; input about ${Math.round(input)} tokens-equivalent ($${usd(input, PRICE.input).toFixed(2)})`)
  console.log(`output: $${usd(outLow, PRICE.output).toFixed(2)} if answers are short, at most $${usd(outHigh, PRICE.output).toFixed(2)} if every answer hits the ${SAGE_MAX_TOKENS} cap`)
}

async function main(): Promise<void> {
  if (!(MODEL in SAGE_MODELS)) throw new Error(`unknown model ${MODEL}; one of ${Object.keys(SAGE_MODELS).join(', ')}`)
  console.log(`model: ${MODEL}`)
  const state = gameState()
  console.log(`game state: ${state ? 'from the install save' : 'none (general answers)'}`)
  plan(state)
  if (!SPEND) {
    console.log('dry run: nothing was sent. Add --yes to ask the questions and spend the amounts above.')
    return
  }
  mkdirSync(OUT, { recursive: true })
  const client = new Anthropic()
  const rows: Row[] = []
  for (const persona of PERSONAS) {
    for (const level of LEVELS) {
      // capture usage, which the app's stream type leaves out
      let usage: Anthropic.Beta.BetaUsage | null = null
      const convo = new SageConversation(async (request) => {
        const stream = client.beta.messages.stream(request)
        const wrapped: SageStream = {
          on: (e, l) => stream.on(e, l),
          abort: () => stream.abort(),
          finalMessage: async () => {
            const m = await stream.finalMessage()
            usage = m.usage
            return m
          }
        }
        return wrapped
      }, MODEL)
      for (const question of QUESTIONS) {
        let answer = ''
        let stopReason: string | null = null
        let failure = ''
        usage = null
        await convo.ask('q', question, persona, level, state, {
          delta: (_id, t) => (answer += t),
          done: (_id, r) => (r.ok ? (stopReason = r.stopReason) : (failure = r.message))
        })
        if (failure) throw new Error(`${persona}/${level} "${question}": ${failure}`)
        const u = usage as Anthropic.Beta.BetaUsage | null
        const out = u?.output_tokens ?? 0
        const answerTokens = tokens(answer)
        const row: Row = {
          persona, level, question, stopReason,
          outputTokens: out,
          answerTokens,
          thinkingTokens: Math.max(0, out - answerTokens),
          inputTokens: u?.input_tokens ?? 0,
          cacheRead: u?.cache_read_input_tokens ?? 0,
          cacheWrite: u?.cache_creation_input_tokens ?? 0,
          usd: 0,
          answer
        }
        row.usd = usd(row.inputTokens, PRICE.input) + usd(row.cacheRead, PRICE.cacheRead) + usd(row.cacheWrite, PRICE.cacheWrite) + usd(out, PRICE.output)
        rows.push(row)
        console.log(`${persona}/${level} ${out} out (${row.thinkingTokens} thinking) ${stopReason} $${row.usd.toFixed(3)}  ${question}`)
      }
    }
  }
  const outs = rows.map((r) => r.outputTokens).sort((a, b) => a - b)
  const pct = (p: number) => outs[Math.min(outs.length - 1, Math.floor((p / 100) * outs.length))]!
  const summary = {
    model: MODEL,
    cap: SAGE_MAX_TOKENS,
    requests: rows.length,
    hitCap: rows.filter((r) => r.stopReason === 'max_tokens').length,
    output: { median: pct(50), p90: pct(90), max: outs[outs.length - 1] },
    answerTokensMax: Math.max(...rows.map((r) => r.answerTokens)),
    thinkingTokensMax: Math.max(...rows.map((r) => r.thinkingTokens)),
    // a system prompt below the model's cache minimum shows no writes or reads here
    cacheWriteTokens: rows.reduce((n, r) => n + r.cacheWrite, 0),
    cacheReadTokens: rows.reduce((n, r) => n + r.cacheRead, 0),
    totalUsd: Number(rows.reduce((n, r) => n + r.usd, 0).toFixed(3))
  }
  writeFileSync(join(OUT, 'sage-budget.json'), JSON.stringify({ summary, rows }, null, 2))
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
