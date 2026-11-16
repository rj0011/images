import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, SlidersVertical, Moon, Gauge, ListMusic, Heart, ListPlus, X, AudioWaveform } from 'lucide-react'
import { usePlayer, current, toggle, next, prev, seek, setShuffle, cycleRepeat, setEq, setSleep, setSpeed, jumpTo, removeFromQueue, getAnalyser, EQ_PRESETS, BANDS } from './player'
import { Cover } from './Mini'
import { useBack, fmtTime, useThumb } from '../lib/util'
import { Sheet, Toggle } from '../components/ui'

function Visualizer({ playing }) {
  const ref = useRef()
  useEffect(() => {
    const c = ref.current, x = c.getContext('2d')
    let raf
    const data = new Uint8Array(64)
    const draw = (ts) => {
      const W = (c.width = c.clientWidth * 2), H = (c.height = c.clientHeight * 2)
      const a = getAnalyser()
      if (a && playing) a.getByteFrequencyData(data)
      else for (let i = 0; i < data.length; i++) data[i] = playing ? 0 : 18 + 12 * Math.sin(ts / 600 + i / 3)
      const n = 40, bw = W / n
      const gr = x.createLinearGradient(0, 0, W, 0)
      gr.addColorStop(0, '#a78bfa'); gr.addColorStop(0.55, '#ec4899'); gr.addColorStop(1, '#f59e0b')
      x.fillStyle = gr
      for (let i = 0; i < n; i++) {
        const v = data[Math.min(63, Math.floor(Math.pow(i / n, 1.7) * 56) + 1)] / 255
        const h = Math.max(4, v * H * 0.95)
        x.globalAlpha = 0.35 + v * 0.65
        x.beginPath(); x.roundRect(i * bw + bw * 0.2, (H - h) / 2, bw * 0.6, h, bw * 0.3); x.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [playing])
  return <canvas ref={ref} className="h-16 w-full" />
}

export function FullPlayer({ open, onClose, app }) {
  useBack(open, onClose)
  const P = usePlayer()
  const it = current()
  const art = useThumb(it?.id, !!it?.hasThumb)
  const [sheet, setSheet] = useState(null)
  const [viz, setViz] = useState(true)
  const touch = useRef(null)
  const [dy, setDy] = useState(0)
  const [, tick] = useState(0)
  useEffect(() => { if (!P.sleepAt) return; const h = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(h) }, [P.sleepAt])
  useEffect(() => { if (open && !it) onClose() }, [open, it, onClose])
  if (!open || !it) return null

  const pct = P.dur ? (P.t / P.dur) * 100 : 0
  const sleepLeft = P.sleepAt ? Math.max(0, Math.ceil((P.sleepAt - Date.now()) / 1000)) : 0

  return (
    <div className="fixed inset-0 z-[65] overflow-hidden bg-[var(--bg)] anim-pop"
      style={{ transform: `translateY(${dy}px)`, transition: touch.current ? 'none' : 'transform .2s' }}
      onTouchStart={(e) => { if (e.target.closest('input,[data-noswipe]')) return; touch.current = e.touches[0].clientY }}
      onTouchMove={(e) => { if (touch.current != null) setDy(Math.max(0, e.touches[0].clientY - touch.current)) }}
      onTouchEnd={() => { if (dy > 140) onClose(); touch.current = null; setDy(0) }}>
      {art && <img src={art} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/90" />

      <div className="relative flex h-full flex-col px-6 safe-t safe-b">
        <div className="flex items-center justify-between py-3">
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/10"><ChevronDown /></button>
          <div className="text-center text-xs">
            <div className="font-semibold uppercase tracking-widest text-white/60">Now playing</div>
            {sleepLeft > 0 && <div className="text-[var(--ac)]"><Moon size={11} className="inline" /> {fmtTime(sleepLeft)}</div>}
            {P.sleepEnd && <div className="text-[var(--ac)]"><Moon size={11} className="inline" /> after this song</div>}
          </div>
          <button onClick={() => setViz((v) => !v)} className={`grid h-11 w-11 place-items-center rounded-full ${viz ? 'grad' : 'bg-white/10'}`}><AudioWaveform size={20} /></button>
        </div>

        <div className="flex flex-1 items-center justify-center py-4">
          <div className={`aspect-square w-full max-w-[340px] overflow-hidden rounded-[32px] shadow-[0_30px_80px_-20px_rgba(236,72,153,.45)] ring-1 ring-white/10 transition-transform duration-500 ${P.playing ? 'scale-100' : 'scale-[.86]'}`}>
            {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center grad"><Cover it={null} size={120} round="rounded-full" className="spin-slow" /></div>}
          </div>
        </div>

        {viz && <Visualizer playing={P.playing} />}

        <div className="mt-2 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-2xl font-extrabold">{it.tags?.title || it.name}</div>
            <div className="truncate text-sm text-white/60">{it.tags?.artist || 'Unknown artist'}{it.tags?.album ? ` · ${it.tags.album}` : ''}</div>
          </div>
          <button onClick={() => app.toggleFav([it.id], !it.fav)} className="grid h-11 w-11 place-items-center"><Heart fill={it.fav ? '#ec4899' : 'none'} color={it.fav ? '#ec4899' : '#fff'} /></button>
        </div>

        <div data-noswipe className="mt-3">
          <input type="range" className="rng" min="0" max={P.dur || 0} step="0.1" value={P.t} style={{ '--p': `${pct}%` }} onChange={(e) => seek(+e.target.value)} />
          <div className="flex justify-between text-xs text-white/55 tabular"><span>{fmtTime(P.t)}</span><span>-{fmtTime((P.dur || 0) - P.t)}</span></div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => setShuffle(!P.shuffle)} className={`grid h-12 w-12 place-items-center ${P.shuffle ? 'text-[var(--ac2)]' : 'text-white/70'}`}><Shuffle size={22} /></button>
          <button onClick={prev} className="grid h-14 w-14 place-items-center"><SkipBack size={30} fill="#fff" /></button>
          <button onClick={toggle} className="grid h-20 w-20 place-items-center rounded-full bg-white text-black shadow-xl active:scale-95">
            {P.playing ? <Pause size={34} fill="#000" /> : <Play size={34} fill="#000" className="ml-1" />}
          </button>
          <button onClick={() => next()} className="grid h-14 w-14 place-items-center"><SkipForward size={30} fill="#fff" /></button>
          <button onClick={cycleRepeat} className={`grid h-12 w-12 place-items-center ${P.repeat !== 'off' ? 'text-[var(--ac2)]' : 'text-white/70'}`}>{P.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}</button>
        </div>

        <div className="mb-3 mt-4 flex justify-around rounded-2xl bg-white/6 py-1.5 ring-1 ring-white/10">
          <Mini icon={SlidersVertical} label={P.eqOn ? P.eqPreset : 'EQ off'} on={P.eqOn && P.eqPreset !== 'Flat'} onClick={() => setSheet('eq')} />
          <Mini icon={Moon} label="Sleep" on={!!P.sleepAt || P.sleepEnd} onClick={() => setSheet('sleep')} />
          <Mini icon={Gauge} label={`${P.speed}×`} on={P.speed !== 1} onClick={() => setSheet('speed')} />
          <Mini icon={ListPlus} label="Playlist" onClick={() => app.addToPlaylist([it.id])} />
          <Mini icon={ListMusic} label="Queue" onClick={() => setSheet('queue')} />
        </div>
      </div>

      <Sheet open={sheet === 'eq'} onClose={() => setSheet(null)} title="Equalizer">
        <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
          <div><div className="font-semibold">Enhanced audio</div><div className="text-xs text-white/50">Equalizer & bass boost</div></div>
          <Toggle on={P.eqOn} onChange={(v) => setEq({ on: v })} />
        </div>
        <div className={`${P.eqOn ? '' : 'pointer-events-none opacity-40'}`}>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.keys(EQ_PRESETS).map((p) => <button key={p} onClick={() => setEq({ preset: p })} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${P.eqPreset === p ? 'grad' : 'bg-white/8 text-white/70'}`}>{p}</button>)}
          </div>
          <div className="mt-4 space-y-1">
            {BANDS.map((f, i) => (
              <div key={f} className="flex items-center gap-3">
                <span className="w-14 text-xs text-white/60">{f >= 1000 ? f / 1000 + 'k' : f} Hz</span>
                <input type="range" className="rng flex-1" min="-12" max="12" step="1" value={P.gains[i]} style={{ '--p': `${((P.gains[i] + 12) / 24) * 100}%` }} onChange={(e) => setEq({ band: i, gain: +e.target.value })} />
                <span className="w-10 text-right text-xs tabular">{P.gains[i] > 0 ? '+' : ''}{P.gains[i]} dB</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-white/45">Works with headphones & speaker. If sound ever stops in background, turn Enhanced audio off.</p>
        </div>
      </Sheet>
      <Sheet open={sheet === 'sleep'} onClose={() => setSheet(null)} title="Sleep timer">
        <div className="grid grid-cols-3 gap-2">
          {[[5, '5 min'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], ['end', 'End of song']].map(([m, l]) => (
            <button key={m} onClick={() => { setSleep(m); setSheet(null); app.toast(`🌙 Music stops ${m === 'end' ? 'after this song' : 'in ' + l}`) }} className="rounded-2xl bg-white/8 py-3.5 text-sm font-semibold">{l}</button>
          ))}
        </div>
        {(P.sleepAt || P.sleepEnd) && <button onClick={() => { setSleep(0); setSheet(null) }} className="mt-3 w-full rounded-2xl bg-rose-500/15 py-3 text-sm text-rose-300">Turn off timer</button>}
      </Sheet>
      <Sheet open={sheet === 'speed'} onClose={() => setSheet(null)} title="Playback speed">
        <div className="grid grid-cols-4 gap-2">
          {[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((s) => <button key={s} onClick={() => { setSpeed(s); setSheet(null) }} className={`rounded-2xl py-3 text-sm font-bold ${P.speed === s ? 'grad' : 'bg-white/8'}`}>{s}×</button>)}
        </div>
      </Sheet>
      <Sheet open={sheet === 'queue'} onClose={() => setSheet(null)} title={`Queue · ${P.order.length}`} full>
        {P.order.map((qi, pos) => {
          const s = P.queue[qi]; if (!s) return null
          return (
            <div key={pos + s.id} className={`flex items-center gap-3 rounded-2xl p-2 ${pos === P.pos ? 'bg-white/10' : pos < P.pos ? 'opacity-45' : ''}`} onClick={() => jumpTo(pos)}>
              <Cover it={s} size={42} />
              <div className="min-w-0 flex-1"><div className={`truncate text-sm ${pos === P.pos ? 'grad-text font-bold' : ''}`}>{s.tags?.title || s.name}</div><div className="truncate text-xs text-white/50">{s.tags?.artist || 'Unknown'}</div></div>
              {pos !== P.pos && <button onClick={(e) => { e.stopPropagation(); removeFromQueue(pos) }} className="p-2 text-white/40"><X size={16} /></button>}
            </div>
          )
        })}
      </Sheet>
    </div>
  )
}
function Mini({ icon: I, label, onClick, on }) {
  return (
    <button onClick={onClick} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] ${on ? 'text-[var(--ac2)]' : 'text-white/70'}`}>
      <I size={20} /><span className="max-w-full truncate px-1">{label}</span>
    </button>
  )
}
