import { useMemo, useState } from 'react'
import { Search, X, Plus, Grid3x3, Images, FolderPlus, Upload } from 'lucide-react'
import MediaGrid from './Grid'
import { searchMatch, useBack } from '../lib/util'
import { Empty, Btn } from './ui'

const FILTERS = [['all', 'All'], ['photo', 'Photos'], ['video', 'Videos'], ['fav', 'Favourites']]

export default function PhotosTab({ app, selected, setSelected, cols, setCols }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  useBack(searching, () => { setSearching(false); setQ('') })

  const list = useMemo(() => app.visual.filter((it) =>
    (filter === 'all' || (filter === 'fav' ? it.fav : it.kind === filter)) && searchMatch(it, q, app.albums)), [app.visual, filter, q, app.albums])
  const nP = app.visual.filter((x) => x.kind === 'photo').length
  const nV = app.visual.length - nP

  return (
    <div className="pb-40">
      <div className="sticky top-0 z-30 bg-[var(--bg)]/85 px-4 pb-2 pt-3 backdrop-blur-xl safe-t">
        {searching ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white/6 px-3 ring-1 ring-white/10">
            <Search size={18} className="text-white/50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, month, year, camera, album…" className="min-w-0 flex-1 bg-transparent py-3 outline-none" />
            <button onClick={() => { setSearching(false); setQ('') }} className="p-1"><X size={18} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <h1 className="text-[26px] font-black tracking-tight grad-text leading-none">Images</h1>
              <div className="mt-1 text-xs text-white/45">{nP.toLocaleString('en-IN')} photos · {nV.toLocaleString('en-IN')} videos</div>
            </div>
            <button onClick={() => setSearching(true)} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><Search size={21} /></button>
            <button onClick={() => setCols((c) => (c >= 6 ? 3 : c + 1))} className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10"><Grid3x3 size={20} /></button>
            <button onClick={app.pickFiles} className="grid h-11 w-11 place-items-center rounded-full grad shadow-lg shadow-fuchsia-500/25 active:scale-90"><Plus size={22} /></button>
          </div>
        )}
        {app.visual.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
            {FILTERS.map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${filter === k ? 'grad text-white' : 'bg-white/6 text-white/65'}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {!app.visual.length ? (
        <Empty icon={Images} title="Welcome to Images ✨" sub="Add photos & videos from your phone. They are copied into the app's private storage and work fully offline.">
          <div className="flex flex-col gap-2">
            <Btn onClick={app.pickFiles} className="flex items-center justify-center gap-2"><Upload size={18} /> Add photos, videos & music</Btn>
            <Btn variant="ghost" onClick={app.pickFolder} className="flex items-center justify-center gap-2"><FolderPlus size={18} /> Add a whole folder</Btn>
          </div>
        </Empty>
      ) : list.length ? (
        <MediaGrid items={list} cols={cols} setCols={setCols} selected={selected} setSelected={setSelected} onOpen={app.open} />
      ) : (
        <Empty icon={Search} title="No matches" sub={q ? `Nothing found for “${q}”` : 'Nothing in this filter yet'} />
      )}
    </div>
  )
}
