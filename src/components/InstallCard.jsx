import { useEffect, useState } from 'react'
import { Download, X, MoreVertical, Copy, Check } from 'lucide-react'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const ua = navigator.userAgent
const inAppBrowser = /; wv\)|FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram/i.test(ua)
const isAndroid = /Android/i.test(ua)
const isSamsung = /SamsungBrowser/i.test(ua)

// Install bar: one tap when Chrome allows, otherwise clear step-by-step help.
export default function InstallCard({ compact = false }) {
  const [evt, setEvt] = useState(window.__installEvt || null)
  const [installed, setInstalled] = useState(isStandalone())
  const [help, setHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hidden, setHidden] = useState(() => compact && sessionStorage.getItem('lu_install_hide') === '1')

  useEffect(() => {
    const ready = () => setEvt(window.__installEvt)
    const done = () => { setInstalled(true); setHelp(false) }
    window.addEventListener('lu-install-ready', ready)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('lu-install-ready', ready); window.removeEventListener('appinstalled', done) }
  }, [])

  if (installed || hidden) return null

  const install = async () => {
    const e = evt || window.__installEvt
    if (!e) { setHelp(true); return }
    try {
      e.prompt()
      const r = await e.userChoice
      if (r.outcome === 'accepted') setInstalled(true)
    } catch { setHelp(true) }
    window.__installEvt = null
    setEvt(null)
  }
  const copy = async () => { try { await navigator.clipboard.writeText(location.href.split('?')[0]); setCopied(true) } catch { /* ignore */ } }

  return (
    <>
      <div className={`relative flex items-center gap-3 overflow-hidden rounded-2xl grad p-3 shadow-lg shadow-fuchsia-500/25 ${compact ? 'mx-4 mt-3' : ''}`}>
        <img src="./pwa-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl ring-2 ring-white/40" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Install Images app</div>
          <div className="truncate text-[11px] text-white/85">Home screen icon · full screen · offline</div>
        </div>
        <button onClick={install} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-fuchsia-700 shadow active:scale-95">
          <Download size={16} /> Install
        </button>
        {compact && (
          <button onClick={() => { sessionStorage.setItem('lu_install_hide', '1'); setHidden(true) }} className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/80"><X size={16} /></button>
        )}
      </div>

      {help && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 anim-fade" onClick={() => setHelp(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-[28px] bg-[var(--card)] p-5 pb-8 safe-b anim-pop">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Install in 2 taps</h3>
              <button onClick={() => setHelp(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/5"><X size={18} /></button>
            </div>
            {inAppBrowser ? (
              <div className="space-y-3 text-sm">
                <p>You opened this link inside another app. Open it in <b>Google Chrome</b> to install.</p>
                <button onClick={copy} className="flex w-full items-center justify-center gap-2 rounded-2xl grad py-3 font-bold">
                  {copied ? <><Check size={18} /> Copied – paste in Chrome</> : <><Copy size={18} /> Copy link</>}
                </button>
                <p className="text-xs text-white/50">Or tap ⋮ (top-right) → “Open in Chrome”.</p>
              </div>
            ) : (
              <ol className="space-y-3 text-sm">
                <li className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full grad font-bold">1</span>
                  <span>Tap {isSamsung ? <b>☰ menu</b> : <b className="inline-flex items-center align-middle"><MoreVertical size={16} /></b>} at the {isSamsung ? 'bottom' : 'top-right'} of {isSamsung ? 'Samsung Internet' : 'Chrome'}</span>
                </li>
                <li className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full grad font-bold">2</span>
                  <span>Tap <b>{isSamsung ? 'Add page to → Home screen' : 'Install app'}</b> (or <b>Add to Home screen → Install</b>)</span>
                </li>
                <li className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full grad font-bold">3</span>
                  <span>Open <b>Images</b> from your home screen 🎉</span>
                </li>
                {isAndroid && <p className="px-1 text-xs text-white/50">Don’t see “Install app”? Pull down to refresh this page, wait 5 seconds, and tap Install again.</p>}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  )
}
