// Live game speed (#70): read DOSBox's speed from its window title and change it
// with DOSBox's own Ctrl+F11 / Ctrl+F12 keys. The play profile's video driver reads
// real keystrokes only, so DOSBox is brought to the front first, and no key is sent
// unless it is the foreground window: a stray Ctrl+F12 must never reach another app.
import koffi from 'koffi'
import { cyclesFromTitle } from '@shared/speed'

const VK_CONTROL = 0x11
const VK_F11 = 0x7a
const VK_F12 = 0x7b
const KEYEVENTF_KEYUP = 0x0002
const SW_RESTORE = 9

let api: {
  FindWindowExW: (parent: unknown, after: unknown, cls: string, title: string | null) => unknown
  GetWindowThreadProcessId: (h: unknown, pid: [number]) => number
  GetWindowTextW: (h: unknown, buf: Uint16Array, n: number) => number
  IsWindowVisible: (h: unknown) => boolean
  IsIconic: (h: unknown) => boolean
  ShowWindow: (h: unknown, cmd: number) => boolean
  GetForegroundWindow: () => unknown
  SetForegroundWindow: (h: unknown) => boolean
  BringWindowToTop: (h: unknown) => boolean
  AttachThreadInput: (a: number, b: number, attach: boolean) => boolean
  GetCurrentThreadId: () => number
  keybd_event: (vk: number, scan: number, flags: number, extra: number) => void
} | null = null

function load() {
  if (api) return api
  const u = koffi.load('user32.dll')
  const k = koffi.load('kernel32.dll')
  api = {
    FindWindowExW: u.func('void* __stdcall FindWindowExW(void* parent, void* after, str16 cls, str16 title)'),
    GetWindowThreadProcessId: u.func('uint32 __stdcall GetWindowThreadProcessId(void* hwnd, _Out_ uint32* pid)'),
    GetWindowTextW: u.func('int __stdcall GetWindowTextW(void* h, _Out_ uint16_t* buf, int n)'),
    IsWindowVisible: u.func('bool __stdcall IsWindowVisible(void* hwnd)'),
    IsIconic: u.func('bool __stdcall IsIconic(void* hwnd)'),
    ShowWindow: u.func('bool __stdcall ShowWindow(void* hwnd, int cmd)'),
    GetForegroundWindow: u.func('void* __stdcall GetForegroundWindow()'),
    SetForegroundWindow: u.func('bool __stdcall SetForegroundWindow(void* hwnd)'),
    BringWindowToTop: u.func('bool __stdcall BringWindowToTop(void* hwnd)'),
    AttachThreadInput: u.func('bool __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool attach)'),
    GetCurrentThreadId: k.func('uint32 __stdcall GetCurrentThreadId()'),
    keybd_event: u.func('void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr extra)')
  }
  return api
}

/** DOSBox's visible SDL window for `pid`. Looked up each time: DOSBox recreates it on a video mode change. */
function findWindow(pid: number): unknown | null {
  const a = load()
  let h: unknown = null
  for (let i = 0; i < 64; i++) {
    h = a.FindWindowExW(null, h, 'SDL_app', null)
    if (!h) return null
    const owner: [number] = [0]
    a.GetWindowThreadProcessId(h, owner)
    if (owner[0] === pid && a.IsWindowVisible(h)) return h
  }
  return null
}

/** koffi returns a new object for each pointer, so windows are compared by address. */
const same = (a: unknown, b: unknown): boolean => !!a && !!b && koffi.address(a as never) === koffi.address(b as never)
const inFront = (h: unknown): boolean => same(load().GetForegroundWindow(), h)

function title(h: unknown): string {
  const b = new Uint16Array(256)
  const n = load().GetWindowTextW(h, b, 256)
  return String.fromCharCode(...b.slice(0, n))
}

/** The running game's speed, from its window title (null when unknown). */
export function runningCycles(pid: number): number | 'max' | null {
  const h = findWindow(pid)
  return h ? cyclesFromTitle(title(h)) : null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Bring DOSBox to the front; true only if it really is the foreground window now (activation is asynchronous). */
async function bringToFront(h: unknown): Promise<boolean> {
  const a = load()
  if (inFront(h)) return true
  if (a.IsIconic(h)) a.ShowWindow(h, SW_RESTORE)
  const fg = a.GetForegroundWindow()
  const fgThread = fg ? a.GetWindowThreadProcessId(fg, [0]) : 0
  const me = a.GetCurrentThreadId()
  if (fgThread) a.AttachThreadInput(me, fgThread, true)
  a.BringWindowToTop(h)
  a.SetForegroundWindow(h)
  if (fgThread) a.AttachThreadInput(me, fgThread, false)
  for (let i = 0; i < 10 && !inFront(h); i++) await sleep(50)
  return inFront(h)
}

export class SpeedRefused extends Error {}

/**
 * Step the running game's speed to `target` cycles with Ctrl+F11 / Ctrl+F12. Each
 * press is sent only while DOSBox is the foreground window; the title confirms
 * every step. Works with any step size (the companion's configs use 500; a game
 * started elsewhere may use GOG's 50, which takes more presses).
 */
export async function setRunningCycles(pid: number, target: number): Promise<number> {
  const a = load()
  let h = findWindow(pid)
  if (!h) throw new SpeedRefused('The game window was not found.')
  let now = cyclesFromTitle(title(h))
  if (now === null) throw new SpeedRefused('Could not read the game speed from the DOSBox window.')
  if (now === 'max') throw new SpeedRefused('The game is running at maximum speed; restart it from the companion to use a preset.')
  let stuck = 0
  for (let presses = 0; presses < 120 && now !== target; presses++) {
    h = findWindow(pid)
    if (!h || !(await bringToFront(h))) throw new SpeedRefused('DOSBox did not come to the front, so no key was pressed. Click the game window and try again.')
    const key = (now as number) < target ? VK_F12 : VK_F11
    a.keybd_event(VK_CONTROL, 0, 0, 0)
    a.keybd_event(key, 0, 0, 0)
    a.keybd_event(key, 0, KEYEVENTF_KEYUP, 0)
    a.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
    await sleep(120)
    const next = cyclesFromTitle(title(h))
    if (next === null || next === 'max') throw new SpeedRefused('Lost track of the game speed.')
    // overshooting past the target (a step that does not divide the gap) ends at the nearest value
    if ((now < target && next > target) || (now > target && next < target)) return next
    stuck = next === now ? stuck + 1 : 0
    if (stuck >= 3) throw new SpeedRefused('The game did not respond to the speed keys.')
    now = next
  }
  return now as number
}
