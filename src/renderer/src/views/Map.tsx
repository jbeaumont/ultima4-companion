import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCATIONS } from '@domain/constants'
import { cellStyle, isRoomCell, roomIndex } from '@domain/dungeonGlyphs'
import { tileName } from '@domain/tiles'
import { DUNGEON_LEVELS, DUNGEON_SIZE, ROOM_SIZE, decodeDungeonCell, parseDng } from '@parsers/dungeon'
import type { Dungeon } from '@parsers/dungeon'
import type { PartySave } from '@parsers/party'
import { parseTlk } from '@parsers/talk'
import type { Conversation } from '@parsers/talk'
import { TOWN_SIZE, parseUlt } from '@parsers/town'
import type { Town } from '@parsers/town'
import { WORLD_SIZE, parseWorldMap } from '@parsers/worldMap'
import type { GameState } from '@shared/types'
import { MapCanvas } from '../canvas/MapCanvas'
import type { DrawArgs } from '../canvas/MapCanvas'
import { buildAtlas, drawGrid, drawTile } from '../canvas/tiles'
import type { TileAtlas } from '../canvas/tiles'
import { tilePx, tileToScreen } from '../canvas/viewport'

const AVATAR_TILE = 31

interface Base {
  atlas: TileAtlas
  world: Uint8Array
}

type Place =
  | { kind: 'world' }
  | { kind: 'settlement'; floors: Town[]; convs: Conversation[] }
  | { kind: 'dungeon'; dungeon: Dungeon }

type Loaded<T> = { status: 'loading' } | { status: 'fail' } | { status: 'ok'; value: T }

const SETTLEMENTS = Object.entries(LOCATIONS).filter(([, l]) => l.kind === 'castle' || l.kind === 'town')
const DUNGEONS = Object.entries(LOCATIONS).filter(([, l]) => l.kind === 'dungeon')

/** Marker for the party: the Avatar tile plus a pulsing ring so it stands out at any zoom. */
function drawParty(a: DrawArgs, atlas: TileAtlas, tx: number, ty: number): void {
  const { ctx, vp, time } = a
  const t = tilePx(vp.zoom)
  const s = tileToScreen(vp, tx, ty)
  drawTile(ctx, atlas, AVATAR_TILE, Math.floor(s.x), Math.floor(s.y), Math.max(1, Math.round(t)))
  const pulse = 0.5 + 0.5 * Math.sin(time / 280)
  const r = Math.max(t * 0.8, 9) + pulse * 3
  ctx.beginPath()
  ctx.arc(s.x + t / 2, s.y + t / 2, r, 0, Math.PI * 2)
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = `rgba(255,225,70,${0.6 + 0.4 * pulse})`
  ctx.stroke()
}

function WorldMap({ base, party, center }: { base: Base; party: PartySave | null; center: number }) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const here = party && party.location === 0 ? party : null
  const draw = (a: DrawArgs): void => {
    drawGrid(a.ctx, base.atlas, a.vp, WORLD_SIZE, WORLD_SIZE, a.w, a.h, (x, y) => base.world[y * WORLD_SIZE + x]!)
    if (here) drawParty(a, base.atlas, here.x, here.y)
  }
  const tile = hover ? base.world[hover.y * WORLD_SIZE + hover.x]! : null
  return (
    <>
      <MapCanvas
        mapW={WORLD_SIZE} mapH={WORLD_SIZE} resetKey="world" initialZoom={here ? 1 : 'fit'}
        center={here ? { x: here.x, y: here.y, seq: center } : undefined}
        animate={!!here} draw={draw} onHover={setHover}
      />
      <div className="readout">
        {hover && tile !== null ? `${hover.x}, ${hover.y} — ${tileName(tile)}` : 'Drag to pan, scroll to zoom'}
        {here && <span className="muted"> · Party at {here.x}, {here.y}</span>}
      </div>
    </>
  )
}

function SettlementMap(props: {
  base: Base; id: number; floors: Town[]; convs: Conversation[]; floor: number; party: PartySave | null; center: number
}) {
  const { base, id, floors, convs, floor, party, center } = props
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const town = floors[floor] ?? floors[0]!
  const here = party && party.location === id ? party : null
  const draw = (a: DrawArgs): void => {
    drawGrid(a.ctx, base.atlas, a.vp, TOWN_SIZE, TOWN_SIZE, a.w, a.h, (x, y) => town.tiles[y * TOWN_SIZE + x]!)
    const t = tilePx(a.vp.zoom)
    const size = Math.max(1, Math.round(t))
    for (const n of town.npcs) {
      const s = tileToScreen(a.vp, n.x, n.y)
      drawTile(a.ctx, base.atlas, n.tile, Math.floor(s.x), Math.floor(s.y), size)
    }
    if (here) drawParty(a, base.atlas, here.x, here.y)
  }
  const npc = hover ? town.npcs.find((n) => n.x === hover.x && n.y === hover.y) : undefined
  const conv = npc ? convs.find((c) => c.index === npc.talkIndex) : undefined
  return (
    <>
      <MapCanvas
        mapW={TOWN_SIZE} mapH={TOWN_SIZE} resetKey={`s${id}-${floor}`} initialZoom="fit"
        center={here ? { x: here.x, y: here.y, seq: center } : undefined}
        animate={!!here} draw={draw} onHover={setHover}
      />
      <div className="readout">
        {hover ? `${hover.x}, ${hover.y} — ${tileName(town.tiles[hover.y * TOWN_SIZE + hover.x]!)}` : 'Hover an NPC for details'}
        {npc && (
          <span>
            {' · '}
            <b>{conv?.name ?? 'Unnamed'}</b>
            {conv?.description ? ` — ${conv.description}` : npc.talkIndex === 0 ? ' (no conversation)' : ''}
          </span>
        )}
        {here && (
          <span className="muted">
            {' · '}Party at {here.x}, {here.y}{floors.length > 1 ? ' (floor unknown, shown on both)' : ''}
          </span>
        )}
      </div>
    </>
  )
}

