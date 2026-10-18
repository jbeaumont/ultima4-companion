// Hill-climb journey: recruit Iolo in Britain. Checks what the companion says
// about who can join before, and the party after.
//   npx tsx scripts/hillclimb/recruit.ts <outDir>
// Joining (u4-decompiled U4_TALK.C TLK_join): each town from Moonglow (5) to
// Magincia (12) has one companion (talk index 1, NPC slot 31) of class = town - 5.
// They refuse if they share the Avatar's class, if the town's virtue is below 40
// (0 counts as Avatar), or if the Avatar's max HP is below 100 x (party size + 1).
// Iolo stands at 28,29 in Britain; talk, then type "join".
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { ENTRANCES } from '../../src/domain/places'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const BRITAIN = 6
const IOLO = { x: 28, y: 29 }
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
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const s0 = parsePartySav(raw)
  if (s0.memberCount !== 1) throw new Error('expected a lone Avatar in the save')
  s0.x = ENTRANCES[BRITAIN]!.x
  s0.y = ENTRANCES[BRITAIN]!.y
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = [s0.allRecords[0]!.name]
  const me = s0.allRecords[0]!
  log(`test save: ${me.name} (max HP ${me.hpMax}, Compassion ${s0.karma[1]}) at Britain's gate`)

  const c = await Companion.connect()
  const capture = async (tag: string, views: string[]) => {
    const texts: Record<string, string> = {}
    for (const v of views) {
      texts[v] = await c.view(v, 700)
      writeFileSync(join(OUT, `${tag}-${v}.txt`), texts[v]!)
      await c.shot(join(OUT, `${tag}-${v}.png`))
    }
    log(`captured ${tag}`)
    return texts
  }
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)

  const a = await capture('1-before', ['Dashboard'])
  const card = (text: string, name: string) => text.slice(text.indexOf(name), text.indexOf(name) + 80)
  log(`Iolo's card: ${card(a['Dashboard']!, 'Iolo').replace(/\n/g, ' | ')}`)
  expect(/can join|ready to join/i.test(card(a['Dashboard']!, 'Iolo')), "Iolo's card says Iolo can join now")

  await d.enter()
  // stand next to Iolo
  let s = d.state()
  let dir: 'up' | 'down' | 'left' | 'right' | null = null
  for (const [dx, dy, k] of [[-1, 0, 'right'], [0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left']] as const) {
    try {
      s = await d.walkTo(IOLO.x + dx, IOLO.y + dy)
      dir = k
      break
    } catch {
      // try another side
    }
  }
  if (!dir) throw new Error('could not reach Iolo')
  log(`beside Iolo at ${s.x},${s.y}`)
  d.key('t')
  await sleep(200)
  d.key(dir)
  await sleep(1500)
  await d.type('join')
  s = await d.waitFor((p) => p.memberCount === 2, 6000, 'Iolo to join')
  await sleep(800)
  await d.type('bye')
  await sleep(1500)
  log(`party: ${s.members.map((m) => `${m.name} ${m.hp}/${m.hpMax}`).join(', ')}`)

  const b = await capture('2-after', ['Dashboard', 'Tracker'])
  expect(/In your party/.test(card(b['Dashboard']!, 'Iolo')), "Iolo's card says Iolo is in the party")
  expect(/Iolo/.test(b['Tracker']!), 'Tracker lists Iolo')

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
