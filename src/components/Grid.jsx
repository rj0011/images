import { memo, useEffect, useRef, useState } from 'react'
import { Play, Heart, Check, ImageOff, Music2 } from 'lucide-react'
import { fmtTime, groupBy, useThumb, vibrate } from '../lib/util'

const Tile = memo(function Tile({ it, selected, selecting, onTap, onLong, round }) {
  const ref = useRef()
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect() } }, { rootMargin: '600px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  const url = useThumb(it.id, vis && it.hasThumb)
  const t = useRef({})
  const down = (e) => {
    t.current = { x: e.clientX, y: e.clientY, long: false, h: setTimeout(() => { t.current.long = true; vibrate(18); onLong(it) }, 430) }
  }
  const move = (e) => { if (Math.hypot(e.clientX - t.current.x, e.clientY - t.current.y) > 10) clearTimeout(t.current.h) }
  const up = () => clearTimeout(t.current.h)
  const click = () => { if (t.current.long) return; onTap(it) }

  return (
    <div ref={ref} data-id={it.id} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}
      onContextMenu={(e) => e.preventDefault()}
      className={`tile relative aspect-square overflow-hidden bg-white/[.04] ${round ? 'rounded-xl' : ''}`}>
      {url ? (
        <img src={url} alt="" draggable={false} decoding="async"
          className={`h-full w-full object-cover transition duration-200 ${selected ? 'scale-[.86] rounded-xl' : ''}`} />
      ) : (
        <div className="grid h-full w-full place-items-center text-white/25">
          {it.kind === 'audio' ? <Music2 size={22} /> : it.broken ? <ImageOff size={20} /> : null}
        </div>
      )}
      {it.kind === 'video' && (
        <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-black/55 px-1 py-0.5 text-[10px] font-semibold tabular">
          <Play size={9} fill="currentColor" />{fmtTime(it.dur)}
        </span>
      )}
      {it.fav && !selecting && <Heart size={13} fill="#fff" className="absolute bottom-1.5 left-1.5 drop-shadow" />}
      {selecting && (
        <span className={`absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full ring-2 ring-white ${selected ? 'grad' : 'bg-black/25'}`}>
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      )}
    </div>
  )
})

// Timeline grid. Pinch with two fingers to change column count.
export default function MediaGrid({ items, cols, setCols, selected, setSelected, onOpen, group = 'auto', header }) {
  const selecting = selected.size > 0
  const pinch = useRef(null)
  const mode = group === 'none' ? 'none' : group === 'auto' ? (cols >= 6 ? 'month' : 'day') : group
  const groups = mode === 'none' ? [{ key: 'all', label: '', items }] : groupBy(items, mode)

  const toggle = (it) => setSelected((s) => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n })
  const onTap = (it) => (selecting ? toggle(it) : onOpen(it, items))
  const onLong = (it) => toggle(it)
  const selGroup = (g) => setSelected((s) => {
    const n = new Set(s)
    const all = g.items.every((i) => n.has(i.id))
    g.items.forEach((i) => (all ? n.delete(i.id) : n.add(i.id)))
    return n
  })

  const ts = (e) => { if (e.touches.length === 2) pinch.current = dist(e.touches) }
  const tm = (e) => {
    if (e.touches.length !== 2 || !pinch.current || !setCols) return
    const r = dist(e.touches) / pinch.current
    if (r > 1.3) { setCols((c) => Math.max(2, c - 1)); pinch.current = dist(e.touches); vibrate(8) }
    else if (r < 0.75) { setCols((c) => Math.min(8, c + 1)); pinch.current = dist(e.touches); vibrate(8) }
  }

  return (
    <div onTouchStart={ts} onTouchMove={tm} onTouchEnd={() => { pinch.current = null }}>
      {header}
      {groups.map((g) => (
        <section key={g.key} className="mb-1" style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${Math.ceil(g.items.length / cols) * (window.innerWidth / cols) + 40}px` }}>
          {g.label && (
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h4 className="text-sm font-semibold text-white/85">{g.label}</h4>
              {selecting && (
                <button onClick={() => selGroup(g)} className="text-xs font-semibold grad-text">
                  {g.items.every((i) => selected.has(i.id)) ? 'Deselect' : 'Select all'}
                </button>
              )}
            </div>
          )}
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {g.items.map((it) => (
              <Tile key={it.id} it={it} selected={selected.has(it.id)} selecting={selecting} onTap={onTap} onLong={onLong} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
