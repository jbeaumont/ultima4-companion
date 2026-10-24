// Check the live game speed control (#70) against DOSBox's default video driver,
// the one the play profile uses (real keystrokes, not posted messages). Starts a
// test-classified DOSBox at 500 cycles on the test saves, then steps it to each
// preset with the companion's own code and reads the speed back from the title.
// With --companion it goes through the test companion instead (npm run dev:test):
// a real click makes the companion the foreground app, as when the player clicks
// its speed buttons, which is what lets it bring DOSBox forward.
//   npx tsx scripts/hillclimb/speed-live.ts [--companion]
import { execFileSync, spawn } from 'node:child_process'
import koffi from 'koffi'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildConf } from '../../src/main/launcher'
import { runningCycles, setRunningCycles } from '../../src/main/dosboxSpeed'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { SPEEDS } from '../../src/shared/speed'

const GAME = process.env['U4_DIR'] || 'C:/Program Files/GOG Galaxy/Games/Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}

async function main(): Promise<void> {
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  mkdirSync(OVERLAY, { recursive: true })
  // named dosbox-test.conf so every companion treats it as a test game; no windib, like the play profile
  const conf = join(TEST_DATA, 'dosbox-test.conf')
  writeFileSync(conf, buildConf({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, cycles: SPEEDS.original }))
  const child = spawn(join(GAME, 'DOSBOX', 'dosbox.exe'), ['-conf', join(GAME, 'dosboxULTIMA4.conf'), '-conf', conf, '-noconsole'], {
    cwd: join(GAME, 'DOSBOX'), detached: true, stdio: 'ignore', env: { ...process.env, SDL_VIDEO_CENTERED: '1' }
  })
  child.unref()
  const pid = child.pid!
  for (let i = 0; i < 40 && runningCycles(pid) === null; i++) await sleep(250)
  expect(runningCycles(pid) === 500, `starts at the configured 500 cycles (title says ${runningCycles(pid)})`)
  const viaCompanion = process.argv.includes('--companion')
  for (const [name, target] of [['faster', SPEEDS.faster], ['fast', SPEEDS.fast], ['original', SPEEDS.original]] as const) {
    const t0 = Date.now()
    let got: unknown
    if (viaCompanion) {
      clickCompanion()
      got = cdp(`window.u4.setGameSpeed('${name}').then((r) => r.ok ? r.running : r.message)`)
    } else {
      got = await setRunningCycles(pid, target).catch((e: Error) => e.message)
    }
    expect(got === target && runningCycles(pid) === target, `set live to ${target}${viaCompanion ? ' from the companion' : ''}: ${got} in ${Date.now() - t0} ms`)
  }
  process.kill(pid)
  console.log(`${findings.length} gap(s)`)
  process.exitCode = findings.length ? 1 : 0
}

function cdp(expr: string): unknown {
  return JSON.parse(execFileSync('node', ['scripts/cdp.mjs', '9241', 'eval', expr], { encoding: 'utf8' }))
}

const u32 = koffi.load('user32.dll')
const RECT = koffi.struct('RECT_C', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
const FindWindowW = u32.func('void* __stdcall FindWindowW(str16 cls, str16 title)')
const GetWindowRect = u32.func('bool __stdcall GetWindowRect(void* h, _Out_ RECT_C* r)')
const SetWindowPos = u32.func('bool __stdcall SetWindowPos(void* h, intptr after, int x, int y, int cx, int cy, uint32 flags)')
const SetCursorPos = u32.func('bool __stdcall SetCursorPos(int x, int y)')
const mouse_event = u32.func('void __stdcall mouse_event(uint32 f, uint32 dx, uint32 dy, uint32 d, uintptr e)')
void RECT

/** A real click on the test companion's sidebar heading, so it is the foreground app. */
function clickCompanion(): void {
  const h = FindWindowW(null, 'Ultima IV Companion')
  if (!h) throw new Error('The test companion window was not found')
  SetWindowPos(h, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010) // topmost, so nothing covers the click
  const r: Record<string, number> = {}
  GetWindowRect(h, r)
  SetCursorPos(r.left! + 120, r.top! + 120) // the "Ultima IV" heading, clear of buttons
  mouse_event(0x0002, 0, 0, 0, 0)
  mouse_event(0x0004, 0, 0, 0, 0)
  SetWindowPos(h, -2, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 2
})
