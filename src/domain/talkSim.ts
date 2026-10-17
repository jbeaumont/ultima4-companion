// Pure talk simulator, in the spirit of the original game's conversation loop:
// input is trimmed and uppercased and only its first 4 letters count.
import type { Conversation } from '@parsers/talk'

export interface SimState {
  /** A question was just asked; the next input is read as Y or N. */
  awaitingYesNo: boolean
  ended: boolean
}

export interface SimReply {
  /** Response lines in order (the answer, then possibly the question); each is a savable clue. */
  lines: string[]
  state: SimState
}

export const startSim = (): SimState => ({ awaitingYesNo: false, ended: false })

/** The game's text uses "\n" for its fixed-width line breaks; show it as flowing text. */
export const flat = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim()

/** Trim, uppercase, keep the first 4 letters. */
export const normalizeInput = (raw: string): string => raw.trim().toUpperCase().slice(0, 4)

export const intro = (c: Conversation): string => `You meet ${flat(c.description)}`

const key4 = (k: string): string => k.trim().toUpperCase().slice(0, 4)

type Topic = 'job' | 'health' | 'keyword1' | 'keyword2'

export function reply(c: Conversation, state: SimState, raw: string): SimReply {
  if (state.ended) return { lines: [], state }
  const input = normalizeInput(raw)
  const bye: SimReply = { lines: ['Bye.'], state: { awaitingYesNo: false, ended: true } }
  if (input === '' || input === 'BYE') return bye

  if (state.awaitingYesNo) {
    if (input.startsWith('Y')) return { lines: [flat(c.yesResponse)], state: { awaitingYesNo: false, ended: false } }
    if (input.startsWith('N')) return { lines: [flat(c.noResponse)], state: { awaitingYesNo: false, ended: false } }
    return { lines: ['Please answer Y or N.'], state }
  }

  let text: string
  let topic: Topic | null = null
  if (input === 'LOOK') text = `You see ${flat(c.description)}`
  else if (input === 'NAME') text = `${c.pronoun} says: I am ${flat(c.name)}`
  else if (input === 'JOB') [text, topic] = [c.job, 'job']
  else if (input === 'HEAL') [text, topic] = [c.health, 'health']
  else if (c.keyword1 && input === key4(c.keyword1)) [text, topic] = [c.keyword1Response, 'keyword1']
  else if (c.keyword2 && input === key4(c.keyword2)) [text, topic] = [c.keyword2Response, 'keyword2']
  else text = 'That I cannot help thee with.'

  const lines = [flat(text)]
  if (topic && c.questionTrigger === topic && c.question) {
    lines.push(flat(c.question))
    return { lines, state: { awaitingYesNo: true, ended: false } }
  }
  return { lines, state: { awaitingYesNo: false, ended: false } }
}

/** Every response an NPC can give, labelled by the keyword that triggers it (for the transcript view). */
export function transcript(c: Conversation): { label: string; text: string }[] {
  const asks = c.questionTrigger !== 'none'
  const rows: [string, string][] = [
    ['LOOK', `You see ${c.description}`],
    ['NAME', `${c.pronoun} says: I am ${c.name}`],
    ['JOB', c.job],
    ['HEAL', c.health],
    [c.keyword1.toUpperCase(), c.keyword1Response],
    [c.keyword2.toUpperCase(), c.keyword2Response],
    [`QUESTION (after ${c.questionTrigger})`, asks ? c.question : ''],
    ['YES', asks ? c.yesResponse : ''],
    ['NO', asks ? c.noResponse : '']
  ]
  return rows.filter(([l, t]) => l && t.trim()).map(([label, text]) => ({ label, text: flat(text) }))
}
