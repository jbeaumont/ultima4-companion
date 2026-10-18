// *.TLK dialogue: up to 16 NPC blocks of 288 bytes. Each block is a 3-byte
// header followed by 12 zero-terminated strings.
const BLOCK_SIZE = 0x120

export type QuestionTrigger = 'none' | 'job' | 'health' | 'keyword1' | 'keyword2'
const TRIGGERS: Record<number, QuestionTrigger> = { 0: 'none', 3: 'job', 4: 'health', 5: 'keyword1', 6: 'keyword2' }

export interface Conversation {
  index: number // 1-based, matches TownNpc.talkIndex
  questionTrigger: QuestionTrigger
  humilityQuestion: boolean
  turnAwayChance: number // out of 256
  name: string
  pronoun: string
  description: string
  job: string
  health: string
  keyword1Response: string
  keyword2Response: string
  question: string
  yesResponse: string
  noResponse: string
  keyword1: string
  keyword2: string
}

export function parseTlk(buf: Uint8Array): Conversation[] {
  const out: Conversation[] = []
  const blocks = Math.floor(buf.length / BLOCK_SIZE)
  for (let b = 0; b < blocks; b++) {
    const base = b * BLOCK_SIZE
    const end = base + BLOCK_SIZE
    const strings: string[] = []
    let p = base + 3
    while (strings.length < 12 && p < end) {
      let s = ''
      while (p < end && buf[p] !== 0) s += String.fromCharCode(buf[p++]!)
      p++
      strings.push(s)
    }
    const [name = '', pronoun = '', description = '', job = '', health = '', k1r = '', k2r = '',
      question = '', yes = '', no = '', k1 = '', k2 = ''] = strings
    if (!name) continue
    out.push({
      index: b + 1,
      questionTrigger: TRIGGERS[buf[base]!] ?? 'none',
      humilityQuestion: buf[base + 1] === 1,
      turnAwayChance: buf[base + 2]!,
      name,
      pronoun,
      description,
      job,
      health,
      keyword1Response: k1r,
      keyword2Response: k2r,
      question,
      yesResponse: yes,
      noResponse: no,
      keyword1: k1,
      keyword2: k2
    })
  }
  return out
}
