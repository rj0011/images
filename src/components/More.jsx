import { useEffect, useState } from 'react'
import { Upload, FolderPlus, HardDrive, ShieldCheck, Palette, Moon, Lock, Trash2, PlayCircle, Music2, Info, Heart, Share2, Sparkles } from 'lucide-react'
import { Row, Toggle, Seg, Btn } from './ui'
import InstallCard from './InstallCard'
import { storageInfo, askPersist } from '../lib/db'
import { fmtSize } from '../lib/util'

import { ACCENTS } from '../lib/theme'

export default function MoreTab({ app }) {
  const S = app.settings
  const [st, setSt] = useState(null)
  useEffect(() => { storageInfo().then(setSt) }, [app.items.length])
  const lib = app.items.filter((x) => !x.trashed)
  const bytes = lib.reduce((a, b) => a + (b.size || 0), 0)
  const n = (k) => lib.filter((x) => x.kind === k).length

  return (
    <div className="space-y-5 px-4 pb-40 pt-3 safe-t">
      <h1 className="text-[26px] font-black">Settings</h1>
      <InstallCard />

      <section className="overflow-hidden rounded-3xl card">
        <div className="relative p-4">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full grad opacity-25 blur-3xl" />
          <div className="flex items-center gap-2 text-sm text-white/60"><HardDrive size={16} /> Library</div>
          <div className="mt-1 text-3xl font-black">{fmtSize(bytes)}</div>
          <div className="mt-1 text-xs text-white/55">{n('photo')} photos · {n('video')} videos · {n('audio')} songs</div>
          {st?.quota > 0 && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full grad" style={{ width: `${Math.min(100, (st.usage / st.quota) * 100)}%` }} /></div>
              <div className="mt-1 flex justify-between text-[11px] text-white/45"><span>Used {fmtSize(st.usage)}</span><span>Available for app {fmtSize(st.quota)}</span></div>
            </>
          )}
          <button onClick={async () => { const ok = await askPersist(); setSt(await storageInfo()); app.toast(ok ? '🛡️ Storage protected' : 'Install the app to protect storage') }}
            className={`mt-3 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs ${st?.persisted ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}`}>
            <ShieldCheck size={18} className="shrink-0" />
            {st?.persisted ? 'Protected storage ON – phone won’t auto-clear Images files.' : 'Tap to protect storage so the phone never auto-clears your files.'}
          </button>
        </div>
        <div className="border-t border-white/5 px-1 py-1">
          <Row icon={Upload} label="Add photos, videos & music" sub="Pick files from phone" onClick={app.pickFiles} />
          <Row icon={FolderPlus} label="Add a folder" sub="Keeps folder name as album" onClick={app.pickFolder} />
          <Row icon={Share2} label="Share from any app" sub="WhatsApp / Files → Share → Images (after install)" />
        </div>
      </section>

      <section className="rounded-3xl card p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold"><Palette size={18} className="text-[var(--ac)]" /> Look & feel</div>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(ACCENTS).map(([k, [a, b, l]]) => (
            <button key={k} onClick={() => app.setSettings({ accent: k })} className="flex flex-col items-center gap-1 text-[10px] text-white/60">
              <span className={`h-10 w-10 rounded-full ring-2 ${S.accent === k ? 'ring-white' : 'ring-transparent'}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />{l}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Moon size={16} /> Pure black (AMOLED)</span><Toggle on={S.amoled} onChange={(v) => app.setSettings({ amoled: v })} /></div>
        <div className="mt-4 text-sm text-white/60">Grid size</div>
        <div className="mt-2"><Seg value={S.cols} onChange={(v) => app.setSettings({ cols: v })} options={[[3, 'Large'], [4, 'Medium'], [5, 'Small'], [7, 'Tiny']]} /></div>
      </section>

      <section className="rounded-3xl card p-2">
        <div className="flex items-center gap-2 px-2 pt-2 font-semibold"><PlayCircle size={18} className="text-[var(--ac)]" /> Players</div>
        <ToggleRow label="Resume videos where I left" on={S.resume !== false} onChange={(v) => app.setSettings({ resume: v })} />
        <ToggleRow label="Auto-play next video" on={S.autoNext !== false} onChange={(v) => app.setSettings({ autoNext: v })} />
        <div className="px-3 py-2 text-sm">
          <div className="mb-2 text-white/70">Default video speed</div>
          <Seg value={S.videoSpeed || 1} onChange={(v) => app.setSettings({ videoSpeed: v })} options={[[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']]} />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/45"><Music2 size={14} /> Music equalizer, sleep timer & speed are in the music player.</div>
      </section>

      <section className="rounded-3xl card p-1">
        <Row icon={Lock} label="Privacy & app lock" sub="Pattern + fingerprint, Vault" onClick={app.openLock} />
        <Row icon={Sparkles} label="Open Vault" sub={`${app.vaultCount} hidden items`} onClick={() => app.openCollection({ type: 'vault' })} />
        <Row icon={Trash2} label="Recycle bin" sub={`${app.trashed.length} items · auto-deleted after 30 days`} onClick={() => app.openCollection({ type: 'trash' })} />
      </section>

      <section className="rounded-3xl bg-amber-500/8 p-4 text-xs leading-relaxed text-amber-100/80 ring-1 ring-amber-500/20">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-200"><Info size={14} /> Good to know</div>
        Images keeps its own private copy of the files you add (fully offline, nothing uploaded). Deleting a photo from your phone’s gallery won’t remove it here.
        <b> Clearing Chrome’s site data or uninstalling Images deletes its copies</b> – keep originals on your phone or use “Save copy to phone”.
      </section>

      <div className="pt-2 text-center text-xs text-white/40">
        <img src="./pwa-192.png" alt="" className="mx-auto mb-2 h-12 w-12 rounded-2xl" />
        Images v{window.APP_VERSION} · Gallery & Player
        <div className="mt-2 text-sm text-white/60">Designed by <span className="font-bold grad-text">Manish Shukla</span> <Heart size={12} className="inline text-pink-400" fill="currentColor" /></div>
      </div>
      {app.trashed.length > 0 && <Btn variant="danger" className="w-full" onClick={app.emptyTrash}>Empty recycle bin ({app.trashed.length})</Btn>}
    </div>
  )
}
const ToggleRow = ({ label, on, onChange }) => (
  <div className="flex items-center justify-between px-3 py-3 text-sm"><span>{label}</span><Toggle on={on} onChange={onChange} /></div>
)
