import { Heart, Film, Camera, Smartphone, Clock, Plus, Lock, Trash2, FolderOpen, MessageCircle, Image as ImageIcon } from 'lucide-react'
import { useThumb } from '../lib/util'

function AlbumCard({ name, items, icon: I, onClick, coverId }) {
  const cover = coverId ? items.find((x) => x.id === coverId) : items.find((x) => x.hasThumb)
  const u = useThumb(cover?.id, !!cover?.hasThumb)
  return (
    <button onClick={onClick} className="text-left active:scale-[.98] transition">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-white/5 ring-1 ring-white/10">
        {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-white/25"><ImageIcon size={34} /></div>}
        {I && <span className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/45 backdrop-blur"><I size={16} /></span>}
      </div>
      <div className="mt-2 truncate px-1 text-sm font-semibold">{name}</div>
      <div className="px-1 text-xs text-white/50">{items.length}</div>
    </button>
  )
}

export default function AlbumsTab({ app, openCollection }) {
  const V = app.visual
  const smart = [
    { key: 'fav', name: 'Favourites', icon: Heart, items: V.filter((x) => x.fav) },
    { key: 'videos', name: 'Videos', icon: Film, items: V.filter((x) => x.kind === 'video') },
    { key: 'camera', name: 'Camera', icon: Camera, items: V.filter((x) => x.exif?.make || /^(IMG|VID|PXL|DSC)[_-]?\d/i.test(x.name)) },
    { key: 'shots', name: 'Screenshots', icon: Smartphone, items: V.filter((x) => /screenshot/i.test(x.name)) },
    { key: 'wa', name: 'WhatsApp', icon: MessageCircle, items: V.filter((x) => /-WA\d+|whatsapp/i.test(x.name)) },
    { key: 'recent', name: 'Recently added', icon: Clock, items: [...V].sort((a, b) => b.added - a.added).slice(0, 120) },
  ].filter((s) => s.items.length || s.key === 'fav')

  return (
    <div className="px-4 pb-40 pt-2">
      <div className="grid grid-cols-3 gap-3">
        {smart.map((s) => <AlbumCard key={s.key} name={s.name} icon={s.icon} items={s.items} onClick={() => openCollection({ type: 'smart', key: s.key, title: s.name })} />)}
      </div>

      <div className="mb-3 mt-7 flex items-center justify-between">
        <h3 className="text-lg font-bold">My albums</h3>
        <button onClick={() => app.newAlbum()} className="flex items-center gap-1 rounded-full grad px-3 py-1.5 text-xs font-bold"><Plus size={15} /> New album</button>
      </div>
      {app.albums.length ? (
        <div className="grid grid-cols-2 gap-4">
          {app.albums.map((a) => {
            const items = V.filter((x) => x.albums?.includes(a.id))
            return <AlbumCard key={a.id} name={a.name} items={items} coverId={a.cover} icon={a.folder ? FolderOpen : null} onClick={() => openCollection({ type: 'album', id: a.id })} />
          })}
        </div>
      ) : <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/55">No albums yet. Select photos (long-press) → <b>Album</b>, or import a folder.</p>}

      <h3 className="mb-2 mt-7 text-lg font-bold">Utilities</h3>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => openCollection({ type: 'vault' })} className="flex items-center gap-3 rounded-2xl card p-4 text-left active:scale-[.98]">
          <span className="grid h-11 w-11 place-items-center rounded-xl grad"><Lock size={20} /></span>
          <span><span className="block font-semibold">Vault</span><span className="text-xs text-white/50">Hidden & locked</span></span>
        </button>
        <button onClick={() => openCollection({ type: 'trash' })} className="flex items-center gap-3 rounded-2xl card p-4 text-left active:scale-[.98]">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-500/20 text-rose-300"><Trash2 size={20} /></span>
          <span><span className="block font-semibold">Recycle bin</span><span className="text-xs text-white/50">{app.trashed.length} items · 30 days</span></span>
        </button>
      </div>
    </div>
  )
}
