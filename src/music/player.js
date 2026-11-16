// ---------- Music engine: one <audio> for the whole app (keeps playing in background) ----------
import { useSyncExternalStore } from 'react'
import { fileUrl, thumbUrl } from '../lib/media'
import { kvGet, kvSet } from '../lib/db'

export const BANDS = [60, 230, 910, 3600, 14000]
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0],
  'Bass boost': [8, 5, 0, 0, 1],
  'Bass + Treble': [7, 3, -1, 3, 7],
  Rock: [5, 3, -2, 3, 5],
  Pop: [-1, 3, 5, 3, -1],
  Bollywood: [4, 2, 2, 3, 3],
  Jazz: [3, 1, -1, 2, 4],
  Classical: [4, 2, -1, 2, 4],
  Vocal: [-2, 0, 4, 4, 1],
  Treble: [-2, -1, 0, 4, 8],
  Night: [2, 1, 0, -2, -4],
}

const audio = typeof Audio !== 'undefined' ? new Audio() : null
if (audio) { audio.preload = 'auto'; audio.crossOrigin = 'anonymous' }

let S = {
  queue: [], order: [], pos: -1, playing: false, t: 0, dur: 0,
  shuffle: false, repeat: 'off', speed: 1,
  eqOn: true, eqPreset: 'Flat', gains: [0, 0, 0, 0, 0],
  sleepAt: null, sleepEnd: false, ready: false,
}
const subs = new Set()
const emit = () => { S = { ...S }; subs.forEach((f) => f()) }
const set = (p) => { Object.assign(S, p); emit() }
export const usePlayer = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => S)
export const getState = () => S
export const current = () => S.queue[S.order[S.pos]]

let hooks = { onPlay: () => {} }
export const setHooks = (h) => { hooks = { ...hooks, ...h } }

// ---------- Web Audio graph (EQ + visualizer) ----------
let ctx = null, filters = [], analyser = null
function ensureGraph() {
  if (ctx || !S.eqOn || !audio) return
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    const src = ctx.createMediaElementSource(audio)
    filters = BANDS.map((f, i) => {
      const b = ctx.createBiquadFilter()
      b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking'
      b.frequency.value = f; b.Q.value = 1; b.gain.value = S.gains[i]
      return b
    })
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8
    let node = src
    for (const f of filters) { node.connect(f); node = f }
    node.connect(analyser); analyser.connect(ctx.destination)
  } catch (e) { console.warn('audio graph', e); ctx = null }
}
export const getAnalyser = () => analyser
const applyGains = () => filters.forEach((f, i) => { f.gain.value = S.eqOn ? S.gains[i] : 0 })

// ---------- playback ----------
let loadToken = 0
async function load(autoplay = true, at = 0) {
  const it = current()
  if (!it || !audio) return
  const tok = ++loadToken
  const u = await fileUrl(it.id)
  if (tok !== loadToken) return
  audio.src = u
  audio.defaultPlaybackRate = S.speed
  audio.playbackRate = S.speed
  if (at) audio.addEventListener('loadedmetadata', () => { audio.currentTime = at }, { once: true })
  set({ t: at, dur: it.dur || 0 })
  if (autoplay) { ensureGraph(); ctx?.resume?.(); try { await audio.play() } catch { /* user gesture needed */ } hooks.onPlay(it) }
  updateSession(it)
  persist()
}

const shuffled = (n, first) => {
  const a = [...Array(n).keys()].filter((i) => i !== first)
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return first == null ? a : [first, ...a]
}

export function playQueue(items, start = 0, opts = {}) {
  if (!items.length) return
  const shuffle = opts.shuffle ?? S.shuffle
  const startIdx = opts.shuffle && opts.random ? Math.floor(Math.random() * items.length) : start
  const order = shuffle ? shuffled(items.length, startIdx) : [...items.keys()]
  set({ queue: items, order, pos: shuffle ? 0 : startIdx, shuffle })
  load(true)
}
export function toggle() {
  if (!audio || !current()) return
  if (audio.paused) { ensureGraph(); ctx?.resume?.(); if (!audio.src) load(true); else audio.play() } else audio.pause()
}
export function next(auto = false) {
  if (!S.queue.length) return
  if (auto && S.repeat === 'one') { audio.currentTime = 0; audio.play(); return }
  if (S.sleepEnd && auto) { set({ sleepEnd: false }); audio.pause(); return }
  let p = S.pos + 1
  if (p >= S.order.length) { if (S.repeat === 'all' || !auto) p = 0; else { audio.pause(); return } }
  set({ pos: p }); load(true)
}
export function prev() {
  if (audio.currentTime > 4) { audio.currentTime = 0; return }
  set({ pos: Math.max(0, S.pos - 1) }); load(true)
}
export const seek = (t) => { if (audio) { audio.currentTime = t; set({ t }) } }
export const jumpTo = (pos) => { set({ pos }); load(true) }
export function setShuffle(on) {
  const curIdx = S.order[S.pos]
  const order = on ? shuffled(S.queue.length, curIdx) : [...S.queue.keys()]
  set({ shuffle: on, order, pos: on ? 0 : curIdx }); persist()
}
export const cycleRepeat = () => { set({ repeat: { off: 'all', all: 'one', one: 'off' }[S.repeat] }); persist() }
export const setSpeed = (s) => { if (audio) audio.playbackRate = s; set({ speed: s }); persist() }
export function setEq(p) {
  if (p.preset) { S.gains = [...EQ_PRESETS[p.preset]]; S.eqPreset = p.preset }
  if (p.band != null) { S.gains = S.gains.map((g, i) => (i === p.band ? p.gain : g)); S.eqPreset = 'Custom' }
  if (p.on != null) S.eqOn = p.on
  applyGains(); emit(); persist()
}
export function playNext(item) {
  if (!S.queue.length) { playQueue([item], 0); return }
  const q = [...S.queue, item]
  const order = [...S.order]; order.splice(S.pos + 1, 0, q.length - 1)
  set({ queue: q, order }); persist()
}
export function addToQueue(item) {
  if (!S.queue.length) { playQueue([item], 0); return }
  set({ queue: [...S.queue, item], order: [...S.order, S.queue.length] }); persist()
}
export function removeFromQueue(pos) {
  if (pos === S.pos) return
  const order = S.order.filter((_, i) => i !== pos)
  set({ order, pos: pos < S.pos ? S.pos - 1 : S.pos }); persist()
}
export function stop() { audio?.pause(); if (audio) audio.removeAttribute('src'); set({ queue: [], order: [], pos: -1, playing: false }); persist() }
// keep queue in sync when library items change (fav, trash, delete)
export function syncItems(map) {
  if (!S.queue.length) return
  const q = S.queue.map((x) => map.get(x.id) || null)
  if (q.some((x) => !x || x.trashed || x.hidden)) {
    const cur = current()
    const keep = S.order.map((i) => q[i]).filter((x) => x && !x.trashed && !x.hidden)
    if (!keep.length) { stop(); return }
    const pos = Math.max(0, keep.findIndex((x) => x.id === cur?.id))
    set({ queue: keep, order: [...keep.keys()], pos, shuffle: false })
    if (!keep.find((x) => x.id === cur?.id)) load(!audio.paused)
  } else set({ queue: q })
}

