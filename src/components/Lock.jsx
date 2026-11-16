import { useEffect, useRef, useState } from 'react'
import { Sheet, Btn, Toggle, ask } from './ui'
import { getLock, saveLock, clearLock, setPattern, checkPattern, bioAvailable, enableBio, verifyBio, disableBio } from '../lib/lock'

// ---------- 3x3 pattern pad ----------
export function PatternPad({ onDone, status = 'idle', dark = false }) {
  const ref = useRef()
  const [seq, setSeqState] = useState([])
  const seqRef = useRef([])
  const setSeq = (v) => { const n = typeof v === 'function' ? v(seqRef.current) : v; seqRef.current = n; setSeqState(n) }
  const [pos, setPos] = useState(null)
  const drawing = useRef(false)
  const S = 270, M = 45, G = 90
  const pts = [...Array(9)].map((_, i) => ({ x: M + (i % 3) * G, y: M + Math.floor(i / 3) * G }))

  useEffect(() => { if (status !== 'idle') { const t = setTimeout(() => setSeq([]), 700); return () => clearTimeout(t) } }, [status])

  const local = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * S, y: ((e.clientY - r.top) / r.height) * S }
  }
  const hit = (p, cur) => {
    const i = pts.findIndex((d) => Math.hypot(d.x - p.x, d.y - p.y) < 30)
    if (i >= 0 && !cur.includes(i)) {
      if (navigator.vibrate) navigator.vibrate(12)
      return [...cur, i]
    }
    return cur
  }
  const down = (e) => { e.preventDefault(); ref.current.setPointerCapture?.(e.pointerId); drawing.current = true; const p = local(e); setPos(p); setSeq(hit(p, [])) }
  const move = (e) => { if (!drawing.current) return; const p = local(e); setPos(p); setSeq((s) => hit(p, s)) }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false; setPos(null)
    const s = seqRef.current
    if (s.length) onDone(s)
  }

  const col = status === 'error' ? '#f43f5e' : status === 'ok' ? '#10b981' : dark ? '#ffffff' : '#ec4899'
  const last = seq.length ? pts[seq[seq.length - 1]] : null
  return (
    <svg ref={ref} viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[270px] select-none" style={{ touchAction: 'none' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
      {seq.length > 1 && <polyline points={seq.map((i) => `${pts[i].x},${pts[i].y}`).join(' ')} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />}
      {last && pos && <line x1={last.x} y1={last.y} x2={pos.x} y2={pos.y} stroke={col} strokeWidth="6" strokeLinecap="round" opacity=".4" />}
      {pts.map((p, i) => {
        const on = seq.includes(i)
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="26" fill={on ? col : 'transparent'} opacity=".18" />
            <circle cx={p.x} cy={p.y} r={on ? 10 : 7} fill={on ? col : dark ? 'rgba(255,255,255,.55)' : '#94a3b8'} />
          </g>
        )
      })}
    </svg>
  )
}

// ---------- Full-screen lock ----------
export function LockScreen({ onUnlock, onForgot, title = 'Images', sub = 'Draw your pattern to unlock', onCancel }) {
  const lock = getLock()
  const [status, setStatus] = useState('idle')
  const [msg, setMsg] = useState(sub)
  const [fails, setFails] = useState(0)
  const [waitUntil, setWaitUntil] = useState(0)
  const [, tick] = useState(0)

  const bio = async () => {
    try { if (await verifyBio()) { setStatus('ok'); setTimeout(onUnlock, 150) } } catch { setMsg('Fingerprint cancelled – draw pattern') }
  }
  useEffect(() => { if (lock.bioId) bio() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!waitUntil) return; const t = setInterval(() => { tick((x) => x + 1); if (Date.now() > waitUntil) setWaitUntil(0) }, 1000); return () => clearInterval(t) }, [waitUntil])

  const done = async (p) => {
    if (waitUntil) return
    if (await checkPattern(p)) { setStatus('ok'); setTimeout(onUnlock, 200); return }
    const f = fails + 1; setFails(f); setStatus('error')
    if (f >= 5) { setWaitUntil(Date.now() + 30000); setFails(0); setMsg('Too many tries – wait 30 sec') }
    else setMsg(`Wrong pattern (${5 - f} tries left)`)
    setTimeout(() => setStatus('idle'), 700)
  }
  const forgot = async () => {
    const ok = await ask({ title: 'Forgot pattern?', body: 'For your privacy, removing the lock also permanently deletes everything inside the Vault (hidden items). Other photos, videos and music stay safe.', ok: 'Remove lock', danger: true })
    if (!ok) return
    await onForgot?.()
    clearLock(); onUnlock()
  }
  const secs = waitUntil ? Math.ceil((waitUntil - Date.now()) / 1000) : 0

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[#0a0710] bg-[radial-gradient(circle_at_30%_10%,rgba(167,139,250,.35),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(236,72,153,.3),transparent_55%)] px-6 py-12 text-white">
      <div className="text-center">
        <img src="./pwa-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-xl ring-2 ring-white/40" />
        <h2 className="mt-3 text-2xl font-extrabold">{title}</h2>
        <p className={`mt-1 text-sm ${status === 'error' ? 'text-rose-200' : 'text-white/80'}`}>{secs ? `Try again in ${secs}s` : msg}</p>
      </div>
      <div className={`w-full ${waitUntil ? 'pointer-events-none opacity-40' : ''}`}>
        <PatternPad onDone={done} status={status} dark />
      </div>
      <div className="flex flex-col items-center gap-3">
        {lock.bioId && (
          <button onClick={bio} className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 font-semibold ring-1 ring-white/30 active:scale-95">
            <span className="text-2xl">👆</span> Use fingerprint
          </button>
        )}
        <button onClick={forgot} className="text-xs text-white/60 underline">Forgot pattern?</button>
        {onCancel && <button onClick={onCancel} className="text-sm text-white/70">Cancel</button>}
      </div>
    </div>
  )
}

