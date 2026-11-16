import { useRef } from 'react'
import { Play, Pause, SkipForward, Music2 } from 'lucide-react'
import { usePlayer, current, toggle, next } from './player'
import { useThumb } from '../lib/util'

export function Cover({ it, size = 48, round = 'rounded-xl', className = '' }) {
  const u = useThumb(it?.id, !!it?.hasThumb)
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-violet-500/30 to-pink-500/20 ${round} ${className}`} style={{ width: size, height: size }}>
      {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : <Music2 size={typeof size === 'number' ? size * 0.42 : 40} className="text-white/60" />}
    </span>
  )
}

export function MiniPlayer({ onOpen }) {
  const P = usePlayer()
  const it = current()
  const y0 = useRef(null)
  if (!it) return null
  const pct = P.dur ? (P.t / P.dur) * 100 : 0
  return (
    <div className="fixed inset-x-2 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 overflow-hidden rounded-2xl glass ring-1 ring-white/10 shadow-2xl anim-pop"
      onClick={onOpen}
      onTouchStart={(e) => { y0.current = e.touches[0].clientY }}
      onTouchEnd={(e) => { if (y0.current - e.changedTouches[0].clientY > 30) onOpen(); y0.current = null }}>
      <div className="flex items-center gap-3 p-2 pr-3">
        <Cover it={it} size={44} round="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{it.tags?.title || it.name}</div>
          <div className="truncate text-xs text-white/55">{it.tags?.artist || 'Unknown artist'}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggle() }} className="grid h-10 w-10 place-items-center rounded-full bg-white text-black active:scale-90">
          {P.playing ? <Pause size={18} fill="#000" /> : <Play size={18} fill="#000" className="ml-0.5" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); next() }} className="grid h-10 w-10 place-items-center rounded-full active:bg-white/10"><SkipForward size={20} fill="#fff" /></button>
      </div>
      <div className="h-[2px] bg-white/10"><div className="h-full grad" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

