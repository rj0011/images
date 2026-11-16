import { useEffect, useRef, useState } from 'react'
import { X, Check, RotateCw, FlipHorizontal2, Wand2, Sun, Contrast, Droplets, Thermometer, Aperture, CloudFog, Crop, Eye, RotateCcw } from 'lucide-react'
import { fileUrl } from '../lib/media'
import { useBack, clamp } from '../lib/util'

const PRESETS = {
  Original: {},
  Vivid: { contrast: 12, sat: 35 },
  Warm: { warmth: 35, sat: 8 },
  Cool: { warmth: -35, contrast: 6 },
  Golden: { warmth: 45, bright: 6, sat: 15, vignette: 25 },
  Mono: { css: 'grayscale(1)', contrast: 10 },
  Noir: { css: 'grayscale(1)', contrast: 45, bright: -8, vignette: 45 },
  Vintage: { css: 'sepia(.45)', fade: 30, sat: -15, vignette: 30 },
  Fade: { fade: 40, contrast: -12 },
  Drama: { contrast: 35, sat: -10, vignette: 50, bright: -4 },
  Teal: { css: 'hue-rotate(-12deg)', warmth: -18, contrast: 14, sat: 18 },
  Pop: { sat: 60, contrast: 20, bright: 4 },
}
const ADJ = [
  ['bright', 'Brightness', Sun], ['contrast', 'Contrast', Contrast], ['sat', 'Saturation', Droplets],
  ['warmth', 'Warmth', Thermometer], ['fade', 'Fade', CloudFog], ['vignette', 'Vignette', Aperture],
]
const RATIOS = [['Free', 0], ['Original', -1], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16]]
const ZERO = { bright: 0, contrast: 0, sat: 0, warmth: 0, fade: 0, vignette: 0 }

function combined(adj, preset) {
  const p = PRESETS[preset] || {}
  const o = { ...ZERO }
  for (const k in o) o[k] = (adj[k] || 0) + (p[k] || 0)
  o.css = p.css || ''
  return o
}

function orientedSize(img, rot) { const w = img.naturalWidth, h = img.naturalHeight; return rot % 180 ? [h, w] : [w, h] }

function drawOriented(img, rot, flip, k) {
  const [ow, oh] = orientedSize(img, rot)
  const c = document.createElement('canvas')
  c.width = Math.round(ow * k); c.height = Math.round(oh * k)
  const x = c.getContext('2d')
  x.translate(c.width / 2, c.height / 2)
  x.rotate((rot * Math.PI) / 180)
  x.scale(flip ? -1 : 1, 1)
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k
  x.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  return c
}

