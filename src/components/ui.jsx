import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useBack } from '../lib/util'

export function Sheet({ open, onClose, title, children, full = false }) {
  useBack(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center anim-fade" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-lg rounded-t-[28px] border-t border-white/10 bg-[var(--card)] safe-b anim-pop ${full ? 'h-[92vh]' : 'max-h-[88vh]'} flex flex-col`}>
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/20" />
        {title && (
          <div className="flex items-center justify-between px-5 pb-1 pt-3">
            <h3 className="text-lg font-bold">{title}</h3>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 active:scale-90"><X size={18} /></button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 no-scrollbar">{children}</div>
      </div>
    </div>
  )
}

export function Btn({ children, variant = 'primary', className = '', ...p }) {
  const v = {
    primary: 'grad text-white shadow-lg shadow-fuchsia-500/20',
    ghost: 'bg-white/8 text-white ring-1 ring-white/10',
    danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
  }[variant]
  return <button {...p} className={`rounded-2xl px-4 py-3 font-semibold transition active:scale-[.97] disabled:opacity-40 ${v} ${className}`}>{children}</button>
}

export function Row({ icon: I, label, sub, right, onClick, danger }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left active:bg-white/5">
      {I && <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-rose-500/15 text-rose-300' : 'bg-white/6 text-[var(--ac)]'}`}><I size={20} /></span>}
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${danger ? 'text-rose-300' : ''}`}>{label}</span>
        {sub && <span className="block truncate text-xs text-white/50">{sub}</span>}
      </span>
      {right}
    </button>
  )
}

export function Toggle({ on, onChange }) {
  return (
    <span onClick={(e) => { e.stopPropagation(); onChange(!on) }} className={`relative inline-block h-7 w-12 shrink-0 rounded-full transition ${on ? 'grad' : 'bg-white/15'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </span>
  )
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="flex rounded-2xl bg-white/6 p-1">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition ${value === v ? 'grad text-white shadow' : 'text-white/60'}`}>{l}</button>
      ))}
    </div>
  )
}

// ---------- toast ----------
let pushToast = () => {}
export const toast = (msg, action) => pushToast({ msg, action, id: Math.random() })
export function Toaster() {
  const [t, setT] = useState(null)
  useEffect(() => { pushToast = setT }, [])
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), t.action ? 4500 : 2400); return () => clearTimeout(h) }, [t])
  if (!t) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-40 z-[200] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl glass px-4 py-3 text-sm shadow-2xl ring-1 ring-white/10 anim-pop">
        <span>{t.msg}</span>
        {t.action && <button onClick={() => { t.action.fn(); setT(null) }} className="font-bold grad-text">{t.action.label}</button>}
      </div>
    </div>
  )
}

// ---------- dialogs (confirm / prompt / action list) ----------
let pushDlg = () => {}
export const ask = (o) => new Promise((res) => pushDlg({ ...o, res }))
export function Dialogs() {
  const [d, setD] = useState(null)
  const [val, setVal] = useState('')
  useEffect(() => { pushDlg = (o) => { setVal(o.value || ''); setD(o) } }, [])
  useBack(!!d, () => { d?.res(null); setD(null) })
  if (!d) return null
  const close = (v) => { d.res(v); setD(null) }
  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 p-3 anim-fade sm:items-center" onClick={() => close(null)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[26px] bg-[var(--card)] p-5 ring-1 ring-white/10 anim-pop safe-b">
        {d.title && <h3 className="text-lg font-bold">{d.title}</h3>}
        {d.body && <p className="mt-1 text-sm text-white/65 whitespace-pre-line">{d.body}</p>}
        {d.input !== undefined && (
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder={d.input}
            onKeyDown={(e) => e.key === 'Enter' && val.trim() && close(val.trim())}
            className="mt-4 w-full rounded-2xl bg-white/6 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-[var(--ac)]" />
        )}
        {d.actions ? (
          <div className="mt-3 space-y-1">
            {d.actions.map((a) => <Row key={a.value} icon={a.icon} label={a.label} sub={a.sub} danger={a.danger} onClick={() => close(a.value)} />)}
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => close(null)}>{d.cancel || 'Cancel'}</Btn>
            <Btn variant={d.danger ? 'danger' : 'primary'} className="flex-1" disabled={d.input !== undefined && !val.trim()}
              onClick={() => close(d.input !== undefined ? val.trim() : true)}>{d.ok || 'OK'}</Btn>
          </div>
        )}
      </div>
    </div>
  )
}

export function Empty({ icon: I, title, sub, children }) {
  return (
    <div className="flex flex-col items-center px-8 py-20 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-[28px] bg-white/5 ring-1 ring-white/10"><I size={34} className="text-[var(--ac)]" /></div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      {sub && <p className="mt-1 text-sm text-white/55">{sub}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}
