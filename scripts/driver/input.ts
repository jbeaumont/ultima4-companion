// Keystroke injection into DOSBox's window via PostMessage (no focus, no
// screenshots). DOSBox 0.74 is an SDL 1.2 app; with SDL_VIDEODRIVER=windib (set
// by the test launch profile) it reads keys from WM_KEYDOWN/WM_KEYUP messages.
import koffi from 'koffi'

const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101

const user32 = koffi.load('user32.dll')
const FindWindowExW = user32.func('void* __stdcall FindWindowExW(void* parent, void* after, str16 cls, str16 title)')
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void* hwnd, _Out_ uint32* pid)')
const PostMessageW = user32.func('bool __stdcall PostMessageW(void* hwnd, uint32 msg, uintptr wParam, intptr lParam)')
const GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()')
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(void* hwnd)')
const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(void* hwnd)')
const ShowWindow = user32.func('bool __stdcall ShowWindow(void* hwnd, int cmd)')
const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool attach)')
const GetCurrentThreadId = koffi.load('kernel32.dll').func('uint32 __stdcall GetCurrentThreadId()')
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void* hwnd)')
const keybd_event = user32.func('void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr extra)')
const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' })
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void* hwnd, _Out_ RECT* r)')
const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT* p)')
const SetCursorPos = user32.func('bool __stdcall SetCursorPos(int x, int y)')
const mouse_event = user32.func('void __stdcall mouse_event(uint32 flags, uint32 dx, uint32 dy, uint32 data, uintptr extra)')
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(void* hwnd, intptr after, int x, int y, int cx, int cy, uint32 flags)')
const HWND_TOPMOST = -1
const HWND_NOTOPMOST = -2
const SWP_KEEP = 0x0001 | 0x0002 | 0x0010 // NOSIZE | NOMOVE | NOACTIVATE


/** Virtual-key code, scan code, and whether the key is an extended key. */
const KEYS: Record<string, [number, number, boolean]> = {
  up: [0x26, 0x48, true],
  down: [0x28, 0x50, true],
  left: [0x25, 0x4b, true],
  right: [0x27, 0x4d, true],
  space: [0x20, 0x39, false],
  enter: [0x0d, 0x1c, false],
  escape: [0x1b, 0x01, false]
}
const LETTER_SCANCODES = 'qwertyuiop'.split('').map((c, i) => [c, 0x10 + i] as const)
  .concat('asdfghjkl'.split('').map((c, i) => [c, 0x1e + i] as const))
  .concat('zxcvbnm'.split('').map((c, i) => [c, 0x2c + i] as const))
for (const [c, sc] of LETTER_SCANCODES) KEYS[c] = [c.toUpperCase().charCodeAt(0), sc, false]
for (const [d, sc] of [['1', 2], ['2', 3], ['3', 4], ['4', 5], ['5', 6], ['6', 7], ['7', 8], ['8', 9], ['9', 10], ['0', 11]] as const) {
  KEYS[d] = [d.charCodeAt(0), sc, false]
}

export type Key = keyof typeof KEYS | string

/** The visible DOSBox window belonging to `pid` (SDL 1.2 windows use the class "SDL_app"). Look it up fresh: it can be recreated. */
export function findDosboxWindow(pid: number): unknown | null {
  let h: unknown = null
  for (let i = 0; i < 64; i++) {
    h = FindWindowExW(null, h, 'SDL_app', null)
    if (!h) return null
    const owner: [number] = [0]
    GetWindowThreadProcessId(h, owner)
    // DOSBox recreates its window when it changes video mode; only the visible one is live
    if (owner[0] === pid && IsWindowVisible(h)) return h
  }
  return null
}

const same = (a: unknown, b: unknown) => koffi.address(a as never) === koffi.address(b as never)

const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void* h, _Out_ uint16_t* buf, int n)')

/** Title of the current foreground window (for diagnostics). */
export function foregroundTitle(): string {
  const fg = GetForegroundWindow()
  if (!fg) return '(none)'
  const b = new Uint16Array(256)
  const n = GetWindowTextW(fg, b, 256)
  return String.fromCharCode(...b.slice(0, n))
}

