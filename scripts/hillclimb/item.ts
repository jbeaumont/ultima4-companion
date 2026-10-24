// Hill-climb journey: check a quest item's hint in the game. The test save puts
// the party at the hinted spot (aboard a ship at sea, on foot elsewhere), waits
// for new moons where the game demands them, searches, and checks the game and
// the companion. "abyss" uses the bell, book and candle at the Abyss entrance.
// Getting there (sailing, flying) is not played: the game's search only checks
// the place, so this verifies the spot, the conditions and the companion.
//   npx tsx scripts/hillclimb/item.ts <outDir> <bell|wheel|horn|skull|black|white|book|candle|armour|weapons|abyss>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import type { PartySave } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { ITEM_FLAGS } from '../../src/domain/constants'
import { ENTRANCES, SECRET_SPOTS } from '../../src/domain/places'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const WHICH = process.argv[3] ?? 'horn'
const SHIP = 0x10
const ON_FOOT = 0x1f

interface Case {
  /** A town or castle to enter first (the spot is then on its map). */
  town?: number
  /** Set up anything else the game requires (e.g. all eight Avatarhoods). */
  prepare?: (p: PartySave) => void
  spot: { x: number; y: number }
  transport: number
  newMoons?: boolean
  found: (p: PartySave) => boolean
  clear: (p: PartySave) => void
  checklist: string
  hint: string
}
const item = (flag: keyof typeof ITEM_FLAGS) => ({
  found: (p: PartySave) => (p.items & ITEM_FLAGS[flag]) !== 0,
  clear: (p: PartySave) => void (p.items &= ~ITEM_FLAGS[flag])
})
const stone = (bit: number) => ({
  found: (p: PartySave) => (p.stones & (1 << bit)) !== 0,
  clear: (p: PartySave) => void (p.stones &= ~(1 << bit))
})
const CASES: Record<string, Case> = {
  bell: { spot: SECRET_SPOTS.bell, transport: SHIP, ...item('bell'), checklist: 'The Bell', hint: 'The Bell of Courage' },
  wheel: { spot: SECRET_SPOTS.wheel, transport: SHIP, ...item('wheel'), checklist: 'Wheel of H.M.S. Cape', hint: 'The Wheel of the H.M.S. Cape' },
  horn: { spot: SECRET_SPOTS.horn, transport: ON_FOOT, ...item('horn'), checklist: 'Silver Horn', hint: 'The Silver Horn' },
  skull: { spot: SECRET_SPOTS.skull, transport: SHIP, newMoons: true, ...item('skull'), checklist: 'Skull of Mondain', hint: 'The Skull of Mondain' },
  black: { spot: SECRET_SPOTS.blackStone, transport: ON_FOOT, newMoons: true, ...stone(7), checklist: 'Black Stone', hint: 'Black Stone (Humility)' },
  white: { spot: SECRET_SPOTS.whiteStone, transport: ON_FOOT, ...stone(6), checklist: 'White Stone', hint: 'White Stone (Spirituality)' },
  book: { town: 2, spot: { x: 6, y: 6 }, transport: ON_FOOT, ...item('book'), checklist: 'The Book', hint: 'The Book of Truth' },
  candle: { town: 16, spot: { x: 22, y: 1 }, transport: ON_FOOT, ...item('candle'), checklist: 'The Candle', hint: 'The Candle of Love' },
  // Mystic Arms: only for an eight-part Avatar who has none yet (U4_SRCH.C)
  armour: {
    town: 3, spot: { x: 22, y: 4 }, transport: ON_FOOT, prepare: avatar8,
    found: (p) => p.armorCounts[7]! > 0, clear: (p) => void (p.armorCounts[7] = 0), checklist: '', hint: ''
  },
  weapons: {
    town: 4, spot: { x: 8, y: 15 }, transport: ON_FOOT, prepare: avatar8,
    found: (p) => p.weaponCounts[15]! > 0, clear: (p) => void (p.weaponCounts[15] = 0), checklist: '', hint: ''
  }
}
function avatar8(p: PartySave): void {
  p.karma = p.karma.map(() => 0)
}

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
  const abyss = WHICH === 'abyss'
  const c0 = CASES[WHICH]
  if (!abyss && !c0) throw new Error(`unknown item ${WHICH}`)
  if (abyss) {
    // standing at the Abyss entrance with the bell, book and candle, none used yet
    s0.x = 233
    s0.y = 233
    s0.items = (s0.items | ITEM_FLAGS.bell | ITEM_FLAGS.book | ITEM_FLAGS.candle) & ~(ITEM_FLAGS.bellUsed | ITEM_FLAGS.bookUsed | ITEM_FLAGS.candleUsed)
    s0.transport = ON_FOOT
  } else {
    c0!.clear(s0)
    c0!.prepare?.(s0)
    const at = c0!.town ? ENTRANCES[c0!.town]! : c0!.spot
    s0.x = at.x
    s0.y = at.y
    s0.transport = c0!.transport
    s0.mixtures[3] = Math.max(s0.mixtures[3]!, 6) // Dispel and keys, for town ways that need them
    s0.keys = Math.max(s0.keys, 2)
    s0.allRecords[0]!.mp = Math.max(s0.allRecords[0]!.mp, 99)
  }
  s0.balloonOrTorch = 0
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

  const c = await Companion.connect()
  await c.freshJournal()
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  let s = await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  log(`at ${s.x},${s.y} (transport 0x${s.transport.toString(16)}), moons ${s.trammel}/${s.felucca}`)

  if (abyss) {
    for (const [name, flag] of [['bell', 'bellUsed'], ['book', 'bookUsed'], ['candle', 'candleUsed']] as const) {
      d.key('u')
      await sleep(300)
      await d.type(name)
      s = await d.waitFor((p) => (p.items & ITEM_FLAGS[flag]) !== 0, 4000, `the ${name} to be used`).catch(() => d.state())
      expect((s.items & ITEM_FLAGS[flag]) !== 0, `using the ${name} at the Abyss entrance works (in order)`)
    }
    await sleep(1000)
    const journal = await c.view('Journal', 700)
    expect(/✓ Bell used at the Abyss[^]*✓ Book used at the Abyss[^]*✓ Candle used at the Abyss/.test(journal), 'Journal ticks all three uses')
  } else {
    const k = c0!
    if (k.town) {
      s = await d.enter()
      expect(s.location === k.town, `entered location ${k.town}`)
      s = await d.walkTo(k.spot.x, k.spot.y, 600, { dispel: true, unlock: true })
    }
    if (k.newMoons) {
      // first under other moons: the game must refuse (U4_SRCH.C)
      s = await d.waitFor((p) => p.trammel !== 0 || p.felucca !== 0, 60000, 'moons that are not both new')
      await d.search()
      await sleep(300)
      expect(!k.found(d.state()), `searching under moons ${s.trammel}/${s.felucca} finds nothing, as the hint warns`)
    }
    let found = false
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      if (k.newMoons) {
        // the game finds it only while both moons are new; at turbo speed they come round every few seconds
        s = await d.waitFor((p) => p.trammel === 0 && p.felucca === 0, 60000, 'new moons')
      }
      await d.search()
      await sleep(300)
      found = k.found(d.state())
      if (!found && !k.newMoons) break
    }
    expect(found, `searching at ${k.spot.x},${k.spot.y}${k.newMoons ? ' under new moons' : ''} finds it`)
    await sleep(1000)
    const journal = await c.view('Journal', 700)
    const hints = await c.view('Hints', 700)
    if (k.checklist) expect(journal.includes(`✓ ${k.checklist}`), `Journal ticks ${k.checklist}`)
    const esc = k.hint.replace(/[().]/g, (m) => `\\${m}`)
    if (k.hint) expect(new RegExp(`${esc}\\s*Solved`).test(hints), `Hints mark "${k.hint}" solved`)
  }

  writeFileSync(join(OUT, `findings-${WHICH}.txt`), findings.join('\n'))
  log(`${findings.length} gap(s)`)
  process.kill(d.pid)
  d.close()
  c.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
