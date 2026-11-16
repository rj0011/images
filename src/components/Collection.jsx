import { useState } from 'react'
import { ArrowLeft, X, CheckCheck, MoreVertical, Presentation, Grid3x3 } from 'lucide-react'
import MediaGrid from './Grid'
import { useBack } from '../lib/util'
import { Empty } from './ui'

export function SelectBar({ selected, setSelected, items, actions }) {
  if (!selected.size) return null
  const ids = [...selected]
  const all = selected.size === items.length
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[45] flex items-center gap-2 glass px-2 py-2.5 safe-t anim-fade">
        <button onClick={() => setSelected(new Set())} className="grid h-10 w-10 place-items-center rounded-full"><X /></button>
        <div className="flex-1 text-lg font-bold">{selected.size} selected</div>
        <button onClick={() => setSelected(all ? new Set() : new Set(items.map((i) => i.id)))} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"><CheckCheck size={15} />{all ? 'None' : 'All'}</button>
      </div>
      <div className="fixed inset-x-2 bottom-[calc(10px+env(safe-area-inset-bottom))] z-[45] flex justify-around rounded-3xl glass px-1 py-1.5 ring-1 ring-white/10 shadow-2xl anim-pop">
        {actions.map((a) => (
          <button key={a.label} onClick={async () => { const keep = await a.fn(ids); if (!keep) setSelected(new Set()) }}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[10.5px] active:bg-white/10 ${a.danger ? 'text-rose-300' : 'text-white/85'}`}>
            <a.icon size={21} />{a.label}
          </button>
        ))}
      </div>
    </>
  )
}

// Full-screen page showing a set of items (album, favourites, vault, trash…)
export default function Collection({ title, sub, items, onClose, actions, menu, empty, onOpen, banner, slideshow = true, cols: c0 = 4 }) {
  const [selected, setSelected] = useState(new Set())
  const [cols, setCols] = useState(c0)
  useBack(true, onClose)
  useBack(selected.size > 0, () => setSelected(new Set()))
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)] anim-fade no-scrollbar">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--bg)]/85 px-2 py-2.5 backdrop-blur safe-t">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full active:bg-white/10"><ArrowLeft /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{title}</div>
          <div className="text-xs text-white/50">{sub ?? `${items.length} items`}</div>
        </div>
        <button onClick={() => setCols((c) => (c >= 6 ? 3 : c + 1))} className="grid h-10 w-10 place-items-center rounded-full active:bg-white/10"><Grid3x3 size={19} /></button>
        {slideshow && items.some((i) => i.kind === 'photo') && (
          <button onClick={() => onOpen(items.find((i) => i.kind === 'photo'), items.filter((i) => i.kind === 'photo'), { slideshow: true })} className="grid h-10 w-10 place-items-center rounded-full active:bg-white/10"><Presentation size={19} /></button>
        )}
        {menu && <button onClick={menu} className="grid h-10 w-10 place-items-center rounded-full active:bg-white/10"><MoreVertical size={19} /></button>}
      </div>
      {banner}
      {items.length ? (
        <div className="pb-32">
          <MediaGrid items={items} cols={cols} setCols={setCols} selected={selected} setSelected={setSelected} onOpen={onOpen} group="none" />
        </div>
      ) : empty || <Empty icon={Grid3x3} title="Nothing here yet" />}
      <SelectBar selected={selected} setSelected={setSelected} items={items} actions={actions} />
    </div>
  )
}