function renderTo(out, src, crop, f) {
  const sx = crop.x * src.width, sy = crop.y * src.height
  const sw = Math.max(1, crop.w * src.width), sh = Math.max(1, crop.h * src.height)
  out.width = Math.round(sw); out.height = Math.round(sh)
  const x = out.getContext('2d')
  x.filter = `brightness(${1 + f.bright / 100}) contrast(${1 + f.contrast / 100}) saturate(${1 + f.sat / 100}) ${f.css}`
  x.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height)
  x.filter = 'none'
  const W = out.width, H = out.height
  if (f.warmth) {
    x.globalCompositeOperation = 'soft-light'
    x.fillStyle = f.warmth > 0 ? `rgba(255,140,0,${f.warmth / 110})` : `rgba(0,120,255,${-f.warmth / 110})`
    x.fillRect(0, 0, W, H)
  }
  if (f.fade > 0) { x.globalCompositeOperation = 'screen'; x.fillStyle = `rgba(70,70,80,${f.fade / 110})`; x.fillRect(0, 0, W, H) }
  if (f.vignette > 0) {
    x.globalCompositeOperation = 'multiply'
    const gr = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2)
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${f.vignette / 100})`)
    x.fillStyle = gr; x.fillRect(0, 0, W, H)
  }
  x.globalCompositeOperation = 'source-over'
}

export default function Editor({ item, onClose, onSave }) {
  useBack(true, onClose)
  const [img, setImg] = useState(null)
  const [tab, setTab] = useState('filters')
  const [preset, setPreset] = useState('Original')
  const [adj, setAdj] = useState(ZERO)
  const [sel, setSel] = useState('bright')
  const [rot, setRot] = useState(0)
  const [flip, setFlip] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 })
  const [ratio, setRatio] = useState(0)
  const [compare, setCompare] = useState(false)
  const [saving, setSaving] = useState(false)
  const [thumbs, setThumbs] = useState({})
  const canvas = useRef()
  const base = useRef(null)
  const area = useRef()

  useEffect(() => {
    fileUrl(item.id).then((u) => { const i = new Image(); i.onload = () => setImg(i); i.src = u })
  }, [item.id])

  // oriented low-res working copy
  useEffect(() => {
    if (!img) return
    const [ow, oh] = orientedSize(img, rot)
    base.current = drawOriented(img, rot, flip, Math.min(1, 1400 / Math.max(ow, oh)))
    setCrop({ x: 0, y: 0, w: 1, h: 1 })
  }, [img, rot, flip])

  // filter thumbnails
  useEffect(() => {
    if (!img) return
    const small = drawOriented(img, 0, false, 140 / Math.max(img.naturalWidth, img.naturalHeight))
    const t = {}
    for (const p in PRESETS) { const c = document.createElement('canvas'); renderTo(c, small, { x: 0, y: 0, w: 1, h: 1 }, combined(ZERO, p)); t[p] = c.toDataURL('image/jpeg', 0.7) }
    setThumbs(t)
  }, [img])

  // live preview
  useEffect(() => {
    if (!base.current || !canvas.current) return
    const id = requestAnimationFrame(() => {
      const f = compare ? combined(ZERO, 'Original') : combined(adj, preset)
      renderTo(canvas.current, base.current, tab === 'crop' ? { x: 0, y: 0, w: 1, h: 1 } : crop, f)
    })
    return () => cancelAnimationFrame(id)
  }, [img, rot, flip, adj, preset, crop, tab, compare])

  const save = async () => {
    setSaving(true)
    try {
      const [ow, oh] = orientedSize(img, rot)
      const k = Math.min(1, 4096 / Math.max(ow, oh))
      const src = drawOriented(img, rot, flip, k)
      const out = document.createElement('canvas')
      renderTo(out, src, crop, combined(adj, preset))
      const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.93))
      const name = item.name.replace(/\.[^.]+$/, '') + '_edit_' + Date.now().toString(36) + '.jpg'
      await onSave(new File([blob], name, { type: 'image/jpeg', lastModified: item.date + 1 }), item)
      onClose()
    } finally { setSaving(false) }
  }

  const val = adj[sel]
  const reset = () => { setPreset('Original'); setAdj(ZERO); setRot(0); setFlip(false); setCrop({ x: 0, y: 0, w: 1, h: 1 }) }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black safe-t safe-b">
      <div className="flex items-center gap-2 px-2 py-2">
        <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><X /></button>
        <div className="flex-1 text-center font-semibold">Edit</div>
        <button onClick={reset} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><RotateCcw size={20} /></button>
        <button onClick={save} disabled={!img || saving} className="rounded-full grad px-5 py-2 text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save copy'}</button>
      </div>

      <div ref={area} className="relative flex-1 overflow-hidden">
        <div className="absolute inset-3 grid place-items-center">
          <canvas ref={canvas} className="max-h-full max-w-full" />
          {tab === 'crop' && <CropBox canvas={canvas} crop={crop} setCrop={setCrop} ratio={ratio === -1 ? (base.current ? base.current.width / base.current.height : 1) : ratio} />}
        </div>
        {!img && <div className="absolute inset-0 grid place-items-center text-white/50">Loading…</div>}
        {tab !== 'crop' && (
          <button onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs ring-1 ring-white/20"><Eye size={14} /> Hold to compare</button>
        )}
      </div>

      <div className="border-t border-white/10 bg-[var(--card)]">
        {tab === 'filters' && (
          <div className="flex gap-3 overflow-x-auto px-3 py-3 no-scrollbar">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} onClick={() => setPreset(p)} className="flex shrink-0 flex-col items-center gap-1.5">
                <span className={`block h-16 w-16 overflow-hidden rounded-2xl ring-2 ${preset === p ? 'ring-[var(--ac2)]' : 'ring-transparent'}`}>
                  {thumbs[p] && <img src={thumbs[p]} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className={`text-[11px] ${preset === p ? 'font-bold text-white' : 'text-white/60'}`}>{p}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'adjust' && (
          <div className="px-4 pb-1 pt-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold">{ADJ.find((a) => a[0] === sel)[1]}</span>
              <span className="tabular text-white/60">{val > 0 ? '+' : ''}{val}</span>
            </div>
            <input type="range" className="rng" min={sel === 'fade' || sel === 'vignette' ? 0 : -100} max="100" value={val}
              style={{ '--p': `${((val - (sel === 'fade' || sel === 'vignette' ? 0 : -100)) / (sel === 'fade' || sel === 'vignette' ? 100 : 200)) * 100}%` }}
              onChange={(e) => setAdj((a) => ({ ...a, [sel]: +e.target.value }))} onDoubleClick={() => setAdj((a) => ({ ...a, [sel]: 0 }))} />
            <div className="flex justify-between gap-1 overflow-x-auto py-2 no-scrollbar">
              {ADJ.map(([k, l, I]) => (
                <button key={k} onClick={() => setSel(k)} className={`flex min-w-[58px] flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] ${sel === k ? 'text-white' : 'text-white/50'}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-full ${sel === k ? 'grad' : adj[k] ? 'bg-white/15' : 'bg-white/6'}`}><I size={18} /></span>{l}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'crop' && (
          <div className="px-3 py-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {RATIOS.map(([l, r]) => (
                <button key={l} onClick={() => { setRatio(r); setCrop({ x: 0, y: 0, w: 1, h: 1 }) }} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${ratio === r ? 'grad' : 'bg-white/8 text-white/70'}`}>{l}</button>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-4">
              <button onClick={() => setRot((r) => (r + 90) % 360)} className="flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-2.5 text-sm"><RotateCw size={18} /> Rotate</button>
              <button onClick={() => setFlip((f) => !f)} className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm ${flip ? 'grad' : 'bg-white/8'}`}><FlipHorizontal2 size={18} /> Flip</button>
              <button onClick={() => setTab('adjust')} className="flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-2.5 text-sm"><Check size={18} /> Done</button>
            </div>
          </div>
        )}
        <div className="flex justify-around border-t border-white/5 py-1.5">
          {[['filters', 'Filters', Wand2], ['adjust', 'Adjust', Sun], ['crop', 'Crop & rotate', Crop]].map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex flex-col items-center gap-0.5 px-4 py-1 text-[11px] ${tab === k ? 'grad-text font-bold' : 'text-white/55'}`}>
              <I size={20} className={tab === k ? 'text-[var(--ac2)]' : ''} />{l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CropBox({ canvas, crop, setCrop, ratio }) {
  const [box, setBox] = useState(null)
  const drag = useRef(null)
  useEffect(() => {
    const upd = () => { const c = canvas.current; if (c) setBox({ l: c.offsetLeft, t: c.offsetTop, w: c.clientWidth, h: c.clientHeight }) }
    upd(); const h = setInterval(upd, 300); return () => clearInterval(h)
  }, [canvas])
  // apply aspect ratio on change
  useEffect(() => {
    if (!box || !ratio) return
    setCrop(() => {
      let w = box.w, h = w / ratio
      if (h > box.h) { h = box.h; w = h * ratio }
      return { x: (1 - w / box.w) / 2, y: (1 - h / box.h) / 2, w: w / box.w, h: h / box.h }
    })
  }, [ratio, box?.w, box?.h]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!box) return null
  const r = { x: crop.x * box.w, y: crop.y * box.h, w: crop.w * box.w, h: crop.h * box.h }

  const down = (which) => (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { which, sx: e.clientX, sy: e.clientY, r } }
  const move = (e) => {
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    let { x, y, w, h } = d.r
    const MIN = 48
    if (d.which === 'move') { x = clamp(x + dx, 0, box.w - w); y = clamp(y + dy, 0, box.h - h) }
    else {
      const L = d.which.includes('l'), T = d.which.includes('t')
      let nw = clamp(L ? w - dx : w + dx, MIN, L ? x + w : box.w - x)
      let nh = clamp(T ? h - dy : h + dy, MIN, T ? y + h : box.h - y)
      if (ratio) { nh = nw / ratio; const maxH = T ? y + h : box.h - y; if (nh > maxH) { nh = maxH; nw = nh * ratio } }
      if (L) x = x + w - nw
      if (T) y = y + h - nh
      w = nw; h = nh
    }
    setCrop({ x: x / box.w, y: y / box.h, w: w / box.w, h: h / box.h })
  }
  const up = () => { drag.current = null }
  const H = (pos, cls) => <span onPointerDown={down(pos)} className={`absolute h-7 w-7 ${cls}`} style={{ touchAction: 'none' }}><span className="absolute inset-1.5 rounded-sm border-white" style={{ borderWidth: 0, [`border${pos.includes('t') ? 'Top' : 'Bottom'}Width`]: 4, [`border${pos.includes('l') ? 'Left' : 'Right'}Width`]: 4 }} /></span>

  return (
    <div className="absolute" style={{ left: box.l, top: box.t, width: box.w, height: box.h, touchAction: 'none' }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="absolute" onPointerDown={down('move')} style={{ left: r.x, top: r.y, width: r.w, height: r.h, boxShadow: '0 0 0 9999px rgba(0,0,0,.6)', outline: '1px solid rgba(255,255,255,.8)', touchAction: 'none' }}>
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {[...Array(9)].map((_, i) => <span key={i} className="border border-white/20" />)}
        </div>
        {H('tl', '-left-2 -top-2')}{H('tr', '-right-2 -top-2')}{H('bl', '-left-2 -bottom-2')}{H('br', '-right-2 -bottom-2')}
      </div>
    </div>
  )
}
