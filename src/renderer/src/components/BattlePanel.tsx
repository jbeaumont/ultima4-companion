import { useEffect, useRef, useState } from 'react'
import { BATTLE_SIZE, woundText } from '@parsers/battle'
import type { BattleMonster, BattleState } from '@parsers/battle'
import type { PartySave } from '@parsers/party'
import { buildAtlas, drawTile } from '../canvas/tiles'
import type { TileAtlas } from '../canvas/tiles'

const CELL = 32

function useAtlas(): TileAtlas | null {
  const [atlas, setAtlas] = useState<TileAtlas | null>(null)
  useEffect(() => {
    let live = true
    window.u4.getBaseAssets().then((a) => {
      if (live && a) setAtlas(buildAtlas(a.shapes))
    }, () => {})
    return () => {
      live = false
    }
  }, [])
  return atlas
}

/** The battle in progress: the 11x11 field with every fighter, monster HP and the party. */
export function BattlePanel({ battle, party }: { battle: BattleState; party: PartySave }) {
  const atlas = useAtlas()
  const ref = useRef<HTMLCanvasElement>(null)
  // monsters start with random HP, so measure each against the HP it had when first seen
  const startHp = (m: BattleMonster): number => Math.max(m.startHp ?? 0, m.hp)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !atlas) return
    battle.map.forEach((t, i) => drawTile(ctx, atlas, t, (i % BATTLE_SIZE) * CELL, Math.floor(i / BATTLE_SIZE) * CELL, CELL))
    for (const m of battle.monsters) drawTile(ctx, atlas, m.tile, m.x * CELL, m.y * CELL, CELL)
    battle.party.forEach((p, i) => {
      if (!p) return
      drawTile(ctx, atlas, p.tile, p.x * CELL, p.y * CELL, CELL)
      if (i === battle.active) {
        ctx.strokeStyle = '#f2cf7a'
        ctx.lineWidth = 2
        ctx.strokeRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2)
      }
    })
  }, [battle, atlas])

  const left = battle.monsters.length
  const where = battle.mode === 5 ? 'Ambush while camping' : battle.room ? 'Dungeon room' : 'Battle'
  const advice = battle.room
    ? left
      ? 'Clear the room, then everyone leaves by the same edge.'
      : 'Room clear: walk everyone off one edge to leave.'
    : left
      ? 'Win, or flee by walking off the edge (fleeing costs Valor).'
      : 'Victory!'
  const monsters = [...battle.monsters].sort((a, b) => a.hp - b.hp)

  return (
    <section className="panel battle">
      <h3>{where} · {left ? `${left} ${left === 1 ? 'foe' : 'foes'} left` : 'no foes left'}</h3>
      <div className="battle-body">
        <canvas ref={ref} width={BATTLE_SIZE * CELL} height={BATTLE_SIZE * CELL} className="battle-field" />
        <div className="battle-side">
          <p className="muted small">{advice}</p>
          <ul className="battle-list">
            {monsters.map((m) => {
              const full = startHp(m)
              return (
                <li key={m.slot}>
                  <span className="b-name">{m.name}</span>
                  <span className="b-bar"><span style={{ width: `${full ? Math.min(100, (m.hp / full) * 100) : 0}%` }} /></span>
                  <span className="b-hp">{m.hp} · {m.hp < full ? woundText(m.hp, m.maxHp) : 'Unhurt'}</span>
                </li>
              )
            })}
          </ul>
          <ul className="battle-list party">
            {party.members.map((m, i) => (
              <li key={m.name} className={i === battle.active && battle.party[i] ? 'active' : battle.party[i] ? '' : 'gone'}>
                <span className="b-name">{m.name}</span>
                <span className="b-bar mine"><span style={{ width: `${m.hpMax ? Math.min(100, (m.hp / m.hpMax) * 100) : 0}%` }} /></span>
                <span className="b-hp">{m.hp}/{m.hpMax}{m.status !== 'G' ? ` · ${m.status === 'P' ? 'poisoned' : m.status === 'S' ? 'asleep' : 'dead'}` : ''}{battle.party[i] ? '' : ' · off the field'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
