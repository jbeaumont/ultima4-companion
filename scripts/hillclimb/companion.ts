// Reads what the test companion is showing, over the Chrome DevTools Protocol,
// so hill-climb scenarios can check it at each checkpoint. Starts the test
// instance (`npm run dev:test`, port 9241) if it is not already up.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Target {
  type: string
  url: string
  webSocketDebuggerUrl: string
}

async function targets(port: number): Promise<Target[] | null> {
  try {
    return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Target[]
  } catch {
    return null
  }
}

export class Companion {
  private id = 0

  private constructor(private ws: WebSocket) {}

  /** The pop-out HUD window (opened if needed), as its own connection. */
  async hud(port = 9241): Promise<Companion> {
    const find = async () => (await targets(port))?.find((p) => p.type === 'page' && p.url.includes('#hud'))
    if (!(await find())) await this.eval('window.u4.toggleHud()')
    const until = Date.now() + 10000
    while (Date.now() < until) {
      const t = await find()
      if (t) return Companion.open(t)
      await sleep(300)
    }
    throw new Error('the HUD window did not open')
  }

  private static async open(t: Target): Promise<Companion> {
    const ws = new WebSocket(t.webSocketDebuggerUrl)
    await new Promise((r, j) => {
      ws.addEventListener('open', r)
      ws.addEventListener('error', j)
    })
    return new Companion(ws)
  }

  /** Visible text of the whole page (for windows without a sidebar, like the HUD). */
  async text(): Promise<string> {
    return this.eval<string>('document.body.innerText')
  }

  static async connect(port = 9241, cwd = process.cwd()): Promise<Companion> {
    if (!(await targets(port))) {
      const child = spawn('npm', ['run', 'dev:test'], { cwd, shell: true, detached: true, stdio: 'ignore', windowsHide: true })
      child.unref()
    }
    const until = Date.now() + 90000
    while (Date.now() < until) {
      const t = (await targets(port))?.find((p) => p.type === 'page' && /^(http|file)/.test(p.url) && !p.url.includes('#hud'))
      if (t) {
        const c = await Companion.open(t)
        await c.until('document.querySelector(".sidebar") !== null', 30000)
        return c
      }
      await sleep(500)
    }
    throw new Error(`test companion did not come up on port ${port}`)
  }

  private call<T = unknown>(method: string, params: object = {}): Promise<T> {
    const my = ++this.id
    return new Promise((resolve) => {
      const onMsg = (m: MessageEvent) => {
        const msg = JSON.parse(String(m.data))
        if (msg.id !== my) return
        this.ws.removeEventListener('message', onMsg)
        resolve(msg.result as T)
      }
      this.ws.addEventListener('message', onMsg)
      this.ws.send(JSON.stringify({ id: my, method, params }))
    })
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.call<{ result?: { value?: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true }
    )
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result?.value as T
  }

  /** Wait until a JS expression in the renderer is truthy. */
  async until(expression: string, timeoutMs = 10000): Promise<boolean> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      if (await this.eval<boolean>(`(async () => !!(await (${expression})))()`).catch(() => false)) return true
      await sleep(200)
    }
    return false
  }

  /** Switch the sidebar to a view and return its visible text. */
  async view(name: string, settleMs = 600): Promise<string> {
    const ok = await this.eval<boolean>(
      `(() => { const b = [...document.querySelectorAll('.sidebar button')].find((b) => b.textContent === ${JSON.stringify(name)}); if (b) b.click(); return !!b })()`
    )
    if (!ok) throw new Error(`no sidebar view "${name}"`)
    await sleep(settleMs)
    return this.eval<string>(`(document.querySelector('main') ?? document.body).innerText`)
  }

  async state<T = Record<string, unknown>>(): Promise<T> {
    return this.eval<T>('window.u4.getState()')
  }

  async shot(path: string): Promise<void> {
    const { data } = await this.call<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(data, 'base64'))
  }

  close(): void {
    this.ws.close()
  }
}