// ---------- Settings sheet ----------
export function LockSettings({ open, onClose, flash, startDraw = false, onSet }) {
  const [lock, setL] = useState(getLock())
  const [step, setStep] = useState('menu') // menu | draw | confirm
  const [first, setFirst] = useState(null)
  const [status, setStatus] = useState('idle')
  const [hint, setHint] = useState('')
  const [bioOk, setBioOk] = useState(false)

  useEffect(() => { if (open) { setL(getLock()); setStep(startDraw && !getLock().hash ? 'draw' : 'menu'); setHint(startDraw && !getLock().hash ? 'Draw an unlock pattern (min 4 dots)' : ''); bioAvailable().then(setBioOk) } }, [open, startDraw])
  const refresh = () => setL(getLock())

  const onDraw = async (p) => {
    if (p.length < 4) { setStatus('error'); setHint('Connect at least 4 dots'); setTimeout(() => setStatus('idle'), 700); return }
    if (step === 'draw') { setFirst(p); setStep('confirm'); setHint('Draw the same pattern again to confirm'); return }
    if (p.join() !== first.join()) { setStatus('error'); setHint("Patterns don't match – start again"); setTimeout(() => { setStatus('idle'); setStep('draw') }, 800); return }
    await setPattern(p); setStatus('ok'); refresh()
    setTimeout(() => { setStatus('idle'); setStep('menu'); flash('Pattern set 🔒'); onSet?.() }, 500)
  }
  const toggleBio = async () => {
    if (lock.bioId) { disableBio(); refresh(); flash('Fingerprint OFF'); return }
    try { await enableBio(); refresh(); flash('Fingerprint ON 👆') } catch (e) { flash('⚠️ Fingerprint not set: ' + (e.message || 'cancelled')) }
  }
  const turnOff = async () => { if (await ask({ title: 'Remove pattern?', body: 'App lock turns off. Vault will ask you to set a new pattern next time.', ok: 'Remove', danger: true })) { clearLock(); refresh(); flash('Pattern removed') } }
  const setApp = (v) => { saveLock({ ...getLock(), appLock: v }); refresh(); flash(v ? 'App lock ON 🔒' : 'App lock OFF') }

  return (
    <Sheet open={open} onClose={onClose} title="Privacy & lock">
      {step === 'menu' ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white/5 p-3 text-sm text-white/70 ring-1 ring-white/10">
            Your pattern protects the Vault. Turn on App lock to also ask for it every time Images opens (and after 30 sec in background).
          </div>
          <Btn className="w-full" onClick={() => { setStep('draw'); setHint('Draw an unlock pattern (min 4 dots)') }}>
            🔢 {lock.hash ? 'Change pattern' : 'Set pattern'}
          </Btn>
          {lock.hash && (
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm">
              <span>🔒 Lock app on open</span><Toggle on={!!lock.appLock} onChange={setApp} />
            </div>
          )}
          {lock.hash && (
            bioOk ? (
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm">
                <span>👆 Unlock with fingerprint</span>
                <Toggle on={!!lock.bioId} onChange={toggleBio} />
              </div>
            ) : <p className="text-xs text-white/45">Fingerprint is not available in this browser. Install the app from Chrome and set a fingerprint in phone Settings.</p>
          )}
          {lock.hash && <Btn variant="danger" className="w-full" onClick={turnOff}>Remove pattern</Btn>}
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className={`text-sm font-medium ${status === 'error' ? 'text-rose-500' : 'text-white/70'}`}>{hint}</p>
          <PatternPad onDone={onDraw} status={status} />
          <Btn variant="ghost" className="w-full" onClick={() => setStep('menu')}>Cancel</Btn>
        </div>
      )}
    </Sheet>
  )
}
