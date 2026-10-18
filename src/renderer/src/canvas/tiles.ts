import { TILE_COUNT, TILE_SIZE, indicesToRgba, parseShapes } from '@parsers/shapes'
import { BASE_TILE, tilePx, visibleRange } from './viewport'
import type { Viewport } from './viewport'

const COLS = 16

export interface TileAtlas {
  canvas: HTMLCanvasElement
}

const cache = new WeakMap<Uint8Array, TileAtlas>()

/** Build (once per SHAPES buffer) a 16x16 grid of all 256 tiles on an offscreen canvas. */
export function buildAtlas(shapes: Uint8Array): TileAtlas {
  const hit = cache.get(shapes)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = COLS * TILE_SIZE
  canvas.height = (TILE_COUNT / COLS) * TILE_SIZE
  const ctx = canvas.getContext('2d')!
  parseShapes(shapes).forEach((indices, t) => {
    const img = new ImageData(indicesToRgba(indices) as Uint8ClampedArray<ArrayBuffer>, TILE_SIZE, TILE_SIZE)
    ctx.putImageData(img, (t % COLS) * TILE_SIZE, Math.floor(t / COLS) * TILE_SIZE)
  })
  const atlas = { canvas }
  cache.set(shapes, atlas)
  return atlas
}

/** Draw one tile at (dx, dy) scaled to `size` px, with crisp pixels. */
export function drawTile(ctx: CanvasRenderingContext2D, atlas: TileAtlas, tile: number, dx: number, dy: number, size: number): void {
  ctx.imageSmoothingEnabled = false
  const t = tile & 0xff
  ctx.drawImage(atlas.canvas, (t % COLS) * TILE_SIZE, Math.floor(t / COLS) * TILE_SIZE, TILE_SIZE, TILE_SIZE, dx, dy, size, size)
}

/** Draw only the visible part of a tile grid. Positions are snapped to whole pixels to avoid seams. */
export function drawGrid(
  ctx: CanvasRenderingContext2D, atlas: TileAtlas, vp: Viewport,
  mapW: number, mapH: number, viewW: number, viewH: number, tileAt: (x: number, y: number) => number
): void {
  const r = visibleRange(vp, mapW, mapH, viewW, viewH)
  const t = tilePx(vp.zoom)
  for (let y = r.y0; y < r.y1; y++) {
    const sy = Math.floor(vp.offY + y * t)
    const h = Math.floor(vp.offY + (y + 1) * t) - sy
    for (let x = r.x0; x < r.x1; x++) {
      const sx = Math.floor(vp.offX + x * t)
      const w = Math.floor(vp.offX + (x + 1) * t) - sx
      ctx.imageSmoothingEnabled = false
      const tile = tileAt(x, y) & 0xff
      ctx.drawImage(atlas.canvas, (tile % COLS) * TILE_SIZE, Math.floor(tile / COLS) * TILE_SIZE, BASE_TILE, BASE_TILE, sx, sy, w, h)
    }
  }
}
