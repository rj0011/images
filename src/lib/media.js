// ---------- Import pipeline: save original, read metadata (EXIF / ID3), make thumbnail ----------
import { saveFile, loadFile, put, get, removeFile, del } from './db'

const EXT = {
  photo: /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i,
  video: /\.(mp4|m4v|webm|mkv|mov|3gp|ogv)$/i,
  audio: /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|amr|wma)$/i,
}
export function kindOf(file) {
  const t = file.type || ''
  if (t.startsWith('image/')) return 'photo'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  for (const k in EXT) if (EXT[k].test(file.name || '')) return k
  return null
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ---------- EXIF (JPEG) ----------
export function parseExif(buf) {
  try {
    const v = new DataView(buf)
    if (v.getUint16(0) !== 0xffd8) return null
    let o = 2
    while (o < v.byteLength - 4) {
      const m = v.getUint16(o)
      const len = v.getUint16(o + 2)
      if (m === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return readTiff(v, o + 10)
      if ((m & 0xff00) !== 0xff00) break
      o += 2 + len
    }
  } catch { /* ignore */ }
  return null
}
function readTiff(v, t) {
  const le = v.getUint16(t) === 0x4949
  const u16 = (p) => v.getUint16(p, le)
  const u32 = (p) => v.getUint32(p, le)
  const out = {}
  const str = (p, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c) } return s.trim() }
  const val = (e) => {
    const type = u16(e + 2), n = u32(e + 4)
    const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1
    const p = size * n > 4 ? t + u32(e + 8) : e + 8
    if (type === 2) return str(p, n)
    if (type === 3) return u16(p)
    if (type === 4) return u32(p)
    if (type === 5 || type === 10) {
      const arr = []
      for (let i = 0; i < n; i++) { const a = u32(p + i * 8), b = u32(p + i * 8 + 4); arr.push(b ? a / b : 0) }
      return n === 1 ? arr[0] : arr
    }
    return null
  }
  const ifd = (p, map) => {
    const n = u16(p)
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12
      const tag = u16(e)
      if (map[tag]) out[map[tag]] = val(e)
    }
  }
  ifd(t + u32(t + 4), { 0x010f: 'make', 0x0110: 'model', 0x0132: 'dateTime', 0x8769: '_exif', 0x8825: '_gps' })
  if (out._exif) ifd(t + out._exif, { 0x9003: 'dateTaken', 0x829a: 'exposure', 0x829d: 'fNumber', 0x8827: 'iso', 0x920a: 'focal', 0xa434: 'lens', 0x9209: 'flash' })
  if (out._gps) {
    const g = {}
    const n = u16(t + out._gps)
    for (let i = 0; i < n; i++) {
      const e = t + out._gps + 2 + i * 12
      const tag = u16(e)
      if (tag >= 1 && tag <= 4) g[tag] = tag % 2 ? String.fromCharCode(v.getUint8(e + 8)) : val(e)
    }
    const dms = (a) => (Array.isArray(a) ? a[0] + a[1] / 60 + a[2] / 3600 : null)
    if (g[2] && g[4]) { out.lat = dms(g[2]) * (g[1] === 'S' ? -1 : 1); out.lng = dms(g[4]) * (g[3] === 'W' ? -1 : 1) }
  }
  delete out._exif; delete out._gps
  return out
}
export function exifDate(s) {
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || '')
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null
}

