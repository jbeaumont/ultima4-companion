// Scenario: find the Rune of Honesty in Moonglow, fully scripted.
//   npx tsx scripts/driver/scenarios/moonglow-rune.ts
// Prepares a test save (a copy of the real save with the rune removed), launches
// the turbo test DOSBox, walks to Moonglow, enters, walks to town 8,6, searches,
// and checks the rune bit in live memory. Never touches the real saves.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../../src/parsers/party'
import { encodePartySav } from '../../../src/parsers/partyWriter'
import { launchGame } from '../../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../../src/main/memory/win32'
import { GameDriver } from '../driver'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

async function main(): Promise<void> {
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')

  // 1. test save = real save without the Rune of Honesty (read-only on the real save)
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const save = parsePartySav(raw)
  save.runes &= ~1
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(save, raw))
  const names = save.allRecords.slice(0, Math.max(1, save.memberCount)).map((r) => r.name)
  log(`test save ready: ${names.join(', ')} at ${save.x},${save.y}, runes=${save.runes}`)

  // 2. launch the turbo test game and get into play
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  log(`DOSBox ${d.pid} up (foreground: ${d.inForeground()})`)
  let s = await d.journeyOnward()
  log(`in game at ${s.x},${s.y} (location ${s.location}, moves ${s.moves})`)

  // 3. walk to Moonglow and enter
  s = await d.walkTo(232, 135)
  log(`at Moonglow's gate ${s.x},${s.y}`)
  s = await d.enter()
  log(`entered location ${s.location} at ${s.x},${s.y}`)
  if (s.location !== 5) throw new Error('expected Moonglow (5)')

  // 4. walk to the rune spot and search
  s = await d.walkTo(8, 6)
  log(`at ${s.x},${s.y}; searching`)
  s = await d.search()
  const ok = (s.runes & 1) !== 0
  log(ok ? 'PASS: Rune of Honesty found (rune bit set in live memory)' : `FAIL: runes=${s.runes}`)
  d.close()
  process.exitCode = ok ? 0 : 1
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