function RoomView({ dungeon, room, base }: { dungeon: Dungeon; room: number; base: Base }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const r = dungeon.rooms[room]
  const px = 32
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !r) return
    for (let y = 0; y < ROOM_SIZE; y++)
      for (let x = 0; x < ROOM_SIZE; x++) drawTile(ctx, base.atlas, r.tiles[y * ROOM_SIZE + x]!, x * px, y * px, px)
    for (const m of r.monsters) drawTile(ctx, base.atlas, m.tile, m.x * px, m.y * px, px)
  }, [r, base])
  if (!r) return <p className="muted">Room {room} is not in this dungeon file.</p>
  return (
    <div>
      <h4>Room {room} · {r.monsters.length} monster{r.monsters.length === 1 ? '' : 's'}</h4>
      <canvas ref={ref} width={ROOM_SIZE * px} height={ROOM_SIZE * px} className="room-canvas" />
    </div>
  )
}

function DungeonMap(props: { base: Base; id: number; dungeon: Dungeon; level: number; onLevel: (l: number) => void; party: PartySave | null }) {
  const { base, id, dungeon, level, onLevel, party } = props
  const [room, setRoom] = useState<number | null>(null)
  const [hover, setHover] = useState<string>('')
  useEffect(() => setRoom(null), [id, level])
  const here = party && party.location === id ? party : null
  const cells = dungeon.levels[level]!
  return (
    <div className="dungeon">
      <div className="levels">
        {Array.from({ length: DUNGEON_LEVELS }, (_, l) => (
          <button key={l} className={`btn small${l === level ? ' active' : ''}`} onClick={() => onLevel(l)}>
            {l + 1}{here && here.dungeonLevel === l ? ' ●' : ''}
          </button>
        ))}
      </div>
      <div className="dungeon-body">
        <div>
          <div className="dgrid">
            {Array.from({ length: DUNGEON_SIZE * DUNGEON_SIZE }, (_, i) => {
              const x = i % DUNGEON_SIZE
              const y = Math.floor(i / DUNGEON_SIZE)
              const cell = decodeDungeonCell(cells[i]!)
              const st = cellStyle(cell)
              const isParty = !!here && here.dungeonLevel === level && here.dungeonX === x && here.dungeonY === y
              const clickable = isRoomCell(cell)
              const roomNo = clickable ? roomIndex(cell, level, id) : -1
              return (
                <div
                  key={i}
                  className={`dcell${isParty ? ' party' : ''}${clickable ? ' room' : ''}${clickable && room === roomNo ? ' sel' : ''}`}
                  style={{ background: st.bg, color: st.color }}
                  title={`${x}, ${y} — ${st.label}`}
                  onMouseEnter={() => setHover(`${x}, ${y} — ${st.label}`)}
                  onClick={clickable ? () => setRoom(roomNo) : undefined}
                >
                  {isParty ? <span className="pmark">@</span> : st.glyph}
                </div>
              )
            })}
          </div>
          <div className="readout">{hover || 'Click a room cell to see its map'}</div>
        </div>
        {room !== null && <RoomView dungeon={dungeon} room={room} base={base} />}
      </div>
    </div>
  )
}

