import { Fragment, useMemo, useState } from 'react'
import type { Board, BoardBag, InvRow } from '../lib/types'
import { C } from './ui'
import { InventoryTable } from './InventoryTable'

type View = 'maleta' | 'pieza'

type SortK = 'name' | 'total' | 'casa' | 'cleaner' | 'transito' | 'lav'

// Cuenta las maletas físicas de una casa según dónde están.
const WHERE: Record<string, SortK> = { casa: 'casa', uso: 'cleaner', cleaner: 'cleaner', transito: 'transito', lavanderia: 'lav' }
const countsOf = (b: BoardBag) => {
  const c = { total: b.units.length, casa: 0, cleaner: 0, transito: 0, lav: 0 }
  for (const u of b.units) { const k = WHERE[u.where]; if (k && k !== 'name') (c as any)[k]++ }
  return c
}
const WHERE_COLOR: Record<string, string> = { casa: '#B45309', uso: '#0369A1', cleaner: '#0369A1', transito: '#7C3AED', lavanderia: '#15803D' }

export default function InventoryPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [view, setView] = useState<View>('maleta')
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: SortK; dir: 1 | -1 }>({ k: 'name', dir: 1 })
  const s = board.summary

  const bags = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = board.bags
      .filter(b => b.units.length > 0)
      .filter(b => !t || `${b.name} ${b.code || ''} ${b.clientName || ''}`.toLowerCase().includes(t))
      .map(b => ({ b, v: countsOf(b) }))
    list.sort((x, y) => {
      const d = sort.k === 'name' ? String(x.b.name).localeCompare(String(y.b.name)) : (x.v[sort.k] - y.v[sort.k])
      return (d || String(x.b.name).localeCompare(String(y.b.name))) * sort.dir
    })
    return list
  }, [board, q, sort])
  const sum = bags.reduce((t, x) => ({ total: t.total + x.v.total, casa: t.casa + x.v.casa, cleaner: t.cleaner + x.v.cleaner, transito: t.transito + x.v.transito, lav: t.lav + x.v.lav }), { total: 0, casa: 0, cleaner: 0, transito: 0, lav: 0 })

  const byPiece = useMemo(() => {
    const m = new Map<string, InvRow>()
    for (const b of board.bags) for (const r of b.inventory.rows) {
      const t = m.get(r.item) || { item: r.item, par: 0, home: 0, bag: 0, laundry: 0, missing: 0 }
      t.par += r.par; t.home += r.home; t.bag += r.bag; t.laundry += r.laundry; t.missing += r.missing
      m.set(r.item, t)
    }
    return [...m.values()].sort((a, b) => b.missing - a.missing || a.item.localeCompare(b.item))
  }, [board])
  const grand = byPiece.reduce((t, r) => ({ par: t.par + r.par, home: t.home + r.home, bag: t.bag + r.bag, laundry: t.laundry + r.laundry, missing: t.missing + r.missing }), { par: 0, home: 0, bag: 0, laundry: 0, missing: 0 })

  const th = (k: SortK, label: string, left = false) => (
    <th className={`font-medium text-[11px] py-2 px-2 cursor-pointer select-none whitespace-nowrap ${left ? 'text-left' : 'text-right'}`} style={{ color: C.muted }}
      onClick={() => setSort(p => ({ k, dir: p.k === k ? (-p.dir as 1 | -1) : (k === 'name' ? 1 : -1) }))}>
      {label}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )
  const num = (v: number) => <td className="text-right tabular-nums py-2 px-2" style={{ color: v === 0 ? '#CBD5E1' : C.ink, fontWeight: 500 }}>{v === 0 ? '·' : v}</td>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Maletas en total" value={sum.total} color={C.ink} />
        <Stat label="Fuera de lavandería" value={sum.total - sum.lav} color={C.ink} />
        <Stat label="Piezas faltantes" value={s.missingPieces} color={s.missingPieces ? C.red : C.ink} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Seg value={view} onChange={v => setView(v as View)} options={[['maleta', 'Por casa (maletas)'], ['pieza', 'Por pieza']]} />
        {view === 'maleta' && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar casa, cliente o código" className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg text-[12px]" style={{ border: `1px solid ${C.border}`, background: 'white' }} />
        )}
      </div>

      {view === 'pieza' ? (
        <div className="rounded-xl p-4" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <InventoryTable rows={byPiece} totals={grand} />
          <p className="text-[11px] mt-3" style={{ color: C.muted }}>Suma de todas las casas. «Casa» y «Falta» son estimados a partir de lo declarado; un conteo físico los corrige.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 290px)' }}>
            <table className="w-full" style={{ fontSize: 13 }}>
              <thead className="sticky top-0 z-10" style={{ background: '#F8FAFC', boxShadow: `0 1px 0 ${C.border}` }}>
                <tr>
                  {th('name', 'Casa', true)}{th('total', 'Maletas')}{th('casa', 'En casa')}{th('cleaner', 'Con cleaner')}{th('transito', 'En tránsito')}{th('lav', 'En lavandería')}
                </tr>
              </thead>
              <tbody>
                {bags.map(({ b, v }) => {
                  const isOpen = open === b.id
                  return (
                    <Fragment key={b.id}>
                      <tr onClick={() => setOpen(isOpen ? null : b.id)} className="cursor-pointer" style={{ borderTop: `1px solid ${C.border}`, background: isOpen ? '#F8FAFC' : undefined }}>
                        <td className="py-2 px-2">
                          <p className="font-semibold truncate max-w-[220px]" style={{ color: C.ink }}>{isOpen ? '▾' : '▸'} {b.name}</p>
                          <p className="text-[10px]" style={{ color: C.muted }}>{b.clientName ? `${b.clientName} · ` : ''}{b.codeLabel || b.code || '—'}</p>
                        </td>
                        <td className="text-right tabular-nums py-2 px-2 font-semibold" style={{ color: C.ink }}>{v.total}</td>
                        {num(v.casa)}{num(v.cleaner)}{num(v.transito)}{num(v.lav)}
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={6} className="px-3 pb-3 pt-1" style={{ background: '#F8FAFC' }}>
                          <div className="space-y-1">
                            {b.units.map(u => (
                              <div key={u.code} className="flex items-center gap-2 text-[12px]">
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'white', border: `1px solid ${C.border}` }}>{u.code}</span>
                                <b style={{ color: WHERE_COLOR[u.where] || C.slate }}>{u.label}</b>
                                {u.days != null && u.days > 0 && <span style={{ color: C.muted }}>· {u.days} d</span>}
                              </div>
                            ))}
                          </div>
                          <button onClick={() => onOpen(b)} className="mt-2 text-[12px] font-medium" style={{ color: C.tealDark }}>Abrir casa →</button>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0" style={{ background: '#F1F5F9', boxShadow: `0 -1px 0 ${C.border}` }}>
                <tr className="font-semibold">
                  <td className="py-2 px-2" style={{ color: C.ink }}>Suma · {bags.length} casas</td>
                  <td className="text-right tabular-nums py-2 px-2">{sum.total}</td><td className="text-right tabular-nums py-2 px-2">{sum.casa}</td>
                  <td className="text-right tabular-nums py-2 px-2">{sum.cleaner}</td><td className="text-right tabular-nums py-2 px-2">{sum.transito}</td><td className="text-right tabular-nums py-2 px-2">{sum.lav}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {bags.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Nada que mostrar.</p>}
        </div>
      )}
    </div>
  )
}

export function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
      <p className="text-[22px] font-semibold leading-none tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>{label}</p>
    </div>
  )
}

export function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ background: '#E2E8F0' }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className="px-3 py-1.5 rounded-md text-[12px] font-medium"
          style={{ background: value === k ? 'white' : 'transparent', color: value === k ? C.ink : C.slate }}>{l}</button>
      ))}
    </div>
  )
}
