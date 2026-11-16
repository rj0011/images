import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { Images, LayoutGrid, Music2, Settings, Share2, Heart, FolderPlus, EyeOff, Trash2, RotateCcw, Download, Eye, Album, Lock, ListMusic, Plus, Pencil } from 'lucide-react'
import { getAll, putMany, del, kvGet, kvSet, askPersist } from './lib/db'
import { importFiles as runImport, deleteForever, shareItems, downloadItems, takeSharedInbox, uid } from './lib/media'
import { getLock } from './lib/lock'
import { Toaster, Dialogs, toast, ask, Empty } from './components/ui'
import PhotosTab from './components/Photos'
import { ACCENTS } from './lib/theme'
import Collection, { SelectBar } from './components/Collection'
import { useBack } from './lib/util'
import { LockScreen } from './components/Lock'
import { MiniPlayer } from './music/Mini'
import * as player from './music/player'

const Viewer = lazy(() => import('./components/Viewer'))
const VideoPlayer = lazy(() => import('./components/VideoPlayer'))
const Editor = lazy(() => import('./components/Editor'))
const AlbumsTab = lazy(() => import('./components/Albums'))
const MoreTab = lazy(() => import('./components/More'))
const MusicTab = lazy(() => import('./music/MusicTab'))
const FullPlayer = lazy(() => import('./music/NowPlaying').then((m) => ({ default: m.FullPlayer })))
const LockSettings = lazy(() => import('./components/Lock').then((m) => ({ default: m.LockSettings })))

const DEFAULTS = { accent: 'aurora', amoled: false, cols: 4, resume: true, autoNext: true, videoSpeed: 1 }
const MONTH = 30 * 86400000

