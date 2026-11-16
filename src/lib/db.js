// ---------- Storage: IndexedDB (metadata + thumbnails) + OPFS (original files) ----------
// Everything stays on this phone. Nothing is uploaded anywhere.
const DB_NAME = 'lumina'
const STORES = ['media', 'thumbs', 'albums', 'playlists', 'kv', 'blobs']
let dbp = null

export function openDB() {
  if (dbp) return dbp
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => {
      const db = r.result
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === 'kv' || s === 'thumbs' || s === 'blobs' ? undefined : { keyPath: 'id' })
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}

const tx = async (store, mode, fn) => {
  const db = await openDB()
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    let out
    Promise.resolve(fn(s)).then((v) => { out = v })
    t.oncomplete = () => res(out)
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error)
  })
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

export const getAll = (store) => tx(store, 'readonly', (s) => req(s.getAll()))
export const put = (store, val, key) => tx(store, 'readwrite', (s) => req(key === undefined ? s.put(val) : s.put(val, key)))
export const putMany = (store, vals) => tx(store, 'readwrite', (s) => { vals.forEach((v) => s.put(v)) })
export const get = (store, key) => tx(store, 'readonly', (s) => req(s.get(key)))
export const del = (store, key) => tx(store, 'readwrite', (s) => req(s.delete(key)))

export const kvGet = (k, d) => get('kv', k).then((v) => (v === undefined ? d : v)).catch(() => d)
export const kvSet = (k, v) => put('kv', v, k)

// ---------- original files: OPFS (fast, big) with IndexedDB fallback ----------
let rootP = null
const opfs = () => {
  if (!rootP) rootP = (async () => {
    try {
      if (!navigator.storage?.getDirectory) return null
      const root = await navigator.storage.getDirectory()
      const dir = await root.getDirectoryHandle('media', { create: true })
      const probe = await dir.getFileHandle('.probe', { create: true })
      if (!probe.createWritable) return null
      return dir
    } catch { return null }
  })()
  return rootP
}

export async function saveFile(id, file) {
  const dir = await opfs()
  if (dir) {
    const h = await dir.getFileHandle(id, { create: true })
    const w = await h.createWritable()
    await w.write(file)
    await w.close()
    return 'opfs'
  }
  await put('blobs', file, id)
  return 'idb'
}

export async function loadFile(id) {
  const dir = await opfs()
  if (dir) {
    try { return await (await dir.getFileHandle(id)).getFile() } catch { /* try idb */ }
  }
  return get('blobs', id)
}

export async function removeFile(id) {
  const dir = await opfs()
  if (dir) { try { await dir.removeEntry(id) } catch { /* ignore */ } }
  try { await del('blobs', id) } catch { /* ignore */ }
  try { await del('thumbs', id) } catch { /* ignore */ }
}

export async function storageInfo() {
  const est = (await navigator.storage?.estimate?.()) || {}
  const persisted = (await navigator.storage?.persisted?.()) || false
  return { usage: est.usage || 0, quota: est.quota || 0, persisted }
}
export const askPersist = async () => { try { return await navigator.storage?.persist?.() } catch { return false } }
