import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, Lock, Unlock, PictureInPicture2, Gauge, Captions, Repeat, Repeat1,
  Maximize, Camera, Sun, Volume2, VolumeX, RotateCcw, Rewind, FastForward, ListVideo,
} from 'lucide-react'
import { fileUrl } from '../lib/media'
import { useBack, fmtTime, clamp, vibrate, useThumb } from '../lib/util'
import { kvGet, kvSet } from '../lib/db'
import { Sheet } from './ui'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const FITS = [['contain', 'Fit'], ['cover', 'Crop'], ['fill', 'Stretch'], ['zoom', 'Zoom 1.3×']]

function srtToVtt(t) {
  return 'WEBVTT\n\n' + t.replace(/\r/g, '').replace(/^\d+\s*$/gm, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2').trim()
}

export default function VideoPlayer({ list, index, onClose, app }) {
  const [idx, setIdx] = useState(index)
  const it = list[idx]
  const v = useRef()
  const wrap = useRef()
  const [src, setSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(it?.dur || 0)
  const [buf, setBuf] = useState(0)
  const [ui, setUi] = useState(true)
  const [locked, setLocked] = useState(false)
  const [speed, setSpeed] = useState(app.settings.videoSpeed || 1)
  const [fit, setFit] = useState('contain')
  const [bright, setBright] = useState(1)
  const [vol, setVol] = useState(1)
  const [hud, setHud] = useState(null) // gesture overlay
  const [ripple, setRipple] = useState(null)
  const [ab, setAb] = useState({ a: null, b: null })
  const [loop, setLoop] = useState(false)
  const [subs, setSubs] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [resumeAt, setResumeAt] = useState(null)
  const [boost, setBoost] = useState(false) // long-press 2x
  const hideT = useRef()
  const g = useRef({})
  useBack(true, () => close())

  const close = useCallback(() => {
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* ignore */ }
    try { screen.orientation?.unlock?.() } catch { /* ignore */ }
    onClose()
  }, [onClose])

  // load file + resume position
  useEffect(() => {
    if (!it) return
    let on = true
    setSrc(null); setT(0); setAb({ a: null, b: null }); setResumeAt(null)
    fileUrl(it.id).then(async (u) => {
      if (!on) return
      setSrc(u)
      const pos = app.settings.resume !== false ? await kvGet('pos:' + it.id, 0) : 0
      if (on && pos > 5) setResumeAt(pos)
    })
    app.bumpPlays(it.id)
    return () => { on = false }
  }, [it?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // fullscreen + landscape for wide videos
  useEffect(() => {
    const el = wrap.current
    el?.requestFullscreen?.({ navigationUI: 'hide' }).then(() => {
      if (it && it.w > it.h) screen.orientation?.lock?.('landscape').catch(() => {})
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // save position
  useEffect(() => {
    if (!it) return
    const h = setInterval(() => { const e = v.current; if (e && e.currentTime > 5 && e.duration - e.currentTime > 8) kvSet('pos:' + it.id, e.currentTime); }, 4000)
    return () => { clearInterval(h); const e = v.current; if (e && e.duration && e.duration - e.currentTime < 8) kvSet('pos:' + it.id, 0) }
  }, [it?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // media session (lock screen / notification controls)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !it) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.name, artist: 'Images' })
    const ms = navigator.mediaSession
    ms.setActionHandler('play', () => v.current?.play())
    ms.setActionHandler('pause', () => v.current?.pause())
    ms.setActionHandler('previoustrack', idx > 0 ? () => setIdx((i) => i - 1) : null)
    ms.setActionHandler('nexttrack', idx < list.length - 1 ? () => setIdx((i) => i + 1) : null)
    ms.setActionHandler('seekbackward', () => seek(-10))
    ms.setActionHandler('seekforward', () => seek(10))
  }, [it?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const poke = useCallback(() => {
    setUi(true); clearTimeout(hideT.current)
    hideT.current = setTimeout(() => { if (v.current && !v.current.paused) setUi(false) }, 3200)
  }, [])
  useEffect(() => { poke(); return () => clearTimeout(hideT.current) }, [poke])
  useEffect(() => { if (v.current) v.current.playbackRate = boost ? 2 : speed }, [speed, boost, src])
  useEffect(() => { if (v.current) v.current.volume = vol }, [vol])

  if (!it) return null

  const seek = (d) => { const e = v.current; if (!e) return; e.currentTime = clamp(e.currentTime + d, 0, e.duration || 0) }
  const toggle = () => { const e = v.current; if (!e) return; e.paused ? e.play() : e.pause(); poke() }
  const next = () => idx < list.length - 1 && setIdx(idx + 1)
  const prev = () => { if (v.current?.currentTime > 4) v.current.currentTime = 0; else if (idx > 0) setIdx(idx - 1) }

  const onTime = () => {
    const e = v.current
    setT(e.currentTime)
    if (e.buffered.length) setBuf(e.buffered.end(e.buffered.length - 1))
    if (ab.a != null && ab.b != null && e.currentTime >= ab.b) e.currentTime = ab.a
  }
  const onEnded = () => {
    kvSet('pos:' + it.id, 0)
    if (loop) { v.current.currentTime = 0; v.current.play(); return }
    if (app.settings.autoNext !== false && idx < list.length - 1) setIdx(idx + 1)
  }

  // ---------- gestures ----------
  const down = (e) => {
    if (e.target.closest('[data-ctl]')) return
    const r = wrap.current.getBoundingClientRect()
    g.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, side: e.clientX - r.left < r.width / 2 ? 'L' : 'R', mode: null, t0: v.current?.currentTime || 0, b0: bright, v0: vol, time: Date.now() }
    g.current.lp = setTimeout(() => { if (!g.current.mode && !locked) { g.current.mode = 'boost'; setBoost(true); vibrate(15) } }, 550)
  }
  const move = (e) => {
    const G = g.current
    if (!G.x || locked) return
    const dx = e.clientX - G.x, dy = e.clientY - G.y
    if (!G.mode && Math.hypot(dx, dy) > 14) { clearTimeout(G.lp); G.mode = Math.abs(dx) > Math.abs(dy) ? 'seek' : G.side === 'L' ? 'bright' : 'vol' }
    if (G.mode === 'seek') {
      const to = clamp(G.t0 + (dx / G.w) * Math.min(180, (dur || 60)), 0, dur)
      G.to = to
      setHud({ kind: 'seek', text: `${fmtTime(to)}`, sub: `${to >= G.t0 ? '+' : '-'}${fmtTime(Math.abs(to - G.t0))}` })
    } else if (G.mode === 'bright') {
      const b = clamp(G.b0 - dy / (G.h * 0.7), 0.15, 1.6)
      setBright(b); setHud({ kind: 'bright', val: (b - 0.15) / 1.45 })
    } else if (G.mode === 'vol') {
      const nv = clamp(G.v0 - dy / (G.h * 0.7), 0, 1)
      setVol(nv); setHud({ kind: 'vol', val: nv })
    }
  }
  const up = (e) => {
    const G = g.current
    clearTimeout(G.lp)
    if (!G.x) return
    g.current = {}
    if (G.mode === 'boost') { setBoost(false); return }
    if (G.mode === 'seek' && G.to != null) { v.current.currentTime = G.to; setHud(null); return }
    if (G.mode) { setTimeout(() => setHud(null), 500); return }
    if (locked) { poke(); return }
    // tap / double tap
    const now = Date.now()
    if (now - (wrap.current._lt || 0) < 300) {
      clearTimeout(wrap.current._tt); wrap.current._lt = 0
      const d = G.side === 'L' ? -10 : 10
      seek(d); vibrate(8)
      setRipple({ side: G.side, k: now })
      return
    }
    wrap.current._lt = now
    wrap.current._tt = setTimeout(() => (ui ? setUi(false) : poke()), 250)
    void e
  }

  const pip = async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.current.requestPictureInPicture() } catch { app.toast('Picture-in-picture not available') } }
  const shot = async () => {
    const e = v.current
    const c = document.createElement('canvas'); c.width = e.videoWidth; c.height = e.videoHeight
    c.getContext('2d').drawImage(e, 0, 0)
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
    await app.importFiles([new File([b], `Frame_${it.name.replace(/\.[^.]+$/, '')}_${fmtTime(e.currentTime).replace(/:/g, '-')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })], { quiet: true })
    app.toast('📸 Frame saved to gallery'); vibrate(20)
  }
  const abTap = () => {
    const now = v.current.currentTime
    if (ab.a == null) { setAb({ a: now, b: null }); app.toast('A point set – tap again for B') }
    else if (ab.b == null) { if (now > ab.a + 0.5) { setAb({ a: ab.a, b: now }); app.toast('Looping A ↔ B') } }
    else { setAb({ a: null, b: null }); app.toast('A-B loop off') }
  }
  const loadSubs = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    f.text().then((txt) => {
      const vtt = /^WEBVTT/.test(txt) ? txt : srtToVtt(txt)
      if (subs) URL.revokeObjectURL(subs)
      setSubs(URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })))
      app.toast('Subtitles loaded'); setSheet(null)
    })
  }
  const fitStyle = fit === 'zoom' ? { objectFit: 'cover', transform: 'scale(1.3)' } : { objectFit: fit }
  const pct = dur ? (t / dur) * 100 : 0

  return (
    <div ref={wrap} className="fixed inset-0 z-[80] overflow-hidden bg-black select-none" style={{ touchAction: 'none' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {src && (
        <video ref={v} src={src} autoPlay playsInline className="absolute inset-0 h-full w-full"
          style={{ ...fitStyle, filter: `brightness(${bright})` }}
          onPlay={() => { setPlaying(true); poke() }} onPause={() => { setPlaying(false); setUi(true) }}
          onTimeUpdate={onTime} onLoadedMetadata={(e) => setDur(e.target.duration)} onEnded={onEnded}>
          {subs && <track default kind="subtitles" src={subs} srcLang="en" label="Subtitles" />}
        </video>
      )}

      {ripple && (
        <div key={ripple.k} className={`pointer-events-none absolute inset-y-0 ${ripple.side === 'L' ? 'left-0' : 'right-0'} grid w-2/5 place-items-center`}>
          <div className="anim-ripple grid h-40 w-40 place-items-center rounded-full bg-white/15 text-sm font-semibold">
            {ripple.side === 'L' ? <><Rewind /> 10s</> : <><FastForward /> 10s</>}
          </div>
        </div>
      )}
      {hud && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-black/60 px-6 py-4 text-center backdrop-blur">
          {hud.kind === 'seek' ? (<><div className="text-3xl font-bold tabular">{hud.text}</div><div className="text-sm text-white/60">{hud.sub}</div></>) : (
            <div className="flex w-44 items-center gap-3">
              {hud.kind === 'bright' ? <Sun /> : hud.val === 0 ? <VolumeX /> : <Volume2 />}
              <div className="h-1.5 flex-1 rounded bg-white/20"><div className="h-full rounded grad" style={{ width: `${hud.val * 100}%` }} /></div>
            </div>
          )}
        </div>
      )}
      {boost && <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold">2× speed ▶▶</div>}

      {resumeAt != null && (
        <div data-ctl className="absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-2xl glass px-4 py-2.5 text-sm ring-1 ring-white/10">
          <span>Resume from <b>{fmtTime(resumeAt)}</b>?</span>
          <button className="font-bold grad-text" onClick={() => { v.current.currentTime = resumeAt; setResumeAt(null) }}>Resume</button>
          <button className="text-white/60" onClick={() => setResumeAt(null)}><RotateCcw size={16} /></button>
        </div>
      )}

      {locked ? (
        ui && <button data-ctl onClick={() => { setLocked(false); poke() }} className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur"><Unlock /></button>
      ) : ui && (
        <>
          <div data-ctl className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/80 to-transparent px-2 pb-10 pt-3 anim-fade">
            <button onClick={close} className="grid h-11 w-11 place-items-center rounded-full"><ArrowLeft /></button>
            <div className="min-w-0 flex-1 truncate font-semibold">{it.name}</div>
            <IB icon={Gauge} label={`${speed}×`} onClick={() => setSheet('speed')} />
            <IB icon={Captions} onClick={() => setSheet('subs')} on={!!subs} />
            <IB icon={PictureInPicture2} onClick={pip} />
            <IB icon={ListVideo} onClick={() => setSheet('more')} />
          </div>

          <div data-ctl className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-8">
            <button onClick={prev} className="grid h-12 w-12 place-items-center rounded-full bg-black/30"><SkipBack fill="#fff" /></button>
            <button onClick={toggle} className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur">
              {playing ? <Pause size={34} fill="#fff" /> : <Play size={34} fill="#fff" className="ml-1" />}
            </button>
            <button onClick={next} disabled={idx >= list.length - 1} className="grid h-12 w-12 place-items-center rounded-full bg-black/30 disabled:opacity-30"><SkipForward fill="#fff" /></button>
          </div>

          <div data-ctl className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14 safe-b anim-fade">
            <div className="flex items-center gap-3 text-xs tabular">
              <span>{fmtTime(t)}</span>
              <div className="relative flex-1">
                <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-white/15"><div className="h-full rounded bg-white/25" style={{ width: `${dur ? (buf / dur) * 100 : 0}%` }} /></div>
                {ab.a != null && <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-amber-300" style={{ left: `${(ab.a / dur) * 100}%` }} />}
                {ab.b != null && <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-amber-300" style={{ left: `${(ab.b / dur) * 100}%` }} />}
                <input type="range" className="rng relative" min="0" max={dur || 0} step="0.1" value={t} style={{ '--p': `${pct}%` }}
                  onChange={(e) => { v.current.currentTime = +e.target.value; setT(+e.target.value); poke() }} />
              </div>
              <span>{fmtTime(dur)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <IB icon={Lock} onClick={() => { setLocked(true); setUi(false); app.toast('Screen locked – tap 🔓 to unlock') }} />
              <IB icon={loop ? Repeat1 : Repeat} on={loop} onClick={() => setLoop((l) => !l)} />
              <button onClick={abTap} className={`rounded-full px-3 py-1.5 text-xs font-bold ${ab.a != null ? 'grad' : 'bg-white/10'}`}>{ab.a == null ? 'A-B' : ab.b == null ? 'A–?' : 'A↔B ✕'}</button>
              <IB icon={Camera} onClick={shot} />
              <IB icon={Maximize} label={FITS.find((f) => f[0] === fit)[1]} onClick={() => { const i = FITS.findIndex((f) => f[0] === fit); setFit(FITS[(i + 1) % FITS.length][0]); poke() }} />
            </div>
          </div>
        </>
      )}

      <Sheet open={sheet === 'speed'} onClose={() => setSheet(null)} title="Playback speed">
        <div className="grid grid-cols-5 gap-2">
          {SPEEDS.map((s) => <button key={s} onClick={() => { setSpeed(s); setSheet(null) }} className={`rounded-2xl py-3 text-sm font-bold ${speed === s ? 'grad' : 'bg-white/8'}`}>{s}×</button>)}
        </div>
        <p className="mt-3 text-xs text-white/50">Tip: press & hold anywhere on the video for 2× speed.</p>
      </Sheet>
      <Sheet open={sheet === 'subs'} onClose={() => setSheet(null)} title="Subtitles">
        <label className="block cursor-pointer rounded-2xl grad px-4 py-3 text-center font-semibold">
          Load subtitle file (.srt / .vtt)
          <input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={loadSubs} />
        </label>
        {subs && <button onClick={() => { setSubs(null); setSheet(null) }} className="mt-2 w-full rounded-2xl bg-white/8 py-3 text-sm">Turn off subtitles</button>}
      </Sheet>
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={`Up next · ${list.length} videos`}>
        <div className="space-y-1">
          {list.map((x, i) => (
            <button key={x.id} onClick={() => { setIdx(i); setSheet(null) }} className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left ${i === idx ? 'bg-white/10' : ''}`}>
              <Mini it={x} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{x.name}</span><span className="text-xs text-white/50">{fmtTime(x.dur)}</span></span>
              {i === idx && <span className="text-xs font-bold grad-text">Playing</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function IB({ icon: I, onClick, label, on }) {
  return (
    <button onClick={onClick} className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold ${on ? 'text-[var(--ac2)]' : ''}`}>
      <I size={21} />{label && <span>{label}</span>}
    </button>
  )
}
function Mini({ it }) {
  const u = useThumb(it.id, it.hasThumb)
  return <span className="block h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-white/5">{u && <img src={u} alt="" className="h-full w-full object-cover" />}</span>
}