export default function App() {
  const [items, setItemsS] = useState([])
  const [albums, setAlbumsS] = useState([])
  const [playlists, setPlaylistsS] = useState([])
  const [settings, setSettingsS] = useState(DEFAULTS)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('photos')
  const [cols, setCols] = useState(4)
  const [selected, setSelected] = useState(new Set())
  const [viewer, setViewer] = useState(null)
  const [video, setVideo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [coll, setColl] = useState(null)
  const [full, setFull] = useState(false)
  const [imp, setImp] = useState(null)
  const [locked, setLocked] = useState(() => { const l = getLock(); return !!(l.hash && l.appLock) })
  const [vaultGate, setVaultGate] = useState(false)
  const [lockSheet, setLockSheet] = useState(null) // {startDraw, then}
  const itemsRef = useRef([]); const albumsRef = useRef([]); const plRef = useRef([])
  const fileIn = useRef(); const dirIn = useRef()

  const setItems = (n) => { itemsRef.current = n; setItemsS(n) }
  const setAlbums = (n) => { albumsRef.current = n; setAlbumsS(n); putMany('albums', n) }
  const setPlaylists = (n) => { plRef.current = n; setPlaylistsS(n); putMany('playlists', n) }
  const setSettings = (p) => setSettingsS((s) => { const n = { ...s, ...p }; kvSet('settings', n); if (p.cols) setCols(p.cols); return n })

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      const [m, a, p, s] = await Promise.all([getAll('media'), getAll('albums'), getAll('playlists'), kvGet('settings', {})])
      const now = Date.now()
      const old = m.filter((x) => x.trashed && now - x.trashed > MONTH)
      for (const x of old) await deleteForever(x.id)
      const live = m.filter((x) => !old.includes(x)).sort((a, b) => b.date - a.date)
      setItems(live); albumsRef.current = a.sort((x, y) => x.created - y.created); setAlbumsS(albumsRef.current)
      plRef.current = p.sort((x, y) => x.created - y.created); setPlaylistsS(plRef.current)
      const st = { ...DEFAULTS, ...s }; setSettingsS(st); setCols(st.cols)
      setReady(true)
      await player.restore(new Map(live.map((x) => [x.id, x])))
      // files shared from other apps / opened with Images
      if (/shared=1/.test(location.search)) {
        history.replaceState(null, '', location.pathname)
        const f = await takeSharedInbox(); if (f.length) importFiles(f, { source: 'share' })
      }
    })()
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (params) => {
        const files = await Promise.all((params.files || []).map((h) => h.getFile()))
        if (files.length) importFiles(files, { openFirst: true })
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // theme
  useEffect(() => {
    const [a, b] = ACCENTS[settings.accent] || ACCENTS.aurora
    document.documentElement.style.setProperty('--ac', a)
    document.documentElement.style.setProperty('--ac2', b)
    document.documentElement.classList.toggle('amoled', !!settings.amoled)
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', settings.amoled ? '#000000' : '#0a0710')
  }, [settings.accent, settings.amoled])

  // lock again after 30s in background
  useEffect(() => {
    let hiddenAt = 0
    const h = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 30000) {
        const l = getLock()
        if (l.hash && l.appLock) setLocked(true)
        setColl((c) => (c?.type === 'vault' ? null : c))
      }
    }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  // ---------- derived ----------
  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items])
  const visible = useMemo(() => items.filter((x) => !x.trashed && !x.hidden), [items])
  const visual = useMemo(() => visible.filter((x) => x.kind !== 'audio'), [visible])
  const audio = useMemo(() => visible.filter((x) => x.kind === 'audio'), [visible])
  const trashed = useMemo(() => items.filter((x) => x.trashed).sort((a, b) => b.trashed - a.trashed), [items])
  const vault = useMemo(() => items.filter((x) => x.hidden && !x.trashed), [items])
  useEffect(() => { player.syncItems(byId) }, [byId])
  useEffect(() => { player.setHooks({ onPlay: (it) => bumpPlays(it.id) }) })

  // ---------- item actions ----------
  const patch = (ids, fn) => {
    const s = new Set(ids)
    const changed = []
    const next = itemsRef.current.map((it) => { if (!s.has(it.id)) return it; const n = { ...it, ...(typeof fn === 'function' ? fn(it) : fn) }; changed.push(n); return n })
    setItems(next); putMany('media', changed)
  }
  const bumpPlays = (id) => patch([id], (it) => ({ plays: (it.plays || 0) + 1, lastPlayed: Date.now() }))
  const toggleFav = (ids, v) => { patch(ids, { fav: v }); toast(v ? '❤️ Added to favourites' : 'Removed from favourites') }
  const trash = (ids) => {
    const now = Date.now()
    patch(ids, { trashed: now })
    toast(`🗑️ ${ids.length} moved to recycle bin`, { label: 'UNDO', fn: () => patch(ids, { trashed: 0 }) })
  }
  const restore = (ids) => { patch(ids, { trashed: 0 }); toast(`♻️ ${ids.length} restored`) }
  const purge = async (ids) => {
    if (!(await ask({ title: `Delete ${ids.length} forever?`, body: 'This cannot be undone.', ok: 'Delete forever', danger: true }))) return true
    for (const id of ids) await deleteForever(id)
    const s = new Set(ids); setItems(itemsRef.current.filter((x) => !s.has(x.id)))
    toast('Deleted forever')
  }
  const emptyTrash = () => purge(trashed.map((x) => x.id))
  const setHidden = (ids, v) => {
    patch(ids, { hidden: v })
    if (v && !getLock().hash) toast('🔒 Moved to Vault – set a pattern to lock it', { label: 'SET', fn: () => setLockSheet({ startDraw: true }) })
    else toast(v ? `🔒 ${ids.length} moved to Vault` : `👁️ ${ids.length} moved out of Vault`)
  }
  const share = async (list) => { try { if (!(await shareItems(list))) toast('Sharing not supported here') } catch (e) { if (e?.name !== 'AbortError') toast('Could not share') } return true }
  const download = async (list) => { toast(`⬇️ Saving ${list.length} to Downloads…`); await downloadItems(list) }

  // albums
  const newAlbum = async (ids = []) => {
    const name = await ask({ title: 'New album', input: 'Album name', ok: 'Create' })
    if (!name) return null
    const a = { id: uid(), name, created: Date.now() }
    setAlbums([...albumsRef.current, a])
    if (ids.length) { patch(ids, (it) => ({ albums: [...new Set([...(it.albums || []), a.id])] })); toast(`Added to “${name}”`) }
    return a
  }
  const addToAlbum = async (ids) => {
    const v = await ask({
      title: `Add ${ids.length} to album`,
      actions: [{ value: '__new', label: 'New album', icon: Plus }, ...albumsRef.current.map((a) => ({ value: a.id, label: a.name, icon: Album }))],
    })
    if (!v) return true
    if (v === '__new') { await newAlbum(ids); return }
    patch(ids, (it) => ({ albums: [...new Set([...(it.albums || []), v])] }))
    toast(`Added to “${albumsRef.current.find((a) => a.id === v)?.name}”`)
  }
  const removeFromAlbum = (aid, ids) => { patch(ids, (it) => ({ albums: (it.albums || []).filter((x) => x !== aid) })); toast('Removed from album') }
  const albumMenu = async (a) => {
    const v = await ask({ title: a.name, actions: [{ value: 'ren', label: 'Rename album', icon: Pencil }, { value: 'del', label: 'Delete album (keeps photos)', icon: Trash2, danger: true }] })
    if (v === 'ren') { const n = await ask({ title: 'Rename album', input: 'Name', value: a.name, ok: 'Save' }); if (n) setAlbums(albumsRef.current.map((x) => (x.id === a.id ? { ...x, name: n } : x))) }
    if (v === 'del' && (await ask({ title: `Delete “${a.name}”?`, body: 'Photos stay in your library.', ok: 'Delete', danger: true }))) {
      setAlbums(albumsRef.current.filter((x) => x.id !== a.id)); del('albums', a.id)
      patch(itemsRef.current.filter((x) => x.albums?.includes(a.id)).map((x) => x.id), (it) => ({ albums: it.albums.filter((x) => x !== a.id) }))
      setColl(null)
    }
  }

  // playlists
  const newPlaylist = async (ids = []) => {
    const name = await ask({ title: 'New playlist', input: 'Playlist name', ok: 'Create' })
    if (!name) return
    setPlaylists([...plRef.current, { id: uid(), name, ids, created: Date.now() }])
    toast(ids.length ? `Added to “${name}”` : 'Playlist created')
  }
  const addToPlaylist = async (ids) => {
    const v = await ask({ title: 'Add to playlist', actions: [{ value: '__new', label: 'New playlist', icon: Plus }, ...plRef.current.map((p) => ({ value: p.id, label: p.name, sub: `${p.ids.length} songs`, icon: ListMusic }))] })
    if (!v) return
    if (v === '__new') return newPlaylist(ids)
    setPlaylists(plRef.current.map((p) => (p.id === v ? { ...p, ids: [...p.ids, ...ids.filter((i) => !p.ids.includes(i))] } : p)))
    toast(`Added to “${plRef.current.find((p) => p.id === v)?.name}”`)
  }
  const plUpdate = (id, fn) => setPlaylists(plRef.current.map((p) => (p.id === id ? { ...p, ...fn(p) } : p)))
  const renamePlaylist = (id, name) => plUpdate(id, () => ({ name }))
  const movePlaylistItem = (id, i, d) => plUpdate(id, (p) => { const a = [...p.ids]; const j = i + d; if (j < 0 || j >= a.length) return {}; [a[i], a[j]] = [a[j], a[i]]; return { ids: a } })
  const removeFromPlaylist = (id, i) => plUpdate(id, (p) => ({ ids: p.ids.filter((_, k) => k !== i) }))
  const deletePlaylist = async (p) => {
    if (!(await ask({ title: `Delete “${p.name}”?`, body: 'Songs stay in your library.', ok: 'Delete', danger: true }))) return
    setPlaylists(plRef.current.filter((x) => x.id !== p.id)); del('playlists', p.id)
  }

  // ---------- import ----------
  const importFiles = useCallback(async (files, opts = {}) => {
    if (!files?.length) return []
    if (!opts.quiet) setImp({ done: 0, total: files.length })
    askPersist()
    const { items: added, folders, skipped } = await runImport(files, {
      existing: itemsRef.current, source: opts.source,
      onProgress: (d, t) => !opts.quiet && setImp({ done: d, total: t }),
    })
    // folder → album
    let al = [...albumsRef.current]
    const map = {}
    for (const [name, ids] of Object.entries(folders)) {
      let a = al.find((x) => x.folder && x.name === name)
      if (!a) { a = { id: uid(), name, folder: true, created: Date.now() }; al.push(a) }
      ids.forEach((id) => { map[id] = a.id })
    }
    if (al.length !== albumsRef.current.length) setAlbums(al)
    const withAlbums = added.map((x) => (map[x.id] ? { ...x, albums: [map[x.id]] } : x))
    if (Object.keys(map).length) putMany('media', withAlbums.filter((x) => map[x.id]))
    setItems([...itemsRef.current, ...withAlbums].sort((a, b) => b.date - a.date))
    setImp(null)
    if (!opts.quiet) toast(added.length ? `✨ Added ${added.length} item${added.length > 1 ? 's' : ''}${skipped ? ` · ${skipped} skipped (duplicate/unsupported)` : ''}` : 'Nothing new to add (already in Images)')
    if (opts.openFirst && withAlbums[0]) setTimeout(() => open(withAlbums[0], withAlbums), 300)
    return withAlbums
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = (e) => { const f = [...e.target.files]; e.target.value = ''; importFiles(f) }

  const saveEdited = async (file, orig) => {
    const [n] = await importFiles([file], { quiet: true })
    if (n) patch([n.id], { albums: orig.albums || [], date: orig.date + 1, hidden: orig.hidden })
    toast('✅ Saved as a new copy')
  }

  // ---------- open ----------
  const open = (it, list = [], opts = {}) => {
    if (it.kind === 'audio') { const songs = list.filter((x) => x.kind === 'audio'); player.playQueue(songs, Math.max(0, songs.indexOf(it)), { shuffle: false }); setFull(true); return }
    if (it.kind === 'video' && !opts.slideshow) { const vids = list.filter((x) => x.kind === 'video'); setVideo({ list: vids, index: Math.max(0, vids.indexOf(it)) }); return }
    const vis = list.filter((x) => x.kind !== 'audio')
    setViewer({ list: vis, index: Math.max(0, vis.indexOf(it)), slideshow: !!opts.slideshow })
  }
  const openCollection = (c) => {
    if (c.type === 'vault') {
      if (!getLock().hash) { setLockSheet({ startDraw: true, then: () => setColl({ type: 'vault' }) }); return }
      setVaultGate(true); return
    }
    setColl(c)
  }

  const app = {
    items, byId, visual, audio, trashed, albums, playlists, settings, setSettings, vaultCount: vault.length,
    toast, ask, icons: { Album, Lock, Download },
    pickFiles: () => fileIn.current.click(), pickFolder: () => dirIn.current.click(), importFiles,
    toggleFav, trash, restore, purge, emptyTrash, setHidden, share, download, bumpPlays,
    newAlbum, addToAlbum, removeFromAlbum, newPlaylist, addToPlaylist, renamePlaylist, movePlaylistItem, removeFromPlaylist, deletePlaylist,
    edit: (it) => setEditing(it), open, openCollection, openLock: () => setLockSheet({}),
  }

  // live view of current viewer list (reflect fav / deletes)
  const liveList = (list) => list.map((x) => byId.get(x.id)).filter((x) => x && !x.trashed)

  const baseActions = [
    { icon: Share2, label: 'Share', fn: (ids) => share(ids.map((i) => byId.get(i))) },
    { icon: Heart, label: 'Favourite', fn: (ids) => toggleFav(ids, !ids.every((i) => byId.get(i)?.fav)) },
    { icon: FolderPlus, label: 'Album', fn: (ids) => addToAlbum(ids) },
    { icon: EyeOff, label: 'Vault', fn: (ids) => setHidden(ids, true) },
    { icon: Trash2, label: 'Delete', fn: (ids) => trash(ids), danger: true },
  ]

  // ---------- collection page ----------
  let collView = null
  if (coll) {
    const c = coll
    if (c.type === 'album') {
      const a = albums.find((x) => x.id === c.id)
      if (a) collView = <Collection title={a.name} items={visual.filter((x) => x.albums?.includes(a.id))} onClose={() => setColl(null)} onOpen={open} menu={() => albumMenu(a)}
        actions={[baseActions[0], { icon: Download, label: 'Save', fn: (ids) => download(ids.map((i) => byId.get(i))) }, { icon: FolderPlus, label: 'Remove', fn: (ids) => removeFromAlbum(a.id, ids) }, baseActions[3], baseActions[4]]}
        empty={<Empty icon={Album} title="Empty album" sub="Long-press photos in the Photos tab → Album to add them here." />} />
    } else if (c.type === 'smart') {
      const f = { fav: (x) => x.fav, videos: (x) => x.kind === 'video', camera: (x) => x.exif?.make || /^(IMG|VID|PXL|DSC)[_-]?\d/i.test(x.name), shots: (x) => /screenshot/i.test(x.name), wa: (x) => /-WA\d+|whatsapp/i.test(x.name), recent: () => true }[c.key]
      let list = visual.filter(f)
      if (c.key === 'recent') list = [...list].sort((a, b) => b.added - a.added).slice(0, 120)
      collView = <Collection title={c.title} items={list} onClose={() => setColl(null)} onOpen={open} actions={baseActions} empty={<Empty icon={Heart} title="Nothing here yet" sub="Tap ❤️ on photos, videos and songs to add favourites." />} />
    } else if (c.type === 'vault') {
      collView = <Collection title="🔒 Vault" sub={`${vault.length} hidden items · only visible here`} items={vault.filter((x) => x.kind !== 'audio').concat(vault.filter((x) => x.kind === 'audio'))} onClose={() => setColl(null)} onOpen={open}
        actions={[baseActions[0], { icon: Eye, label: 'Unhide', fn: (ids) => setHidden(ids, false) }, { icon: Download, label: 'Save', fn: (ids) => download(ids.map((i) => byId.get(i))) }, baseActions[4]]}
        banner={<div className="mx-4 mb-3 rounded-2xl bg-white/5 p-3 text-xs text-white/60 ring-1 ring-white/10">Items here are hidden from Photos, Albums, Music & search. Vault closes automatically when you leave the app.</div>}
        empty={<Empty icon={Lock} title="Vault is empty" sub="Long-press photos/videos → Vault to hide them here." />} />
    } else if (c.type === 'trash') {
      collView = <Collection title="Recycle bin" sub={`${trashed.length} items · deleted forever after 30 days`} items={trashed} onClose={() => setColl(null)} onOpen={open} slideshow={false}
        actions={[{ icon: RotateCcw, label: 'Restore', fn: restore }, { icon: Trash2, label: 'Delete forever', fn: purge, danger: true }]}
        menu={trashed.length ? emptyTrash : null}
        empty={<Empty icon={Trash2} title="Recycle bin is empty" sub="Deleted items stay here for 30 days." />} />
    }
  }

  if (locked) return <><LockScreen onUnlock={() => setLocked(false)} onForgot={() => purgeVault()} /><Dialogs /></>
  async function purgeVault() { for (const x of itemsRef.current.filter((i) => i.hidden)) await deleteForever(x.id); setItems(itemsRef.current.filter((i) => !i.hidden)) }

  const selecting = selected.size > 0
  const nav = [['photos', 'Photos', Images], ['albums', 'Albums', LayoutGrid], ['music', 'Music', Music2], ['more', 'Settings', Settings]]

  return (
    <div className="mx-auto min-h-full max-w-3xl">
      <input ref={fileIn} type="file" multiple accept="image/*,video/*,audio/*,.mp3,.m4a,.flac,.wav,.ogg,.mkv" className="hidden" onChange={onPick} />
      <input ref={dirIn} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={onPick} />

      {!ready ? (
        <div className="grid h-screen place-items-center"><img src="./pwa-192.png" alt="" className="h-20 w-20 animate-pulse rounded-3xl" /></div>
      ) : (
        <main><Suspense fallback={<div className="grid h-[60vh] place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--ac2)]" /></div>}>
          {tab === 'photos' && <PhotosTab app={app} selected={selected} setSelected={setSelected} cols={cols} setCols={setCols} />}
          {tab === 'albums' && (
            <div className="safe-t">
              <h1 className="px-4 pb-1 pt-3 text-[26px] font-black">Albums</h1>
              <AlbumsTab app={app} openCollection={openCollection} />
            </div>
          )}
          {tab === 'music' && (
            <div className="safe-t">
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <h1 className="text-[26px] font-black">Music</h1>
                <button onClick={app.pickFiles} className="grid h-10 w-10 place-items-center rounded-full grad"><Plus size={20} /></button>
              </div>
              <MusicTab app={app} importBtn={<button onClick={app.pickFiles} className="rounded-2xl grad px-5 py-3 font-semibold">Add songs</button>} />
            </div>
          )}
          {tab === 'more' && <MoreTab app={app} />}
        </Suspense></main>
      )}

      {tab !== 'more' && !selecting && <MiniPlayer onOpen={() => setFull(true)} />}

      {!selecting && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 glass safe-b">
          <div className="mx-auto flex max-w-3xl">
            {nav.map(([k, l, I]) => (
              <button key={k} onClick={() => { if (tab === k) window.scrollTo({ top: 0, behavior: 'smooth' }); setTab(k) }} className="flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]">
                <span className={`grid h-8 w-14 place-items-center rounded-full transition ${tab === k ? 'grad shadow-lg shadow-fuchsia-500/25' : ''}`}><I size={20} className={tab === k ? 'text-white' : 'text-white/55'} /></span>
                <span className={tab === k ? 'font-semibold text-white' : 'text-white/50'}>{l}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {tab === 'photos' && <PhotoSelectBar selected={selected} setSelected={setSelected} items={visual} actions={baseActions} />}

      {collView}

      <Suspense fallback={null}>
        {viewer && <Viewer key={viewer.list[0]?.id + viewer.index} list={liveList(viewer.list)} index={Math.min(viewer.index, Math.max(0, liveList(viewer.list).length - 1))} startShow={viewer.slideshow}
          onClose={() => setViewer(null)} app={app} onPlayVideo={(it, list) => { const v = list.filter((x) => x.kind === 'video'); setVideo({ list: v, index: v.indexOf(it) }) }} />}
        {video && <VideoPlayer list={video.list} index={video.index} onClose={() => setVideo(null)} app={app} />}
        {editing && <Editor item={editing} onClose={() => setEditing(null)} onSave={saveEdited} />}
      </Suspense>

      {full && <Suspense fallback={null}><FullPlayer open={full} onClose={() => setFull(false)} app={app} /></Suspense>}

      {vaultGate && <div className="fixed inset-0 z-[120]"><LockScreen title="Vault" sub="Draw pattern to open Vault" onCancel={() => setVaultGate(false)}
        onUnlock={() => { setVaultGate(false); setColl({ type: 'vault' }) }} onForgot={purgeVault} /></div>}
      {lockSheet && <Suspense fallback={null}><LockSettings open={!!lockSheet} onClose={() => setLockSheet(null)} flash={toast} startDraw={lockSheet?.startDraw}
        onSet={() => { const t = lockSheet?.then; if (t) { setLockSheet(null); setTimeout(t, 50) } }} /></Suspense>}

      {imp && (
        <div className="fixed inset-x-4 top-4 z-[90] rounded-2xl glass p-3 ring-1 ring-white/10 shadow-2xl safe-t anim-pop">
          <div className="flex justify-between text-sm"><span className="font-semibold">✨ Adding to Images…</span><span className="tabular text-white/60">{imp.done}/{imp.total}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full grad transition-all" style={{ width: `${(imp.done / Math.max(1, imp.total)) * 100}%` }} /></div>
          <div className="mt-1.5 text-[11px] text-white/45">Keep the app open – making thumbnails & reading details</div>
        </div>
      )}
      <Toaster />
      <Dialogs />
    </div>
  )
}

function PhotoSelectBar(props) {
  useBack(props.selected.size > 0, () => props.setSelected(new Set()))
  return <SelectBar {...props} />
}
