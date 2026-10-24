// Hill-climb journey: spells and keyword conversations. A poisoned Avatar casts
// Cure on itself, then walks into Moonglow and talks to Cromwell: his name,
// "honesty" (which raises his question), yes, then "mantra". Checks the game
// (the cure, the virtue-conversation timer the question sets) and the companion
// (Cromwell marked as talked to).
//   npx tsx scripts/hillclimb/conversation.ts <outDir>
// Talk flow (u4-decompiled U4_TALK.C): T + direction, then keywords matched on
// their first four letters; a person's question follows its trigger keyword
// after a keypress and takes Y or N, which also sets the conversation timer.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const CROMWELL = 3 // talk index in MOONGLOW.TLK
const CURE = 2
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
  const me = s0.allRecords[0]!
  me.status = 'P'
  me.mp = Math.max(me.mp, 20)
  s0.mixtures[CURE] = Math.max(s0.mixtures[CURE]!, 1)
  s0.moves = Math.max(s0.moves, 200)
  s0.lastVirtueTalk = 0
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

  const c = await Companion.connect()
  await c.freshJournal()
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  let s = await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)

  // a spell outside battle: Cure on the Avatar
  await d.castSpell('c', { caster: 0, who: 0 })
  s = await d.waitFor((p) => p.allRecords[0]!.status === 'G', 4000, 'the cure').catch(() => d.state())
  expect(s.allRecords[0]!.status === 'G' && s.mixtures[CURE]! < s0.mixtures[CURE]!, 'Cure cast outside battle cures the Avatar and uses a mixture')

  // into Moonglow and talk to Cromwell
  await d.walkTo(232, 135)
  await d.enter()
  const conv = await d.talkTo(CROMWELL)
  log(`talking to ${conv.name}`)
  expect(conv.name === 'Cromwell', 'the game loaded Cromwell\'s record')
  const name = await d.ask('name')
  log(`name: ${name.join(' / ')}`)
  const honesty = await d.ask('honesty')
  log(`honesty: ${honesty.join(' / ')}`)
  expect(/Dost thou strive/.test(honesty.join(' ')), 'asking about honesty raises his question')
  const before = d.state()
  const yes = await d.answer(true)
  log(`yes: ${yes.join(' / ')}`)
  s = await d.waitFor((p) => p.lastVirtueTalk !== before.lastVirtueTalk, 4000, 'the conversation timer').catch(() => d.state())
  expect(s.lastVirtueTalk === Math.floor(s.moves / 16) % 0x10000, `answering sets the virtue-conversation timer in the game (${before.lastVirtueTalk} -> ${s.lastVirtueTalk})`)
  const mantra = await d.ask('mantra')
  log(`mantra: ${mantra.join(' / ')}`)
  expect(/AHM/.test(mantra.join(' ')), 'asking about the mantra gives it')
  await d.bye()
  await sleep(1000)

  const met = await c.eval<string[]>('window.u4.getJournal().then((j) => j.met)')
  expect(met.includes('5|Cromwell'), `the companion records talking to Cromwell (met: ${met.join(', ') || 'none'})`)
  const dialogue = await c.view('Dialogue', 800)
  writeFileSync(join(OUT, 'Dialogue.txt'), dialogue)
  expect(/Cromwell[^]*?✓ talked/.test(dialogue), 'Dialogue marks Cromwell as talked to')

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
