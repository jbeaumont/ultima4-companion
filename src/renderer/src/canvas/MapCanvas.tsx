import { useEffect, useRef } from 'react'
import { centerOn, clampView, fitZoom, screenToTile, zoomAt } from './viewport'
import type { Viewport } from './viewport'

export interface DrawArgs {
  ctx: CanvasRenderingContext2D
  vp: Viewport
  w: number
  h: number
  /** performance.now() of this frame, for animation. */
  time: number
}

interface Props {
  mapW: number
  mapH: number
  /** Changing this resets zoom and centering (new map). */
  resetKey: string
  initialZoom: 'fit' | number
  /** Recenters on a tile whenever seq changes. */
  center?: { x: number; y: number; seq: number }
  /** Keep redrawing every frame (pulsing overlays). */
  animate?: boolean
  draw: (a: DrawArgs) => void
  onHover?: (tile: { x: number; y: number } | null) => void
}

/** Pannable, zoomable canvas for tile maps; the parent supplies the drawing. */
export function MapCanvas({ mapW, mapH, resetKey, initialZoom, center, animate, draw, onHover }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const vp = useRef<Viewport>({ zoom: 1, offX: 0, offY: 0 })
  const size = useRef({ w: 0, h: 0 })
  const needsInit = useRef(true)
  const frame = useRef(0)
  const latest = useRef({ draw, animate, mapW, mapH, initialZoom, center, onHover })
  latest.current = { draw, animate, mapW, mapH, initialZoom, center, onHover }

  const paint = (): void => {
    frame.current = 0
    const c = cvs.current
    const ctx = c?.getContext('2d')
    const { w, h } = size.current
    if (!c || !ctx || w === 0) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#05050a'
    ctx.fillRect(0, 0, w, h)
    latest.current.draw({ ctx, vp: vp.current, w, h, time: performance.now() })
    if (latest.current.animate) request()
  }
  const request = (): void => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }

  const setView = (next: Viewport): void => {
    const { mapW: mw, mapH: mh } = latest.current
    vp.current = clampView(next, mw, mh, size.current.w, size.current.h)
    request()
  }

  const reset = (): void => {
    const { w, h } = size.current
    if (w === 0) return
    const { mapW: mw, mapH: mh, initialZoom: iz, center: c } = latest.current
    const zoom = iz === 'fit' ? fitZoom(mw, mh, w, h) : iz
    needsInit.current = false
    setView(centerOn(zoom, c ? c.x : mw / 2 - 0.5, c ? c.y : mh / 2 - 0.5, w, h))
  }

  useEffect(() => {
    const el = wrap.current!
    const c = cvs.current!
    const resize = (): void => {
      const w = el.clientWidth
      const h = el.clientHeight
      const dpr = window.devicePixelRatio || 1
      size.current = { w, h }
      c.width = Math.max(1, Math.round(w * dpr))
      c.height = Math.max(1, Math.round(h * dpr))
      if (needsInit.current) reset()
      else setView(vp.current)
      request()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      setView(zoomAt(vp.current, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      c.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    needsInit.current = true
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  useEffect(() => {
    const { w, h } = size.current
    if (!center || w === 0) return
    setView(centerOn(vp.current.zoom, center.x, center.y, w, h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.seq])

  // redraw whenever the parent hands us new drawing state
  useEffect(request)

  const drag = useRef<{ x: number; y: number } | null>(null)
  const local = (e: React.PointerEvent): { x: number; y: number } => {
    const r = cvs.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  return (
    <div className="map-wrap" ref={wrap}>
      <canvas
        ref={cvs}
        className="map-canvas"
        onPointerDown={(e) => {
          cvs.current!.setPointerCapture(e.pointerId)
          drag.current = local(e)
        }}
        onPointerMove={(e) => {
          const p = local(e)
          if (drag.current) {
            const d = drag.current
            drag.current = p
            setView({ ...vp.current, offX: vp.current.offX + p.x - d.x, offY: vp.current.offY + p.y - d.y })
          }
          const t = screenToTile(vp.current, p.x, p.y)
          const { mapW: mw, mapH: mh, onHover: hover } = latest.current
          const x = Math.floor(t.x)
          const y = Math.floor(t.y)
          hover?.(x >= 0 && y >= 0 && x < mw && y < mh ? { x, y } : null)
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onPointerLeave={() => latest.current.onHover?.(null)}
      />
    </div>
  )
}