// ---------- sleep timer ----------
let sleepT = null
export function setSleep(min) {
  clearTimeout(sleepT)
  if (min === 'end') { set({ sleepAt: null, sleepEnd: true }); return }
  if (!min) { set({ sleepAt: null, sleepEnd: false }); return }
  const at = Date.now() + min * 60000
  set({ sleepAt: at, sleepEnd: false })
  sleepT = setTimeout(fadeOutPause, min * 60000)
}
function fadeOutPause() {
  const v0 = audio.volume
  let i = 0
  const h = setInterval(() => {
    i++; audio.volume = Math.max(0, v0 * (1 - i / 20))
    if (i >= 20) { clearInterval(h); audio.pause(); audio.volume = v0; set({ sleepAt: null }) }
  }, 200)
}

// ---------- lock screen / notification controls ----------
async function updateSession(it) {
  if (!('mediaSession' in navigator)) return
  const art = it.hasThumb ? await thumbUrl(it.id) : null
  navigator.mediaSession.metadata = new MediaMetadata({
    title: it.tags?.title || it.name, artist: it.tags?.artist || 'Unknown artist', album: it.tags?.album || 'Images',
    artwork: art ? [{ src: art, sizes: '512x512', type: 'image/webp' }] : [{ src: './pwa-512.png', sizes: '512x512', type: 'image/png' }],
  })
}
if (audio && 'mediaSession' in navigator) {
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => toggle())
  ms.setActionHandler('pause', () => audio.pause())
  ms.setActionHandler('nexttrack', () => next())
  ms.setActionHandler('previoustrack', () => prev())
  ms.setActionHandler('seekto', (d) => seek(d.seekTime))
  try { ms.setActionHandler('seekbackward', () => seek(Math.max(0, audio.currentTime - 10))) } catch { /* ignore */ }
  try { ms.setActionHandler('seekforward', () => seek(audio.currentTime + 10)) } catch { /* ignore */ }
}

if (audio) {
  audio.addEventListener('play', () => { set({ playing: true }); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' })
  audio.addEventListener('pause', () => { set({ playing: false }); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; persist() })
  audio.addEventListener('ended', () => next(true))
  audio.addEventListener('loadedmetadata', () => set({ dur: audio.duration }))
  let last = 0
  audio.addEventListener('timeupdate', () => {
    const now = Date.now()
    if (now - last < 250) return
    last = now
    set({ t: audio.currentTime })
    try { if (audio.duration) navigator.mediaSession?.setPositionState?.({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }) } catch { /* ignore */ }
    if (now % 5000 < 300) persist()
  })
}

// ---------- remember queue between app launches ----------
function persist() {
  kvSet('player', {
    ids: S.queue.map((x) => x.id), order: S.order, pos: S.pos, t: audio?.currentTime || 0,
    shuffle: S.shuffle, repeat: S.repeat, speed: S.speed, eqOn: S.eqOn, eqPreset: S.eqPreset, gains: S.gains,
  }).catch(() => {})
}
export async function restore(byId, eqDefault = true) {
  const p = await kvGet('player', null)
  if (!p) { set({ ready: true, eqOn: eqDefault }); return }
  const queue = (p.ids || []).map((id) => byId.get(id)).filter((x) => x && !x.trashed && !x.hidden)
  const ok = queue.length === (p.ids || []).length
  set({
    shuffle: !!p.shuffle && ok, repeat: p.repeat || 'off', speed: p.speed || 1, eqOn: p.eqOn ?? eqDefault, eqPreset: p.eqPreset || 'Flat', gains: p.gains || [0, 0, 0, 0, 0], ready: true,
    queue, order: ok ? p.order : [...queue.keys()], pos: queue.length ? Math.min(ok ? p.pos : 0, queue.length - 1) : -1,
  })
  if (queue.length) load(false, ok ? p.t || 0 : 0)
}
