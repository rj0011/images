import { useEffect, useRef, useState } from 'react'
import { thumbUrl } from './media'

export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0')
}
export const fmtSize = (b) => {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)))
  return (b / 1024 ** i).toFixed(i > 1 ? 1 : 0) + ' ' + u[i]
}
const DAY = 86400000
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
export function dayLabel(t) {
  const today = startOfDay(Date.now())
  const d = startOfDay(t)
  if (d === today) return 'Today'
  if (d === today - DAY) return 'Yesterday'
  const dt = new Date(t)
  const sameYear = dt.getFullYear() === new Date().getFullYear()
  if (today - d < 6 * DAY) return dt.toLocaleDateString('en-IN', { weekday: 'long' })
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
export const monthLabel = (t) => new Date(t).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
export function groupBy(items, mode = 'day') {
  const out = []
  let cur = null
  for (const it of items) {
    const key = mode === 'month' ? new Date(it.date).getFullYear() * 100 + new Date(it.date).getMonth() : startOfDay(it.date)
    if (!cur || cur.key !== key) { cur = { key, label: mode === 'month' ? monthLabel(it.date) : dayLabel(it.date), items: [] }; out.push(cur) }
    cur.items.push(it)
  }
  return out
}
export const fullDate = (t) => new Date(t).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export function useThumb(id, has = true) {
  const [u, setU] = useState(null)
  useEffect(() => { let on = true; if (has) thumbUrl(id).then((x) => on && setU(x)); return () => { on = false } }, [id, has])
  return u
}

// ---------- Android back button closes the top-most overlay ----------
const stack = []
let ignore = 0
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore) { ignore--; return }
    const t = stack.pop()
    if (t) { t.popped = true; t.cb() }
  })
}
export function useBack(open, onClose) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!open) return
    const token = { popped: false, cb: () => ref.current() }
    history.pushState({ lu: stack.length + 1 }, '')
    stack.push(token)
    return () => {
      if (token.popped) return
      const i = stack.indexOf(token)
      if (i >= 0) stack.splice(i, 1)
      ignore++
      history.back()
    }
  }, [open])
}

export const vibrate = (ms = 10) => { try { navigator.vibrate?.(ms) } catch { /* ignore */ } }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function searchMatch(it, q, albums) {
  if (!q) return true
  const s = q.toLowerCase()
  const d = new Date(it.date)
  const hay = [
    it.name, it.kind, it.kind === 'photo' ? 'photo image picture' : it.kind === 'video' ? 'video movie clip' : 'song music audio',
    it.folder, it.exif?.make, it.exif?.model, it.tags?.title, it.tags?.artist, it.tags?.album, it.tags?.genre,
    d.getFullYear(), d.toLocaleDateString('en-IN', { month: 'long' }), d.toLocaleDateString('en-IN', { weekday: 'long' }),
    it.fav ? 'favourite favorite' : '', /screenshot/i.test(it.name) ? 'screenshot' : '', /whatsapp|^img-\d+-wa/i.test(it.name) ? 'whatsapp' : '',
    ...(it.albums || []).map((a) => albums?.find((x) => x.id === a)?.name),
  ].filter(Boolean).join(' ').toLowerCase()
  return s.split(/\s+/).every((w) => hay.includes(w))
}
