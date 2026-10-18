// Pure helpers for the Dashboard art: virtue cards cropped out of the .EGA screens.
import { EGA_PALETTE } from '@parsers/shapes'

export const CARD_BG = 10 // green backdrop behind each card
export const VIRTUE_IMAGES: ReadonlyArray<{ file: string; virtues: readonly [string, string] }> = [
  { file: 'HONCOM.EGA', virtues: ['Honesty', 'Compassion'] },
  { file: 'VALJUS.EGA', virtues: ['Valor', 'Justice'] },
  { file: 'SACHONOR.EGA', virtues: ['Sacrifice', 'Honor'] },
  { file: 'SPIRHUM.EGA', virtues: ['Spirituality', 'Humility'] }
]

export interface Rect { x: number; y: number; w: number; h: number }

/** Bounding box of non-background pixels within columns [x0, x1), or null if there are none. */
function bounds(pixels: Uint8Array, width: number, height: number, x0: number, x1: number): Rect | null {
  let minX = x1, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = x0; x < x1; x++) {
      if (pixels[y * width + x] === CARD_BG) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** [left card, right card] of a two-card screen; each is the box of non-green pixels in its half. */
export function cardRects(pixels: Uint8Array, width = 320, height = 200): [Rect | null, Rect | null] {
  const mid = width >> 1
  return [bounds(pixels, width, height, 0, mid), bounds(pixels, width, height, mid, width)]
}

/** Copy a rectangle of palette indices out of an image. */
export function crop(pixels: Uint8Array, width: number, r: Rect): Uint8Array {
  const out = new Uint8Array(r.w * r.h)
  for (let y = 0; y < r.h; y++) out.set(pixels.subarray((r.y + y) * width + r.x, (r.y + y) * width + r.x + r.w), y * r.w)
  return out
}

/** Palette indices to RGBA; index 0 (black) becomes transparent when `clearBlack` is set. */
export function indicesToRgbaKeyed(indices: Uint8Array, clearBlack: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(indices.length * 4)
  indices.forEach((p, i) => {
    const [r, g, b] = EGA_PALETTE[p]!
    out.set([r, g, b, clearBlack && p === 0 ? 0 : 255], i * 4)
  })
  return out
}

export const AVATAR_TILE = 31
/** First animation frame of a class sprite. */
export const classTile = (classIndex: number): number => 32 + 2 * classIndex
