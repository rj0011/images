import { useMemo, useState } from 'react'
import { Shuffle, Play, Music2, Disc3, Mic2, ListMusic, Plus, MoreVertical, Heart, Clock, Flame, ArrowLeft, Search, ListPlus, ListEnd, Share2, Trash2, X, ArrowUp, ArrowDown, Pencil } from 'lucide-react'
import { usePlayer, playQueue, playNext, addToQueue, current } from './player'
import { useThumb, fmtTime, useBack, searchMatch } from '../lib/util'
import { Empty, Seg, Btn } from '../components/ui'

export function Cover({ it, size = 48, round = 'rounded-xl', className = '' }) {
  const u = useThumb(it?.id, !!it?.hasThumb)
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-violet-500/30 to-pink-500/20 ${round} ${className}`} style={{ width: size, height: size }}>
      {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : <Music2 size={typeof size === 'number' ? size * 0.42 : 40} className="text-white/60" />}
    </span>
  )
}
export const Bars = ({ on }) => (
  <span className="flex h-4 items-end gap-[2px]">
    {[0, 1, 2].map((i) => <span key={i} className="w-[3px] rounded-sm bg-[var(--ac2)]" style={{ height: on ? undefined : '35%', animation: on ? `eqb .${7 + i}s ease-in-out ${i * 0.1}s infinite alternate` : 'none' }} />)}
    <style>{'@keyframes eqb{from{height:20%}to{height:100%}}'}</style>
  </span>
)

export function SongRow({ it, onPlay, app, extra }) {
  const cur = current()
  const P = usePlayer()
  const playing = cur?.id === it.id
  const menu = async (e) => {
    e.stopPropagation()
    const v = await app.ask({
      title: it.tags?.title || it.name,
      actions: [
        { value: 'next', label: 'Play next', icon: ListPlus },
        { value: 'queue', label: 'Add to queue', icon: ListEnd },
        { value: 'pl', label: 'Add to playlist', icon: ListMusic },
        { value: 'fav', label: it.fav ? 'Remove from favourites' : 'Add to favourites', icon: Heart },
        { value: 'share', label: 'Share', icon: Share2 },
        ...(extra?.actions || []),
        { value: 'del', label: 'Delete', icon: Trash2, danger: true },
      ],
    })
    if (v === 'next') { playNext(it); app.toast('Will play next') }
    if (v === 'queue') { addToQueue(it); app.toast('Added to queue') }
    if (v === 'pl') app.addToPlaylist([it.id])
    if (v === 'fav') app.toggleFav([it.id], !it.fav)
    if (v === 'share') app.share([it])
    if (v === 'del') app.trash([it.id])
    extra?.onAction?.(v)
  }
  return (
    <div onClick={onPlay} className="flex items-center gap-3 rounded-2xl px-2 py-2 active:bg-white/5">
      <Cover it={it} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[15px] font-medium ${playing ? 'grad-text' : ''}`}>{it.tags?.title || it.name}</div>
        <div className="truncate text-xs text-white/50">{it.tags?.artist || 'Unknown artist'} · {fmtTime(it.dur)}</div>
      </div>
      {playing && <Bars on={P.playing} />}
      {it.fav && <Heart size={14} fill="#ec4899" color="#ec4899" />}
      <button onClick={menu} className="grid h-9 w-9 place-items-center rounded-full text-white/60 active:bg-white/10"><MoreVertical size={18} /></button>
    </div>
  )
}

