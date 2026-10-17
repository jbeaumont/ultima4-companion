import { describe, expect, it } from 'vitest'
import { cellStyle, isRoomCell } from '@domain/dungeonGlyphs'
import { tileName } from '@domain/tiles'
import { decodeDungeonCell } from '@parsers/dungeon'
import {
  MAX_ZOOM, MIN_ZOOM, centerOn, clampView, fitZoom, screenToTile, tilePx, tileToScreen, visibleRange, zoomAt
} from '../src/renderer/src/canvas/viewport'

const vp = { zoom: 2, offX: 10, offY: -20 }

describe('viewport math', () => {
  it('converts screen to tile and back', () => {
    const t = screenToTile(vp, 42, 12)
    expect(t).toEqual({ x: 1, y: 1 })
    expect(tileToScreen(vp, t.x, t.y)).toEqual({ x: 42, y: 12 })
    expect(tilePx(0.25)).toBe(4)
  })

  it('zooms around the cursor, keeping its tile fixed', () => {
    const before = screenToTile(vp, 200, 150)
    const next = zoomAt(vp, 200, 150, 1.5)
    expect(next.zoom).toBe(3)
    const after = screenToTile(next, 200, 150)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps zoom to limits', () => {
    expect(zoomAt(vp, 0, 0, 100).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(vp, 0, 0, 0.001).zoom).toBe(MIN_ZOOM)
    const maxed = { zoom: MAX_ZOOM, offX: 5, offY: 5 }
    expect(zoomAt(maxed, 50, 50, 2)).toEqual(maxed)
  })

  it('clamps panning so the map stays in view', () => {
    // 256 tiles at zoom 1 = 4096px in an 800x600 view
    const a = clampView({ zoom: 1, offX: 100, offY: 100 }, 256, 256, 800, 600)
    expect(a).toEqual({ zoom: 1, offX: 0, offY: 0 })
    const b = clampView({ zoom: 1, offX: -99999, offY: -99999 }, 256, 256, 800, 600)
    expect(b.offX).toBe(800 - 4096)
    expect(b.offY).toBe(600 - 4096)
  })

  it('centers a map smaller than the view', () => {
    const c = clampView({ zoom: 1, offX: 0, offY: 0 }, 32, 32, 800, 600) // 512px
    expect(c.offX).toBe(144)
    expect(c.offY).toBe(44)
  })

  it('centers on a tile', () => {
    const c = centerOn(1, 10, 20, 800, 600)
    const mid = screenToTile(c, 400, 300)
    expect(mid.x).toBeCloseTo(10.5)
    expect(mid.y).toBeCloseTo(20.5)
  })

  it('fits a map to the view within zoom limits', () => {
    expect(fitZoom(32, 32, 1024, 512)).toBe(1)
    expect(fitZoom(256, 256, 400, 400)).toBe(MIN_ZOOM)
    expect(fitZoom(2, 2, 4000, 4000)).toBe(MAX_ZOOM)
    expect(fitZoom(32, 32, 0, 0)).toBe(1)
  })

  it('computes the visible tile range', () => {
    const r = visibleRange({ zoom: 1, offX: -32, offY: -16 }, 256, 256, 160, 80)
    expect(r).toEqual({ x0: 2, y0: 1, x1: 12, y1: 6 })
    const all = visibleRange({ zoom: 1, offX: 100, offY: 100 }, 4, 4, 800, 600)
    expect(all).toEqual({ x0: 0, y0: 0, x1: 4, y1: 4 })
  })
})

describe('dungeon glyphs', () => {
  const style = (raw: number) => cellStyle(decodeDungeonCell(raw))

  it('maps each feature to a distinct label', () => {
    const labels = new Set<string>()
    for (let hi = 0; hi < 16; hi++) labels.add(style(hi << 4).label)
    expect(labels.size).toBe(16)
  })

  it('draws ladders with arrows', () => {
    expect(style(0x10).glyph).toBe('↑')
    expect(style(0x20).glyph).toBe('↓')
    expect(style(0x30).glyph).toBe('↕')
  })

  it('colors fields by variant', () => {
    const colors = [0xa0, 0xa1, 0xa2, 0xa3].map((r) => style(r).color)
    expect(new Set(colors).size).toBe(4)
    expect(style(0xa2).label).toBe('Fire field')
  })

  it('labels rooms with their number and flags them clickable', () => {
    const cell = decodeDungeonCell(0xd5)
    expect(cellStyle(cell).glyph).toBe('R5')
    expect(isRoomCell(cell)).toBe(true)
    expect(isRoomCell(decodeDungeonCell(0xf0))).toBe(false)
  })

  it('draws walls dark', () => {
    expect(style(0xf0).bg).toBe('#07070c')
  })
})

describe('tileName', () => {
  it('names terrain and falls back for the rest', () => {
    expect(tileName(4)).toBe('Grassland')
    expect(tileName(14)).toBe('LB Castle Entrance')
    expect(tileName(31)).toBe('Tile #31')
  })
})

describe('roomIndex', () => {
  it('offsets Abyss rooms by level pair', async () => {
    const { roomIndex } = await import('@domain/dungeonGlyphs')
    const { decodeDungeonCell } = await import('@parsers/dungeon')
    const cell = decodeDungeonCell(0xd5)
    expect(roomIndex(cell, 3, 17)).toBe(5) // Deceit: no offset
    expect(roomIndex(cell, 0, 24)).toBe(5)
    expect(roomIndex(cell, 3, 24)).toBe(21)
    expect(roomIndex(cell, 7, 24)).toBe(53)
  })
})
