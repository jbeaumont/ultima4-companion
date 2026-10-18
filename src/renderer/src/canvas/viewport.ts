// Pan/zoom math for tile maps; pure (no DOM) so it can be unit tested.
export const BASE_TILE = 16
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

/** offX/offY are the screen pixels (CSS px) of the map's top-left corner. */
export interface Viewport {
  zoom: number
  offX: number
  offY: number
}

export interface TileRange {
  x0: number
  y0: number
  /** Exclusive. */
  x1: number
  y1: number
}

export const tilePx = (zoom: number): number => BASE_TILE * zoom

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** Fractional tile coordinates under a screen point. */
export function screenToTile(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  const t = tilePx(vp.zoom)
  return { x: (sx - vp.offX) / t, y: (sy - vp.offY) / t }
}

/** Screen position of a tile's top-left corner. */
export function tileToScreen(vp: Viewport, tx: number, ty: number): { x: number; y: number } {
  const t = tilePx(vp.zoom)
  return { x: vp.offX + tx * t, y: vp.offY + ty * t }
}

/** Multiply the zoom by `factor` (clamped) keeping the tile under (sx, sy) fixed. */
export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport {
  const zoom = clampZoom(vp.zoom * factor)
  const k = zoom / vp.zoom
  return { zoom, offX: sx - (sx - vp.offX) * k, offY: sy - (sy - vp.offY) * k }
}

const clampAxis = (off: number, mapPx: number, viewPx: number): number =>
  mapPx <= viewPx ? (viewPx - mapPx) / 2 : Math.min(0, Math.max(viewPx - mapPx, off))

/** Keep the map covering the view; a map smaller than the view is centered. */
export function clampView(vp: Viewport, mapW: number, mapH: number, viewW: number, viewH: number): Viewport {
  const t = tilePx(vp.zoom)
  return { zoom: vp.zoom, offX: clampAxis(vp.offX, mapW * t, viewW), offY: clampAxis(vp.offY, mapH * t, viewH) }
}

/** Put the middle of tile (tx, ty) at the middle of the view (unclamped). */
export function centerOn(zoom: number, tx: number, ty: number, viewW: number, viewH: number): Viewport {
  const t = tilePx(zoom)
  return { zoom, offX: viewW / 2 - (tx + 0.5) * t, offY: viewH / 2 - (ty + 0.5) * t }
}

/** Largest zoom (within limits) at which the whole map fits the view. */
export function fitZoom(mapW: number, mapH: number, viewW: number, viewH: number): number {
  if (viewW <= 0 || viewH <= 0) return 1
  return clampZoom(Math.min(viewW / (mapW * BASE_TILE), viewH / (mapH * BASE_TILE)))
}

/** Tiles intersecting the view, clamped to the map. */
export function visibleRange(vp: Viewport, mapW: number, mapH: number, viewW: number, viewH: number): TileRange {
  const a = screenToTile(vp, 0, 0)
  const b = screenToTile(vp, viewW, viewH)
  return {
    x0: Math.max(0, Math.floor(a.x)),
    y0: Math.max(0, Math.floor(a.y)),
    x1: Math.min(mapW, Math.ceil(b.x)),
    y1: Math.min(mapH, Math.ceil(b.y))
  }
}