export function MapView({ state }: { state: GameState | null }) {
  const gameDir = state?.gameDir ?? null
  const party = state?.party ?? null
  const [base, setBase] = useState<Loaded<Base>>({ status: 'loading' })
  const [sel, setSel] = useState(0)
  const [follow, setFollow] = useState(true)
  const [floor, setFloor] = useState(0)
  const [level, setLevel] = useState(0)
  const [centerSeq, setCenterSeq] = useState(0)
  const [place, setPlace] = useState<Loaded<Place>>({ status: 'ok', value: { kind: 'world' } })
  const cache = useRef(new Map<number, Place>())

  useEffect(() => {
    cache.current.clear()
    if (!gameDir) return
    let live = true
    setBase({ status: 'loading' })
    window.u4.getBaseAssets().then((a) => {
      if (!live) return
      try {
        if (!a) throw new Error('missing')
        setBase({ status: 'ok', value: { atlas: buildAtlas(a.shapes), world: parseWorldMap(a.world) } })
      } catch {
        setBase({ status: 'fail' })
      }
    }, () => live && setBase({ status: 'fail' }))
    return () => {
      live = false
    }
  }, [gameDir])

  useEffect(() => {
    if (sel === 0) return setPlace({ status: 'ok', value: { kind: 'world' } })
    const hit = cache.current.get(sel)
    if (hit) return setPlace({ status: 'ok', value: hit })
    let live = true
    setPlace({ status: 'loading' })
    window.u4.getLocationAssets(sel).then((a) => {
      if (!live) return
      try {
        if (!a) throw new Error('missing')
        const value: Place = a.kind === 'dungeon'
          ? { kind: 'dungeon', dungeon: parseDng(a.files.dng!) }
          : {
              kind: 'settlement',
              floors: [a.files.ult!, a.files.ult2].filter((f): f is Uint8Array => !!f).map(parseUlt),
              convs: a.files.tlk ? parseTlk(a.files.tlk) : []
            }
        cache.current.set(sel, value)
        setPlace({ status: 'ok', value })
      } catch {
        setPlace({ status: 'fail' })
      }
    }, () => live && setPlace({ status: 'fail' }))
    return () => {
      live = false
    }
  }, [sel, gameDir])

  // follow the party: location, dungeon level, and recentering on movement
  const loc = party?.location
  const lvl = party?.dungeonLevel
  useEffect(() => {
    if (!follow || loc === undefined) return
    setSel(LOCATIONS[loc]?.file ? loc : 0)
    setFloor(0)
  }, [follow, loc])
  useEffect(() => {
    if (follow && lvl !== undefined && lvl < DUNGEON_LEVELS) setLevel(lvl)
  }, [follow, lvl, loc])
  const px = party?.x
  const py = party?.y
  useEffect(() => {
    if (follow) setCenterSeq((n) => n + 1)
  }, [follow, px, py, loc])
  const recenter = useCallback(() => setCenterSeq((n) => n + 1), [])

  if (!state || state.status === 'noGame') {
    return (
      <div className="panel">
        <h3>Map</h3>
        <p className="muted">{state?.message ?? 'Ultima IV install not found.'} Choose the game folder in Settings to see the maps.</p>
      </div>
    )
  }

  const choose = (id: number): void => {
    setFollow(false)
    setSel(id)
    setFloor(0)
  }
  const kind = sel === 0 ? 'world' : LOCATIONS[sel]?.kind
  const inShrine = loc !== undefined && LOCATIONS[loc]?.kind === 'shrine'

  let body: React.ReactNode
  if (base.status === 'loading') body = <p className="muted">Loading map assets...</p>
  else if (base.status === 'fail') {
    body = <p className="muted">Could not load SHAPES.EGA or WORLD.MAP from the game folder.</p>
  } else if (place.status === 'loading') body = <p className="muted">Loading...</p>
  else if (place.status === 'fail') body = <p className="muted">Could not load the files for this location.</p>
  else {
    const p = place.value
    if (p.kind === 'world') body = <WorldMap base={base.value} party={party} center={centerSeq} />
    else if (p.kind === 'settlement') {
      body = <SettlementMap base={base.value} id={sel} floors={p.floors} convs={p.convs} floor={floor} party={party} center={centerSeq} />
    } else body = <DungeonMap base={base.value} id={sel} dungeon={p.dungeon} level={level} onLevel={(l) => { setFollow(false); setLevel(l) }} party={party} />
  }

  return (
    <div className="map-view">
      <div className="toolbar">
        <select value={sel} onChange={(e) => choose(Number(e.target.value))}>
          <option value={0}>Britannia</option>
          <optgroup label="Settlements">
            {SETTLEMENTS.map(([id, l]) => <option key={id} value={id}>{l.name}</option>)}
          </optgroup>
          <optgroup label="Dungeons">
            {DUNGEONS.map(([id, l]) => <option key={id} value={id}>{l.name}</option>)}
          </optgroup>
        </select>
        <label className="check">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow party
        </label>
        {kind !== 'dungeon' && party && <button className="btn small" onClick={recenter}>Center on party</button>}
        {kind === 'castle' && place.status === 'ok' && place.value.kind === 'settlement' && place.value.floors.length > 1 && (
          <span className="levels">
            {['Ground floor', 'Upper floor'].map((n, i) => (
              <button key={n} className={`btn small${i === floor ? ' active' : ''}`} onClick={() => setFloor(i)}>{n}</button>
            ))}
          </span>
        )}
        {inShrine && <span className="muted small">Party is in {LOCATIONS[loc]?.name}</span>}
        {!party && <span className="muted small">No party data yet</span>}
      </div>
      <div className="map-body">{body}</div>
    </div>
  )
}
