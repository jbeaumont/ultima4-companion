export interface HudBounds {
  x?: number
  y?: number
  width: number
  height: number
}

const MIN_W = 240
const MIN_H = 120
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validate stored HUD bounds; position is optional, size is clamped to a sane minimum. */
export function parseHudBounds(raw: unknown): HudBounds | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (!num(r.width) || !num(r.height)) return undefined
  const out: HudBounds = {
    width: Math.min(4000, Math.max(MIN_W, Math.round(r.width))),
    height: Math.min(4000, Math.max(MIN_H, Math.round(r.height)))
  }
  if (num(r.x) && num(r.y) && Math.abs(r.x) < 100000 && Math.abs(r.y) < 100000) {
    out.x = Math.round(r.x)
    out.y = Math.round(r.y)
  }
  return out
}
