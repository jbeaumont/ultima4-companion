// Watches the fortune teller at character creation (#68). While DOSBox's title says
// the TITLE program is running, finds TITLE.EXE's data segment by its karma block
// and reads the cards on offer; with a target class set ("answer for me"), presses
// the card for that class once per question. Keys go in only while DOSBox is in
// front (pressKeys), and only to this instance's game.
import { TITLE, pickCard, readFortune } from '@shared/fortune'
import type { FortuneState } from '@shared/fortune'
import { programFromTitle } from '@shared/speed'
import { dosboxWindows, pressKeys } from './dosboxSpeed'
import { ProcessReader, dosboxProcesses, isTestDosbox } from './memory/win32'

const VK_SPACE = 0x20
const VK_A = 0x41
const VK_B = 0x42
// the data segment from TITLE.question to past the cards
const SPAN = TITLE.cardA + 2 - TITLE.question

export interface FortuneUpdate {
  state: FortuneState | null
  /** The class the companion answers for (a virtue index), or null. */
  auto: number | null
  /** The last problem pressing keys, if any. */
  error?: string
}

export class FortuneWatcher {
  private pid: number | null = null
  private reader: ProcessReader | null = null
  private ds: bigint | null = null
  private auto: number | null = null
  private answered = -1
  private pressedAt = 0
  private busy = false
  private last = ''
  private error: string | undefined
  private kinds = new Map<number, boolean>() // pid -> is a test game

  constructor(private readonly testMode: boolean, private readonly send: (u: FortuneUpdate) => void) {}

  setAuto(target: number | null): FortuneUpdate {
    this.auto = target !== null && target >= 0 && target < 8 ? target : null
    this.answered = -1
    this.error = undefined
    return this.update(null, true)
  }

  /** Called on a timer: cheap unless the title program is running. */
  async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const pid = await this.titleGame()
      if (!pid) return void this.reset()
      if (pid !== this.pid) {
        this.reset()
        this.pid = pid
        this.reader = ProcessReader.open(pid)
      }
      if (!this.reader) return
      let state = this.ds !== null ? this.read() : null
      if (!state) {
        this.ds = this.find()
        state = this.ds !== null ? this.read() : null
      }
      this.update(state)
      // the game flushes its keyboard just before "Consider this:", which can swallow a press: if the
      // question has not moved on a few seconds later, press again (Space is ignored at the question)
      if (state?.cards && state.question === this.answered && Date.now() - this.pressedAt > 3000) this.answered = -1
      if (state?.cards && this.auto !== null && state.question !== this.answered) {
        this.answered = state.question
        this.pressedAt = Date.now()
        const card = pickCard(this.auto, state.cards.a, state.cards.b)
        try {
          // Space first: on "Consider this:" it shows the question; on the question itself it is ignored
          await pressKeys(pid, [VK_SPACE, card === 'A' ? VK_A : VK_B], 300)
          this.error = undefined
        } catch (err) {
          this.answered = -1 // try again on the next tick
          this.error = (err as Error).message
          this.update(state, true)
        }
      }
    } finally {
      this.busy = false
    }
  }

  /** This instance's DOSBox while it runs TITLE (play games for a normal instance, test games for a test one). */
  private async titleGame(): Promise<number | null> {
    const win = dosboxWindows().find((w) => programFromTitle(w.title) === 'TITLE')
    if (!win) return null
    if (!this.kinds.has(win.pid)) {
      const p = (await dosboxProcesses()).find((x) => x.pid === win.pid)
      if (!p) return null
      this.kinds.set(win.pid, isTestDosbox(p.commandLine))
    }
    return this.kinds.get(win.pid) === this.testMode ? win.pid : null
  }

  private read(): FortuneState | null {
    const buf = this.reader!.read(this.ds! + BigInt(TITLE.question), SPAN)
    return buf ? readFortune((off) => buf[off - TITLE.question] ?? 0) : null
  }

  /** Find TITLE's data segment: a karma block (eight multiples of 5 from 50 to 65) that reads as a fortune telling. */
  private find(): bigint | null {
    for (const r of this.reader!.regions(0x100000)) {
      for (let off = 0; off < r.size; off += 0x100000) {
        const len = Math.min(0x100000 + SPAN, r.size - off)
        const buf = this.reader!.read(r.base + BigInt(off), len)
        if (!buf) continue
        for (let i = TITLE.karma - TITLE.question; i + 8 < buf.length; i++) {
          if (buf[i] !== 50 && buf[i] !== 55 && buf[i] !== 60 && buf[i] !== 65) continue
          let ok = true
          for (let j = 1; j < 8 && ok; j++) { const k = buf[i + j]!; ok = k >= 50 && k <= 65 && k % 5 === 0 }
          if (!ok) continue
          const ds = r.base + BigInt(off + i) - BigInt(TITLE.karma)
          const window = this.reader!.read(ds + BigInt(TITLE.question), SPAN)
          if (window && readFortune((o) => window[o - TITLE.question] ?? 0)) return ds
        }
      }
    }
    return null
  }

  private reset(): void {
    this.reader?.close()
    this.reader = null
    this.pid = null
    this.ds = null
    this.answered = -1
    this.update(null)
  }

  private update(state: FortuneState | null, force = false): FortuneUpdate {
    const u: FortuneUpdate = { state, auto: this.auto, ...(this.error ? { error: this.error } : {}) }
    const key = JSON.stringify(u)
    if (force || key !== this.last) {
      this.last = key
      this.send(u)
    }
    return u
  }

  current(): FortuneUpdate {
    return JSON.parse(this.last || '{"state":null,"auto":null}') as FortuneUpdate
  }
}
