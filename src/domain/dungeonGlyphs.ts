// Glyph and colour for each dungeon cell feature; pure so the map view and tests share it.
import type { DungeonCell } from '@parsers/dungeon'

export interface CellStyle {
  glyph: string
  color: string
  bg: string
  label: string
}

const FIELDS = [
  { name: 'Poison field', color: '#5fbf7a' },
  { name: 'Energy field', color: '#4f8fe8' },
  { name: 'Fire field', color: '#e8573f' },
  { name: 'Sleep field', color: '#a56ae0' }
]
const FOUNTAINS = ['Fountain', 'Healing fountain', 'Acid fountain', 'Cure fountain', 'Poison fountain']
const TRAPS: Record<number, string> = { 0: 'Winds trap', 1: 'Falling rock trap', 14: 'Pit trap' }

const FLOOR = '#1b1b30'

export function cellStyle(cell: DungeonCell): CellStyle {
  const v = cell.variant
  switch (cell.feature) {
    case 'wall': return { glyph: '', color: '#3a3a4a', bg: '#07070c', label: 'Wall' }
    case 'empty': return { glyph: '', color: '#555566', bg: FLOOR, label: 'Corridor' }
    case 'ladderUp': return { glyph: '↑', color: '#e6c53a', bg: FLOOR, label: 'Ladder up' }
    case 'ladderDown': return { glyph: '↓', color: '#e6c53a', bg: FLOOR, label: 'Ladder down' }
    case 'ladderUpDown': return { glyph: '↕', color: '#e6c53a', bg: FLOOR, label: 'Ladder up and down' }
    case 'chest': return { glyph: '▣', color: '#d9a441', bg: FLOOR, label: 'Chest' }
    case 'ceilingHole': return { glyph: '○', color: '#8fb4e0', bg: FLOOR, label: 'Ceiling hole' }
    case 'floorHole': return { glyph: '●', color: '#8fb4e0', bg: FLOOR, label: 'Floor hole' }
    case 'orb': return { glyph: '◉', color: '#c77af0', bg: FLOOR, label: 'Magic orb' }
    case 'trap': return { glyph: '^', color: '#e0803a', bg: FLOOR, label: TRAPS[v] ?? 'Trap' }
    case 'fountain': return { glyph: '≈', color: '#5fc8e8', bg: FLOOR, label: FOUNTAINS[v] ?? 'Fountain' }
    case 'field': {
      const f = FIELDS[v & 3]!
      return { glyph: '#', color: f.color, bg: FLOOR, label: v < FIELDS.length ? f.name : 'Field' }
    }
    case 'altar': return { glyph: '†', color: '#f0f0e0', bg: FLOOR, label: 'Altar' }
    case 'door': return { glyph: '+', color: '#c08a4a', bg: FLOOR, label: 'Door' }
    case 'secretDoor': return { glyph: 'S', color: '#8a7a9a', bg: FLOOR, label: 'Secret door' }
    case 'room': return { glyph: `R${v}`, color: '#7fd0a0', bg: '#16302a', label: `Room ${v}` }
  }
}

/** Cells that open an 11x11 room map when clicked. */
export const isRoomCell = (cell: DungeonCell): boolean => cell.feature === 'room'

export const ABYSS_ID = 24

/** Room block index for a room cell. The Abyss has 16 rooms per pair of levels (xu4 game.cpp). */
export const roomIndex = (cell: DungeonCell, level: number, dungeonId: number): number =>
  dungeonId === ABYSS_ID ? 16 * Math.floor(level / 2) + cell.variant : cell.variant
