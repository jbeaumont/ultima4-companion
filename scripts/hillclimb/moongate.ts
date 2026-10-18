// Hill-climb journey: wait beside the Moonglow moongate, step through when it
// opens, and check the companion predicted where it leads.
//   npx tsx scripts/hillclimb/moongate.ts <outDir>
// Moongates (u4-decompiled U4_MAP.C C_2A91): the gate that is open follows
// Trammel's phase; stepping onto it lands you at the gate of Felucca's phase.
// Moons advance on the game's animation timer, so at turbo speed they spin fast.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { MOONGATES } from '../../src/domain/moongates'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const GATE = MOONGATES[0]! // Moonglow
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const s0 = parsePartySav(new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV'))))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

  const c = await Companion.connect()
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  await d.walkTo(GATE.x, GATE.y + 1)
  log(`beside the ${GATE.near} gate at ${GATE.x},${GATE.y + 1}`)
  await c.view('Dashboard')

  // step north onto the gate's cell; if it is closed we just stand on grass, so step back and try again
  let chip = ''
  let felucca = -1
  for (let attempt = 0; attempt < 120; attempt++) {
    await d.waitFor((p) => p.trammel === GATE.phase, 30000, `Trammel to reach phase ${GATE.phase}`)
    chip = await c.eval<string>(`[...document.querySelectorAll('.d-chip')].map((e) => e.textContent).find((t) => t.startsWith('Moongate')) ?? ''`)
    felucca = d.state().felucca
    const r = await d.press('up')
    const s = r.after
    if (s.x === GATE.x && s.y === GATE.y) {
      await d.press('down')
      continue
    }
    if (s.x !== GATE.x || s.y !== GATE.y + 1) {
      log(`through the gate after ${attempt + 1} tries: now at ${s.x},${s.y} (Felucca was ${felucca})`)
      const want = MOONGATES[felucca]!
      expect(s.x === want.x && s.y === want.y, `landed at the ${want.near} gate, as Felucca's phase says`)
      // at turbo a Felucca phase lasts about a second, so allow the 250 ms poll to be one phase behind
      const prev = MOONGATES[(felucca + 7) % 8]!
      const exact = chip.includes(`${GATE.near} → ${want.near}`)
      expect(exact || chip.includes(`${GATE.near} → ${prev.near}`), `the Dashboard chip predicted it ("${chip}"${exact ? '' : ', one phase behind at turbo speed'})`)
      await sleep(800)
      writeFileSync(join(OUT, 'after-Dashboard.txt'), await c.view('Dashboard', 700))
      await c.shot(join(OUT, 'after-Dashboard.png'))
      writeFileSync(join(OUT, 'after-Journal.txt'), await c.view('Journal', 700))
      break
    }
  }
  if (felucca < 0) throw new Error('never got through the gate')

  writeFileSync(join(OUT, 'findings.txt'), findings.join('\n'))
  log(`${findings.length} gap(s); captures in ${OUT}`)
  process.kill(d.pid)
  d.close()
  c.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