export default function MusicTab({ app, importBtn }) {
  const songs = app.audio
  const [view, setView] = useState('songs')
  const [sort, setSort] = useState('title')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [detail, setDetail] = useState(null) // {title, sub, items, playlist}
  useBack(!!detail, () => setDetail(null))
  useBack(searching, () => { setSearching(false); setQ('') })

  const sorted = useMemo(() => {
    const a = songs.filter((s) => searchMatch(s, q, []))
    const t = (x) => (x.tags?.title || x.name).toLowerCase()
    if (sort === 'title') a.sort((x, y) => t(x).localeCompare(t(y)))
    if (sort === 'recent') a.sort((x, y) => y.added - x.added)
    if (sort === 'artist') a.sort((x, y) => (x.tags?.artist || '~').localeCompare(y.tags?.artist || '~') || t(x).localeCompare(t(y)))
    return a
  }, [songs, sort, q])

  const groupsOf = (key) => {
    const m = new Map()
    for (const s of songs) { const k = s.tags?.[key] || (key === 'album' ? 'Unknown album' : 'Unknown artist'); if (!m.has(k)) m.set(k, []); m.get(k).push(s) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }

  if (!songs.length) {
    return (
      <Empty icon={Music2} title="Your music lives here" sub="Add MP3 / M4A / WAV / FLAC songs from your phone. Cover art, artist & album are read automatically.">
        {importBtn}
      </Empty>
    )
  }

  if (detail) {
    const items = detail.playlist ? detail.playlist.ids.map((id) => app.byId.get(id)).filter((x) => x && !x.trashed && !x.hidden) : detail.items
    const total = items.reduce((a, b) => a + (b.dur || 0), 0)
    return (
      <div className="anim-fade pb-40">
        <div className="relative overflow-hidden px-4 pb-5 pt-3">
          <div className="absolute inset-0 -z-10 opacity-40 blur-3xl">{items[0] && <Cover it={items[0]} size={600} round="" />}</div>
          <button onClick={() => setDetail(null)} className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-black/30"><ArrowLeft size={20} /></button>
          <div className="flex items-end gap-4">
            {items[0] ? <Cover it={items[0]} size={120} round="rounded-3xl" className="shadow-2xl" /> : <span className="grid h-[120px] w-[120px] place-items-center rounded-3xl grad"><ListMusic size={44} /></span>}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">{detail.kind}</div>
              <h2 className="truncate text-2xl font-extrabold">{detail.title}</h2>
              <div className="text-xs text-white/60">{items.length} songs · {fmtTime(total)}</div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Btn className="flex flex-1 items-center justify-center gap-2" disabled={!items.length} onClick={() => playQueue(items, 0, { shuffle: false })}><Play size={18} fill="#fff" /> Play</Btn>
            <Btn variant="ghost" className="flex flex-1 items-center justify-center gap-2" disabled={!items.length} onClick={() => playQueue(items, 0, { shuffle: true, random: true })}><Shuffle size={18} /> Shuffle</Btn>
            {detail.playlist && !detail.playlist.smart && (
              <button onClick={async () => { const n = await app.ask({ title: 'Rename playlist', input: 'Name', value: detail.playlist.name, ok: 'Save' }); if (n) { app.renamePlaylist(detail.playlist.id, n); setDetail({ ...detail, title: n, playlist: { ...detail.playlist, name: n } }) } }}
                className="grid w-12 place-items-center rounded-2xl bg-white/8"><Pencil size={18} /></button>
            )}
          </div>
        </div>
        <div className="px-2">
          {items.map((s, i) => (
            <div key={s.id + i} className="flex items-center">
              <div className="min-w-0 flex-1"><SongRow it={s} app={app} onPlay={() => playQueue(items, i, { shuffle: false })} /></div>
              {detail.playlist && !detail.playlist.smart && (
                <div className="flex flex-col">
                  <button className="p-1 text-white/40" onClick={() => app.movePlaylistItem(detail.playlist.id, i, -1)}><ArrowUp size={14} /></button>
                  <button className="p-1 text-white/40" onClick={() => app.movePlaylistItem(detail.playlist.id, i, 1)}><ArrowDown size={14} /></button>
                </div>
              )}
              {detail.playlist && !detail.playlist.smart && <button className="p-2 text-white/40" onClick={() => app.removeFromPlaylist(detail.playlist.id, i)}><X size={16} /></button>}
            </div>
          ))}
          {!items.length && <p className="py-10 text-center text-sm text-white/50">No songs yet. Use ⋮ → Add to playlist on any song.</p>}
        </div>
      </div>
    )
  }

  const fav = songs.filter((s) => s.fav)
  const recent = [...songs].sort((a, b) => b.added - a.added).slice(0, 50)
  const most = songs.filter((s) => s.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 50)

  return (
    <div className="pb-40">
      <div className="px-4 pt-2">
        {searching ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white/6 px-3 ring-1 ring-white/10">
            <Search size={18} className="text-white/50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song, artist, album…" className="flex-1 bg-transparent py-3 outline-none" />
            <button onClick={() => { setSearching(false); setQ('') }}><X size={18} /></button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Btn className="flex flex-1 items-center justify-center gap-2" onClick={() => playQueue(sorted, 0, { shuffle: true, random: true })}><Shuffle size={18} /> Shuffle all</Btn>
            <Btn variant="ghost" className="flex items-center justify-center gap-2 px-5" onClick={() => playQueue(sorted, 0, { shuffle: false })}><Play size={18} fill="#fff" /> Play</Btn>
            <button onClick={() => { setSearching(true); setView('songs') }} className="grid w-12 place-items-center rounded-2xl bg-white/8"><Search size={19} /></button>
          </div>
        )}
        <div className="mt-3"><Seg value={view} onChange={setView} options={[['songs', 'Songs'], ['albums', 'Albums'], ['artists', 'Artists'], ['playlists', 'Playlists']]} /></div>
      </div>

      {view === 'songs' && (
        <div className="px-2 pt-2">
          <div className="flex items-center justify-between px-2 pb-1 text-xs text-white/50">
            <span>{sorted.length} songs</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg bg-transparent py-1 text-right text-xs outline-none">
              <option value="title">A–Z</option><option value="artist">Artist</option><option value="recent">Recently added</option>
            </select>
          </div>
          {sorted.map((s, i) => <SongRow key={s.id} it={s} app={app} onPlay={() => playQueue(sorted, i, { shuffle: false })} />)}
        </div>
      )}

      {(view === 'albums' || view === 'artists') && (
        <div className="grid grid-cols-2 gap-3 px-4 pt-3">
          {groupsOf(view === 'albums' ? 'album' : 'artist').map(([name, items]) => (
            <button key={name} onClick={() => setDetail({ kind: view === 'albums' ? 'Album' : 'Artist', title: name, items })} className="text-left active:scale-[.98]">
              <Cover it={items.find((x) => x.hasThumb) || items[0]} size="100%" round={view === 'artists' ? 'rounded-full' : 'rounded-3xl'} className="aspect-square !h-auto" />
              <div className={`mt-2 truncate text-sm font-semibold ${view === 'artists' ? 'text-center' : ''}`}>{view === 'artists' ? <Mic2 size={12} className="mr-1 inline" /> : <Disc3 size={12} className="mr-1 inline" />}{name}</div>
              <div className={`text-xs text-white/50 ${view === 'artists' ? 'text-center' : ''}`}>{items.length} songs</div>
            </button>
          ))}
        </div>
      )}

      {view === 'playlists' && (
        <div className="space-y-1 px-3 pt-3">
          <button onClick={() => app.newPlaylist()} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 active:bg-white/5">
            <span className="grid h-14 w-14 place-items-center rounded-2xl grad"><Plus /></span><span className="font-semibold">New playlist</span>
          </button>
          {[
            { id: 'sm-fav', name: 'Favourites', icon: Heart, ids: fav.map((x) => x.id), smart: true },
            { id: 'sm-recent', name: 'Recently added', icon: Clock, ids: recent.map((x) => x.id), smart: true },
            { id: 'sm-most', name: 'Most played', icon: Flame, ids: most.map((x) => x.id), smart: true },
            ...app.playlists,
          ].map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 active:bg-white/5" onClick={() => setDetail({ kind: p.smart ? 'Smart playlist' : 'Playlist', title: p.name, playlist: p })}>
              {p.icon ? <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/8 text-[var(--ac2)]"><p.icon /></span>
                : <Cover it={app.byId.get(p.ids.find((id) => app.byId.get(id)?.hasThumb) || p.ids[0])} size={56} round="rounded-2xl" />}
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.name}</div><div className="text-xs text-white/50">{p.ids.length} songs</div></div>
              {!p.smart && <button onClick={(e) => { e.stopPropagation(); app.deletePlaylist(p) }} className="grid h-9 w-9 place-items-center rounded-full text-white/40"><Trash2 size={16} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
