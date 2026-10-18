// Measures how long the test companion takes to go live after Journey Onward.
//   npx tsx scripts/hillclimb/probe-attach.ts
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { readFileSync } from 'node:fs'
import { launchGame } from '../../src/main/launcher'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')

async function main(): Promise<void> {
  const save = parsePartySav(new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV'))))
  const names = save.allRecords.slice(0, Math.max(1, save.memberCount)).map((r) => r.name)
  const c = await Companion.connect()
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  const t = Date.now()
  const ok = await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 30000)
  console.log(ok ? `live ${Date.now() - t} ms after the party appeared in memory` : 'not live after 30 s')
  process.kill(d.pid)
  d.close()
  c.close()
}
main()
