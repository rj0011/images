import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Heart, Share2, Trash2, Info, SlidersHorizontal, Play, MoreVertical, Pause, MapPin, Camera, Presentation } from 'lucide-react'
import { fileUrl } from '../lib/media'
import { useBack, useThumb, fullDate, fmtSize, fmtTime, clamp } from '../lib/util'
import { Sheet } from './ui'

function Slide({ it, active, zoom, onLoad }) {
  const thumb = useThumb(it.id, it.hasThumb)
  const [src, setSrc] = useState(null)
  const [ok, setOk] = useState(false)
  useEffect(() => { let on = true; if (it.kind === 'photo') fileUrl(it.id).then((u) => on && setSrc(u)); return () => { on = false } }, [it.id, it.kind])
  const tf = active && zoom ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` : 'none'
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden">
      {thumb && !ok && <img src={thumb} alt="" className="absolute max-h-full max-w-full object-contain blur-[1px]" style={{ transform: tf, width: it.w > it.h ? '100%' : 'auto', height: it.w > it.h ? 'auto' : '100%' }} draggable={false} />}
      {src && <img src={src} alt="" onLoad={() => { setOk(true); onLoad?.() }} draggable={false} decoding="async"
        className="relative max-h-full max-w-full object-contain" style={{ transform: tf, transition: zoom?.anim ? 'transform .25s ease' : 'none' }} />}
      {it.kind === 'video' && (
        <div className="absolute grid h-20 w-20 place-items-center rounded-full bg-black/40 ring-1 ring-white/40 backdrop-blur"><Play size={34} fill="#fff" /></div>
      )}
    </div>
  )
}

export default function Viewer({ list, index, onClose, app, onPlayVideo, startShow = false }) {
  const [idx, setIdx] = useState(index)
  const [ui, setUi] = useState(!startShow)
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 })
  const [drag, setDrag] = useState({ x: 0, y: 0, anim: false })
  const [info, setInfo] = useState(false)
  const [show, setShow] = useState(startShow) // slideshow
  const ref = useRef()
  const g = useRef({ pts: new Map(), lastTap: 0 })
  useBack(true, onClose)

  useEffect(() => { if (idx > 0 && idx >= list.length) setIdx(list.length - 1) }, [idx, list.length])
  const it = list[Math.min(idx, list.length - 1)]
  useEffect(() => { if (!list.length) onClose() }, [list.length, onClose])
  useEffect(() => { setZoom({ s: 1, x: 0, y: 0 }) }, [idx])
  useEffect(() => {
    if (!show) return
    const h = setInterval(() => setIdx((i) => (i + 1) % list.length), 3500)
    return () => clearInterval(h)
  }, [show, list.length])

  const go = useCallback((d) => {
    const n = idx + d
    if (n < 0 || n >= list.length) { setDrag({ x: 0, y: 0, anim: true }); return }
    const W = ref.current.clientWidth
    setDrag({ x: -d * W, y: 0, anim: true })
    setTimeout(() => { setIdx(n); setDrag({ x: 0, y: 0, anim: false }) }, 220)
  }, [idx, list.length])

  useEffect(() => {
    const k = (e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go])

  if (!it) return null

  const rel = (e) => { const r = ref.current.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 } }
  const clampZoom = (z) => {
    const W = ref.current.clientWidth, H = ref.current.clientHeight
    const mx = ((z.s - 1) * W) / 2, my = ((z.s - 1) * H) / 2
    return { s: z.s, x: clamp(z.x, -mx, mx), y: clamp(z.y, -my, my), anim: true }
  }

  const down = (e) => {
    ref.current.setPointerCapture?.(e.pointerId)
    const G = g.current
    G.pts.set(e.pointerId, rel(e))
    if (G.pts.size === 1) { G.start = rel(e); G.t0 = Date.now(); G.z0 = { ...zoom }; G.mode = null; G.moved = false }
    if (G.pts.size === 2) {
      const [a, b] = [...G.pts.values()]
      G.mode = 'pinch'; G.d0 = Math.hypot(a.x - b.x, a.y - b.y); G.m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; G.z0 = { ...zoom }
    }
  }
  const move = (e) => {
    const G = g.current
    if (!G.pts.has(e.pointerId)) return
    const p = rel(e)
    G.pts.set(e.pointerId, p)
    if (G.mode === 'pinch' && G.pts.size >= 2) {
      const [a, b] = [...G.pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const s = clamp((G.z0.s * d) / G.d0, 1, 6)
      const k = s / G.z0.s
      setZoom({ s, x: m.x - (G.m0.x - G.z0.x) * k, y: m.y - (G.m0.y - G.z0.y) * k })
      return
    }
    const dx = p.x - G.start.x, dy = p.y - G.start.y
    if (Math.hypot(dx, dy) > 8) G.moved = true
    if (zoom.s > 1.02) { setZoom({ s: zoom.s, x: G.z0.x + dx, y: G.z0.y + dy }); return }
    if (!G.mode && G.moved) G.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : dy > 0 ? 'dismiss' : 'none'
    if (G.mode === 'swipe' && !show) setDrag({ x: dx, y: 0 })
    if (G.mode === 'dismiss') setDrag({ x: dx * 0.4, y: dy })
  }
  const up = (e) => {
    const G = g.current
    const p = G.pts.get(e.pointerId) || G.start
    G.pts.delete(e.pointerId)
    if (G.mode === 'pinch') {
      if (G.pts.size === 0) { setZoom((z) => (z.s < 1.05 ? { s: 1, x: 0, y: 0, anim: true } : clampZoom(z))); G.mode = null }
      else { G.start = [...G.pts.values()][0]; G.z0 = { ...zoom }; G.mode = 'pan' }
      return
    }
    if (G.pts.size) return
    const dx = p.x - G.start.x, dy = p.y - G.start.y
    const dt = Date.now() - G.t0
    if (zoom.s > 1.02 && G.moved) { setZoom((z) => clampZoom(z)); return }
    if (G.mode === 'swipe') {
      const W = ref.current.clientWidth
      if (Math.abs(dx) > W * 0.22 || Math.abs(dx) / dt > 0.5) go(dx < 0 ? 1 : -1)
      else setDrag({ x: 0, y: 0, anim: true })
      return
    }
    if (G.mode === 'dismiss') { if (dy > 130 || dy / dt > 0.7) onClose(); else setDrag({ x: 0, y: 0, anim: true }); return }
    if (G.moved) return
    // tap / double-tap
    const now = Date.now()
    if (now - G.lastTap < 280) {
      clearTimeout(G.tapT); G.lastTap = 0
      if (it.kind !== 'photo') return
      if (zoom.s > 1.02) setZoom({ s: 1, x: 0, y: 0, anim: true })
      else setZoom(clampZoom({ s: 2.6, x: -1.6 * p.x, y: -1.6 * p.y }))
    } else {
      G.lastTap = now
      G.tapT = setTimeout(() => {
        if (show) { setShow(false); setUi(true); return }
        if (it.kind === 'video') onPlayVideo(it, list)
        else setUi((u) => !u)
      }, 260)
    }
  }

  const fade = drag.y > 0 ? clamp(1 - drag.y / 500, 0.2, 1) : 1
  const W = ref.current?.clientWidth || window.innerWidth
  const neighbours = [-1, 0, 1].filter((d) => list[idx + d])

  const more = async () => {
    const v = await app.ask({
      title: it.name,
      actions: [
        { value: 'album', label: 'Add to album', icon: app.icons.Album },
        { value: 'hide', label: it.hidden ? 'Move out of Vault' : 'Move to Vault (hidden)', icon: app.icons.Lock },
        { value: 'download', label: 'Save copy to phone (Downloads)', icon: app.icons.Download },
        { value: 'slide', label: 'Slideshow from here', icon: Presentation },
      ],
    })
    if (v === 'album') app.addToAlbum([it.id])
    if (v === 'hide') { app.setHidden([it.id], !it.hidden); }
    if (v === 'download') app.download([it])
    if (v === 'slide') { setShow(true); setUi(false) }
  }

  return (
    <div className="fixed inset-0 z-50 select-none" style={{ background: `rgba(0,0,0,${fade})` }}>
      <div ref={ref} className="absolute inset-0" style={{ touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="absolute inset-0" style={{
          transform: `translate(${drag.x}px, ${drag.y}px) scale(${drag.y > 0 ? fade * 0.3 + 0.7 : 1})`,
          transition: drag.anim ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none',
        }}>
          {neighbours.map((d) => (
            <div key={list[idx + d].id} className={`absolute inset-0 ${show ? 'transition-opacity duration-700' : ''}`} style={{ transform: `translateX(${d * (W + 16)}px)` }}>
              <Slide it={list[idx + d]} active={d === 0} zoom={d === 0 ? zoom : null} />
            </div>
          ))}
        </div>
      </div>

      {ui && !show && drag.y === 0 && (
        <>
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2 pb-8 pt-3 safe-t anim-fade">
            <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><ArrowLeft /></button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{new Date(it.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="text-xs text-white/60">{new Date(it.date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {idx + 1}/{list.length}</div>
            </div>
            <button onClick={() => { setShow(true); setUi(false) }} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><Presentation size={21} /></button>
            <button onClick={more} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><MoreVertical size={21} /></button>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-around bg-gradient-to-t from-black/75 to-transparent px-2 pb-4 pt-10 safe-b anim-fade">
            <VBtn icon={Share2} label="Share" onClick={() => app.share([it])} />
            <VBtn icon={Heart} label="Favourite" on={it.fav} onClick={() => app.toggleFav([it.id], !it.fav)} />
            {it.kind === 'photo' && <VBtn icon={SlidersHorizontal} label="Edit" onClick={() => app.edit(it)} />}
            <VBtn icon={Info} label="Info" onClick={() => setInfo(true)} />
            <VBtn icon={Trash2} label="Delete" onClick={() => app.trash([it.id])} />
          </div>
        </>
      )}
      {show && <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center"><span className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/70 backdrop-blur"><Pause size={12} /> Slideshow · tap to stop</span></div>}

      <Sheet open={info} onClose={() => setInfo(false)} title="Details">
        <InfoBody it={it} albums={app.albums} />
      </Sheet>
    </div>
  )
}

function VBtn({ icon: I, label, onClick, on }) {
  return (
    <button onClick={onClick} className="flex w-16 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] text-white/85 active:scale-90">
      <I size={22} fill={on ? '#ec4899' : 'none'} color={on ? '#ec4899' : 'currentColor'} />{label}
    </button>
  )
}

export function InfoBody({ it, albums }) {
  const e = it.exif || {}
  const rows = [
    ['Name', it.name], ['Date', fullDate(it.date)], ['Size', fmtSize(it.size)],
    it.w ? ['Resolution', `${it.w} × ${it.h} · ${((it.w * it.h) / 1e6).toFixed(1)} MP`] : null,
    it.dur ? ['Duration', fmtTime(it.dur)] : null,
    it.folder ? ['Folder', it.folder] : null,
    it.albums?.length ? ['Albums', it.albums.map((a) => albums.find((x) => x.id === a)?.name).filter(Boolean).join(', ')] : null,
    it.tags?.artist ? ['Artist', it.tags.artist] : null, it.tags?.album ? ['Album', it.tags.album] : null,
  ].filter(Boolean)
  const cam = [e.make, e.model].filter(Boolean).join(' ')
  const shot = [e.fNumber && `ƒ/${e.fNumber.toFixed(1)}`, e.exposure && (e.exposure < 1 ? `1/${Math.round(1 / e.exposure)}s` : e.exposure + 's'), e.focal && `${e.focal.toFixed(1)}mm`, e.iso && `ISO ${e.iso}`].filter(Boolean)
  return (
    <div className="space-y-3">
      {(cam || shot.length > 0) && (
        <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-2 font-semibold"><Camera size={18} className="text-[var(--ac)]" />{cam || 'Camera'}</div>
          {e.lens && <div className="mt-0.5 text-xs text-white/50">{e.lens}</div>}
          {shot.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{shot.map((s) => <span key={s} className="rounded-lg bg-white/8 px-2 py-1 text-xs font-medium">{s}</span>)}</div>}
        </div>
      )}
      <div className="divide-y divide-white/5 rounded-2xl bg-white/5 ring-1 ring-white/10">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm"><span className="text-white/50">{k}</span><span className="break-all text-right">{v}</span></div>
        ))}
      </div>
      {e.lat != null && (
        <a href={`https://maps.google.com/?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm ring-1 ring-white/10">
          <MapPin size={18} className="text-[var(--ac2)]" /> {e.lat.toFixed(5)}, {e.lng.toFixed(5)} <span className="ml-auto text-xs grad-text font-semibold">Open map</span>
        </a>
      )}
    </div>
  )
}
