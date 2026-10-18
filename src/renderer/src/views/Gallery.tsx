import { useCallback, useEffect, useRef, useState } from 'react'
import { GALLERY, imageLabel, spoilerOpen } from '@domain/gallery'
import { decodeEgaImage } from '@parsers/egaImage'
import type { EgaImage } from '@parsers/egaImage'
import { indicesToRgba } from '@parsers/shapes'
import type { GameState } from '@shared/types'
import { useJournal } from '../useJournal'

type Cache = Map<string, Promise<EgaImage | null>>

/** Fetch and decode once per name; failures resolve to null. */
const load = (cache: Cache, name: string): Promise<EgaImage | null> => {
  let p = cache.get(name)
  if (!p) {
    p = window.u4.getImage(name).then((b) => (b ? decodeEgaImage(name, b) : null), () => null)
    cache.set(name, p)
  }
  return p
}

function paint(canvas: HTMLCanvasElement, img: EgaImage): void {
  canvas.width = img.width
  canvas.height = img.height
  const rgba = indicesToRgba(img.pixels) as Uint8ClampedArray<ArrayBuffer>
  canvas.getContext('2d')?.putImageData(new ImageData(rgba, img.width, img.height), 0, 0)
}

function Picture(props: { img: EgaImage; scale: number; onClick?: () => void; canvasRef?: (c: HTMLCanvasElement | null) => void }) {
  const { img, scale, onClick, canvasRef } = props
  const ref = useRef<HTMLCanvasElement | null>(null)
  const setRef = useCallback((c: HTMLCanvasElement | null) => {
    ref.current = c
    canvasRef?.(c)
  }, [canvasRef])
  useEffect(() => {
    if (ref.current) paint(ref.current, img)
  }, [img])
  return (
    <canvas
      ref={setRef}
      className="gallery-img" onClick={onClick}
      style={{ width: img.width * scale, height: img.height * scale, cursor: onClick ? 'zoom-in' : undefined }}
    />
  )
}

type Slot = { status: 'idle' } | { status: 'ok'; img: EgaImage } | { status: 'fail' }

function Card(props: { name: string; cache: Cache; scale: number; hidden: boolean; onReveal: () => void; onOpen: (img: EgaImage) => void }) {
  const { name, cache, scale, hidden, onReveal, onOpen } = props
  const box = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<Slot>({ status: 'idle' })
  const [seen, setSeen] = useState(false)

  // decode lazily: only once the card scrolls into view (and is not spoiler-hidden)
  useEffect(() => {
    const el = box.current
    if (!el || seen) return
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setSeen(true)
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  useEffect(() => {
    if (!seen || hidden || slot.status !== 'idle') return
    let live = true
    load(cache, name).then((img) => live && setSlot(img ? { status: 'ok', img } : { status: 'fail' }))
    return () => {
      live = false
    }
  }, [seen, hidden, slot.status, cache, name])

  const w = 320 * scale
  const h = 200 * scale
  let body: React.ReactNode
  if (hidden) {
    body = (
      <div className="gallery-ph" style={{ width: w, height: h }}>
        <span className="muted small">Late-game spoiler</span>
        <button className="btn small" onClick={onReveal}>Show anyway</button>
      </div>
    )
  } else if (slot.status === 'ok') body = <Picture img={slot.img} scale={scale} onClick={() => onOpen(slot.img)} />
  else body = <div className="gallery-ph" style={{ width: w, height: h }}><span className="muted small">{slot.status === 'fail' ? 'Could not load' : 'Loading...'}</span></div>
  return (
    <div className="card gallery-card" ref={box}>
      <div className="card-head"><b>{imageLabel(name)}</b><span className="muted small">{name}</span></div>
      {body}
    </div>
  )
}

function Viewer({ name, img, onClose }: { name: string; img: EgaImage; onClose: () => void }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // the download link is built from the painted canvas
  useEffect(() => {
    if (!canvas) return
    let made: string | null = null
    let live = true
    canvas.toBlob((b) => {
      if (!b) return
      made = URL.createObjectURL(b)
      if (live) setUrl(made)
      else URL.revokeObjectURL(made)
    }, 'image/png')
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [canvas])
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{imageLabel(name)}</b>
          <span className="modal-actions">
            {url ? <a className="btn small" href={url} download={`${name.replace(/\.EGA$/i, '').toLowerCase()}.png`}>Save PNG</a> : <span className="muted small">Preparing...</span>}
            <button className="btn small" onClick={onClose}>Close</button>
          </span>
        </div>
        <Picture img={img} scale={3} canvasRef={setCanvas} />
      </div>
    </div>
  )
}

export function Gallery({ state }: { state: GameState | null }) {
  const gameDir = state?.gameDir ?? null
  const { journal } = useJournal()
  const level = journal?.spoilerLevel ?? 'nudges'
  const [scale, setScale] = useState(2)
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<{ name: string; img: EgaImage } | null>(null)
  const cache = useRef<Cache>(new Map())
  const dirRef = useRef(gameDir)
  if (dirRef.current !== gameDir) {
    dirRef.current = gameDir
    cache.current = new Map()
  }

  if (!gameDir) {
    return (
      <div className="panel">
        <h3>Gallery</h3>
        <p className="muted">Ultima IV install not found. Choose the game folder in Settings to see the artwork.</p>
      </div>
    )
  }

  return (
    <div key={gameDir}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Gallery</h2>
        <span className="levels">
          {[1, 2].map((s) => (
            <button key={s} className={`btn small${s === scale ? ' active' : ''}`} onClick={() => setScale(s)}>{s}×</button>
          ))}
        </span>
        <span className="muted small">Click an image for a larger view and PNG export.</span>
      </div>
      {GALLERY.map((g) => (
        <section key={g.id} className="gallery-group">
          <h3>{g.title}</h3>
          {g.spoiler && !spoilerOpen(g, level) && (
            <p className="muted small">Hidden: raise the spoiler level to Full in Hints to show these automatically.</p>
          )}
          <div className="gallery-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${320 * scale + 26}px, 1fr))` }}>
            {g.files.map((f) => (
              <Card
                key={f} name={f} cache={cache.current} scale={scale}
                hidden={!spoilerOpen(g, level) && !shown.has(f)}
                onReveal={() => setShown((s) => new Set(s).add(f))}
                onOpen={(img) => setOpen({ name: f, img })}
              />
            ))}
          </div>
        </section>
      ))}
      {open && <Viewer name={open.name} img={open.img} onClose={() => setOpen(null)} />}
    </div>
  )
}