/** The DOSBox window's title, which shows the CPU speed ("Cpu speed: 3000 cycles"). */
export function dosboxTitle(pid: number): string {
  const h = findDosboxWindow(pid)
  if (!h) return ''
  const b = new Uint16Array(256)
  const n = GetWindowTextW(h, b, 256)
  return String.fromCharCode(...b.slice(0, n))
}

/** Whether `hwnd` is the foreground window. SDL 1.2 ignores keys unless it is. */
export function hasFocus(hwnd: unknown): boolean {
  const fg = GetForegroundWindow()
  return !!fg && same(fg, hwnd)
}

/** Whether any window of process `pid` is the foreground window. */
export function processHasFocus(pid: number): boolean {
  const fg = GetForegroundWindow()
  if (!fg) return false
  const owner: [number] = [0]
  GetWindowThreadProcessId(fg, owner)
  return owner[0] === pid
}

/**
 * Bring the DOSBox window to the foreground. Windows only lets the foreground
 * thread do that, so briefly attach our input queue to the current foreground
 * thread (a standard, side-effect-free technique).
 */
export function focusWindow(hwnd: unknown): boolean {
  if (hasFocus(hwnd)) return true
  const fg = GetForegroundWindow()
  const me = GetCurrentThreadId()
  const other = fg ? GetWindowThreadProcessId(fg, [0]) : 0
  if (other && other !== me) AttachThreadInput(me, other, true)
  ShowWindow(hwnd, 9) // SW_RESTORE
  BringWindowToTop(hwnd)
  SetForegroundWindow(hwnd)
  if (other && other !== me) AttachThreadInput(me, other, false)
  if (hasFocus(hwnd)) return true
  // fallback: a synthetic Alt tap counts as user input, which lifts the foreground lock
  keybd_event(0x12, 0, 0, 0)
  SetForegroundWindow(hwnd)
  keybd_event(0x12, 0, 2, 0) // KEYEVENTF_KEYUP
  return hasFocus(hwnd)
}

/**
 * Tell the window it is active without changing the real foreground window.
 * SDL 1.2 tracks input focus from these messages, and only reads keys while it
 * believes it has focus; this lets the driver play while DOSBox sits in the
 * background and the user's foreground window is left alone.
 */
export function markActive(hwnd: unknown): void {
  PostMessageW(hwnd, 0x0006, 1, 0) // WM_ACTIVATE, WA_ACTIVE
  PostMessageW(hwnd, 0x0007, 0, 0) // WM_SETFOCUS
}

/**
 * Activate the window with one real click inside it (Windows only lets user
 * input change the foreground window), then put the cursor back. The test
 * launch profile turns DOSBox's mouse autolock off, so the click can't capture
 * the mouse.
 */
export function focusByClick(hwnd: unknown): boolean {
  if (hasFocus(hwnd)) return true
  const r: Record<string, number> = {}
  if (!GetWindowRect(hwnd, r)) return false
  const saved: Record<string, number> = {}
  GetCursorPos(saved)
  // lift DOSBox above any window covering it (allowed without focus), so the click lands on it
  SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_KEEP)
  SetCursorPos(r.left! + 60, r.top! + 80) // inside the game screen, clear of the title bar
  mouse_event(0x0002, 0, 0, 0, 0) // LEFTDOWN
  mouse_event(0x0004, 0, 0, 0, 0) // LEFTUP
  SetCursorPos(saved.x ?? 0, saved.y ?? 0)
  SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_KEEP)
  return hasFocus(hwnd)
}

export function postKey(hwnd: unknown, key: Key): void {
  const k = KEYS[key.toLowerCase()]
  if (!k) throw new Error(`Unknown key: ${key}`)
  const [vk, sc, ext] = k
  const down = 1 | (sc << 16) | (ext ? 1 << 24 : 0)
  const up = down | (1 << 30) | 2 ** 31
  PostMessageW(hwnd, WM_KEYDOWN, vk, down)
  PostMessageW(hwnd, WM_KEYUP, vk, up)
}