// ---------- ID3 (mp3 tags + cover art) ----------
export function parseID3(buf) {
  const b = new Uint8Array(buf)
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null
  const ver = b[3]
  const ss = (p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3]
  const end = Math.min(10 + ss(6), b.length)
  let p = 10
  if (b[5] & 0x40) p += ver === 4 ? ss(10) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4
  const out = {}
  const dec = (enc, a) => {
    try {
      if (enc === 0) return new TextDecoder('latin1').decode(a)
      if (enc === 1) return new TextDecoder('utf-16').decode(a)
      if (enc === 2) return new TextDecoder('utf-16be').decode(a)
      return new TextDecoder('utf-8').decode(a)
    } catch { return '' }
  }
  const clean = (s) => s.replace(/\0+$/g, '').replace(/\0/g, ' / ').trim()
  const map = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', TYER: 'year', TDRC: 'year', TYE: 'year', TCON: 'genre', TCO: 'genre', TRCK: 'track', TRK: 'track' }
  while (p < end - 10) {
    let id, size, hdr
    if (ver === 2) {
      id = String.fromCharCode(b[p], b[p + 1], b[p + 2]); size = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5]; hdr = 6
    } else {
      id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])
      size = ver === 4 ? ss(p + 4) : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]
      hdr = 10
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id) || size <= 0 || p + hdr + size > b.length) break
    const d = b.subarray(p + hdr, p + hdr + size)
    if (map[id]) out[map[id]] = clean(dec(d[0], d.subarray(1)))
    else if (id === 'APIC' || id === 'PIC') {
      const enc = d[0]
      let q = 1, mime
      if (id === 'PIC') { mime = 'image/' + String.fromCharCode(d[1], d[2], d[3]).toLowerCase().replace('jpg', 'jpeg'); q = 4 }
      else { const z = d.indexOf(0, 1); mime = dec(0, d.subarray(1, z)) || 'image/jpeg'; q = z + 1 }
      q += 1 // picture type
      if (enc === 1 || enc === 2) { while (q < d.length - 1 && (d[q] || d[q + 1])) q += 2; q += 2 } else { while (q < d.length && d[q]) q++; q++ }
      if (!out.cover) out.cover = new Blob([d.slice(q)], { type: mime.includes('/') ? mime : 'image/jpeg' })
    }
    p += hdr + size
  }
  if (out.genre) out.genre = out.genre.replace(/^\((\d+)\)$/, '')
  return out
}
const id3Size = async (file) => {
  const h = new Uint8Array(await file.slice(0, 10).arrayBuffer())
  if (h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return 0
  return 10 + ((h[6] << 21) | (h[7] << 14) | (h[8] << 7) | h[9])
}

// ---------- thumbnails ----------
async function drawThumb(src, w, h) {
  const s = 320 / Math.min(w, h)
  const k = Math.min(1, s)
  let tw = Math.round(w * k), th = Math.round(h * k)
  if (Math.max(tw, th) > 720) { const r = 720 / Math.max(tw, th); tw = Math.round(tw * r); th = Math.round(th * r) }
  const c = document.createElement('canvas')
  c.width = tw; c.height = th
  c.getContext('2d').drawImage(src, 0, 0, tw, th)
  return new Promise((r) => c.toBlob(r, 'image/webp', 0.78))
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

async function videoInfo(file) {
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'
  const url = URL.createObjectURL(file)
  v.src = url
  try {
    await withTimeout(new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video')) }), 10000)
    const info = { dur: isFinite(v.duration) ? v.duration : 0, w: v.videoWidth, h: v.videoHeight }
    try {
      v.currentTime = Math.min(1.5, (info.dur || 0) * 0.1)
      await withTimeout(new Promise((res) => { v.onseeked = res }), 6000)
      if (info.w) info.thumb = await drawThumb(v, info.w, info.h)
    } catch { /* no thumb */ }
    return info
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url) }
}
async function audioDur(file) {
  const a = document.createElement('audio')
  const url = URL.createObjectURL(file)
  a.preload = 'metadata'; a.src = url
  try {
    await withTimeout(new Promise((res, rej) => { a.onloadedmetadata = res; a.onerror = rej }), 8000)
    return isFinite(a.duration) ? a.duration : 0
  } catch { return 0 } finally { URL.revokeObjectURL(url) }
}

// ---------- analyse one file ----------
export async function analyse(file, kind) {
  const meta = {}
  let thumb = null
  if (kind === 'photo') {
    if (/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name)) {
      const ex = parseExif(await file.slice(0, 256 * 1024).arrayBuffer())
      if (ex) { meta.exif = ex; meta.date = exifDate(ex.dateTaken || ex.dateTime) }
    }
    try {
      const bmp = await createImageBitmap(file)
      meta.w = bmp.width; meta.h = bmp.height
      thumb = await drawThumb(bmp, bmp.width, bmp.height)
      bmp.close?.()
    } catch { meta.broken = true }
  } else if (kind === 'video') {
    try { const i = await videoInfo(file); meta.w = i.w; meta.h = i.h; meta.dur = i.dur; thumb = i.thumb || null } catch { meta.broken = true }
  } else {
    meta.dur = await audioDur(file)
    try {
      const n = await id3Size(file)
      if (n) {
        const tags = parseID3(await file.slice(0, Math.min(n, 8 * 1024 * 1024)).arrayBuffer()) || {}
        const { cover, ...rest } = tags
        meta.tags = rest
        if (cover) {
          try { const bmp = await createImageBitmap(cover); thumb = await drawThumb(bmp, bmp.width, bmp.height); bmp.close?.() } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    if (!meta.tags?.title) {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
      const m = base.split(' - ')
      meta.tags = { ...(meta.tags || {}), title: m.length > 1 ? m.slice(1).join(' - ') : base, artist: meta.tags?.artist || (m.length > 1 ? m[0] : '') }
    }
  }
  return { meta, thumb }
}

// ---------- import many files ----------
export async function importFiles(files, { existing = [], onProgress, folderAlbums = true, source } = {}) {
  const seen = new Set(existing.map((m) => m.name + '|' + m.size))
  const list = [...files].filter((f) => kindOf(f) && !seen.has(f.name + '|' + f.size))
  const out = []
  const folders = {}
  let done = 0
  const worker = async () => {
    while (list.length) {
      const f = list.shift()
      const kind = kindOf(f)
      const id = uid()
      try {
        await saveFile(id, f)
        const { meta, thumb } = await analyse(f, kind)
        if (thumb) await put('thumbs', thumb, id)
        const folder = folderAlbums && f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(-2, -1)[0] : ''
        const item = {
          id, name: f.name, kind, mime: f.type || '', size: f.size,
          date: meta.date || f.lastModified || Date.now(), added: Date.now(),
          w: meta.w || 0, h: meta.h || 0, dur: meta.dur || 0,
          exif: meta.exif || null, tags: meta.tags || null, broken: !!meta.broken,
          hasThumb: !!thumb, fav: false, hidden: false, trashed: 0, albums: [], plays: 0, folder, source: source || '',
        }
        if (folder) (folders[folder] = folders[folder] || []).push(id)
        await put('media', item)
        out.push(item)
      } catch (e) { console.warn('import failed', f.name, e) }
      done++
      onProgress?.(done, done + list.length)
    }
  }
  await Promise.all([worker(), worker()])
  return { items: out, folders, skipped: files.length - out.length }
}

// ---------- object URL caches ----------
const thumbCache = new Map()
export async function thumbUrl(id) {
  if (thumbCache.has(id)) return thumbCache.get(id)
  const b = await get('thumbs', id)
  const u = b ? URL.createObjectURL(b) : null
  thumbCache.set(id, u)
  return u
}
export const dropThumb = (id) => { const u = thumbCache.get(id); if (u) URL.revokeObjectURL(u); thumbCache.delete(id) }

const fileCache = new Map() // LRU of full-size object URLs
export async function fileUrl(id) {
  if (fileCache.has(id)) { const u = fileCache.get(id); fileCache.delete(id); fileCache.set(id, u); return u }
  const f = await loadFile(id)
  if (!f) return null
  const u = URL.createObjectURL(f)
  fileCache.set(id, u)
  while (fileCache.size > 8) { const [k, v] = fileCache.entries().next().value; URL.revokeObjectURL(v); fileCache.delete(k) }
  return u
}

export async function deleteForever(id) {
  dropThumb(id)
  const u = fileCache.get(id); if (u) { URL.revokeObjectURL(u); fileCache.delete(id) }
  await removeFile(id)
  await del('media', id)
}

export async function getFileObj(item) {
  const f = await loadFile(item.id)
  return f ? new File([f], item.name, { type: item.mime || f.type, lastModified: item.date }) : null
}

export async function shareItems(items) {
  const files = (await Promise.all(items.map(getFileObj))).filter(Boolean)
  if (navigator.canShare?.({ files })) { await navigator.share({ files }); return true }
  return false
}
export async function downloadItems(items) {
  for (const it of items) {
    const u = await fileUrl(it.id)
    const a = document.createElement('a'); a.href = u; a.download = it.name; document.body.appendChild(a); a.click(); a.remove()
    await new Promise((r) => setTimeout(r, 350))
  }
}

// files shared from other apps (saved by the service worker)
export async function takeSharedInbox() {
  try {
    const cache = await caches.open('lumina-share-inbox')
    const keys = await cache.keys()
    const files = []
    for (const k of keys) {
      const r = await cache.match(k)
      const b = await r.blob()
      files.push(new File([b], decodeURIComponent(r.headers.get('x-name') || 'shared'), { type: b.type, lastModified: +r.headers.get('x-modified') || Date.now() }))
      await cache.delete(k)
    }
    return files
  } catch { return [] }
}
