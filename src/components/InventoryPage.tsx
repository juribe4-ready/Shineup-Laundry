import { Fragment, useMemo, useState } from 'react'
import type { Board, BoardBag, InvRow } from '../lib/types'
import { C } from './ui'
import { InventoryTable } from './InventoryTable'

type View = 'maleta' | 'pieza'

type SortK = 'name' | 'par' | 'home' | 'bag' | 'laundry' | 'missing'

export default function InventoryPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [view, setView] = useState<View>('maleta')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [piece, setPiece] = useState('') // '' = todas las piezas (totales)
  const [sort, setSort] = useState<{ k: SortK; dir: 1 | -1 }>({ k: 'missing', dir: -1 })
  const s = board.summary

  const pieces = useMemo(() => [...new Set(board.bags.flatMap(b => b.inventory.rows.map(r => r.item)))].sort(), [board])
  const valsOf = (b: BoardBag): InvRow => {
    if (!piece) return { item: '', ...b.inventory.totals }
    return b.inventory.rows.find(r => r.item === piece) || { item: piece, par: 0, home: 0, bag: 0, laundry: 0, missing: 0 }
  }

  const bags = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = board.bags
      .filter(b => b.inventory.rows.length > 0)
      .filter(b => !t || `${b.name} ${b.code || ''} ${b.clientName || ''}`.toLowerCase().includes(t))
      .map(b => ({ b, v: valsOf(b) }))
      .filter(x => !onlyMissing || x.v.missing > 0)
    list.sort((x, y) => {
      const d = sort.k === 'name' ? String(x.b.name).localeCompare(String(y.b.name)) : (x.v[sort.k] - y.v[sort.k])
      return (d || String(x.b.name).localeCompare(String(y.b.name))) * sort.dir
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, onlyMissing, q, piece, sort])
  const sum = bags.reduce((t, x) => ({ par: t.par + x.v.par, home: t.home + x.v.home, bag: t.bag + x.v.bag, laundry: t.laundry + x.v.laundry, missing: t.missing + x.v.missing }), { par: 0, home: 0, bag: 0, laundry: 0, missing: 0 })

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
    <th className={`font-medium text-[11px] py-2 px-2 cursor-pointer select-none whitespace-nowrap ${left ? 'text-left' : 'text-right'}`} style={{ color: k === 'missing' ? C.red : C.muted }}
      onClick={() => setSort(p => ({ k, dir: p.k === k ? (-p.dir as 1 | -1) : (k === 'name' ? 1 : -1) }))}>
      {label}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )
  const num = (v: number, bad = false) => <td className="text-right tabular-nums py-2 px-2" style={{ color: bad ? (v > 0 ? C.red : '#FCA5A5') : v === 0 ? '#CBD5E1' : C.ink, fontWeight: bad && v > 0 ? 700 : 500 }}>{v === 0 && !bad ? '·' : v}</td>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Piezas faltantes" value={s.missingPieces} color={s.missingPieces ? C.red : C.ink} />
        <Stat label="Maletas con falta" value={s.bagsWithMissing} color={s.bagsWithMissing ? C.red : C.ink} />
        <Stat label="En lavandería" value={grand.laundry} color={C.ink} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Seg value={view} onChange={v => setView(v as View)} options={[['maleta', 'Por casa'], ['pieza', 'Por pieza']]} />
        {view === 'maleta' && (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar casa, cliente o código" className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg text-[12px]" style={{ border: `1px solid ${C.border}`, background: 'white' }} />
            <select value={piece} onChange={e => setPiece(e.target.value)} className="px-2 py-1.5 rounded-lg text-[12px]" style={{ border: `1px solid ${C.border}`, background: 'white', color: C.ink }}>
              <option value="">Todas las piezas</option>
              {pieces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setOnlyMissing(v => !v)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ background: onlyMissing ? C.ink : 'white', color: onlyMissing ? 'white' : C.slate, border: `1px solid ${C.border}` }}>Solo con falta</button>
          </>
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
                  {th('name', piece ? `Casa · ${piece}` : 'Casa', true)}
                  {th('par', 'Total')}{th('home', 'En casa')}{th('bag', 'En maleta')}{th('laundry', 'En lavand.')}{th('missing', 'Falta')}
                </tr>
              </thead>
              <tbody>
                {bags.map(({ b, v }) => {
                  const isOpen = open === b.id
                  return (
                    <Fragment key={b.id}>
                      <tr onClick={() => setOpen(isOpen ? null : b.id)} className="cursor-pointer" style={{ borderTop: `1px solid ${C.border}`, background: v.missing > 0 ? '#FEF2F2' : isOpen ? '#F8FAFC' : undefined }}>
                        <td className="py-2 px-2">
                          <p className="font-semibold truncate max-w-[220px]" style={{ color: C.ink }}>{isOpen ? '▾' : '▸'} {b.name}</p>
                          <p className="text-[10px]" style={{ color: C.muted }}>{b.clientName ? `${b.clientName} · ` : ''}{b.codeLabel || b.code || '—'}{b.qty > 1 ? ` · ${b.qty} maletas` : ''}</p>
                        </td>
                        <td className="text-right tabular-nums py-2 px-2 font-semibold" style={{ color: C.ink }}>{v.par}</td>
                        {num(v.home)}{num(v.bag)}{num(v.laundry)}{num(v.missing, true)}
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={6} className="px-3 pb-3 pt-1" style={{ background: '#F8FAFC' }}>
                          <InventoryTable rows={b.inventory.rows} totals={b.inventory.totals} compact />
                          <button onClick={() => onOpen(b)} className="mt-2 text-[12px] font-medium" style={{ color: C.tealDark }}>Abrir maleta →</button>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0" style={{ background: '#F1F5F9', boxShadow: `0 -1px 0 ${C.border}` }}>
                <tr className="font-semibold">
                  <td className="py-2 px-2" style={{ color: C.ink }}>Suma · {bags.length} casas</td>
                  <td className="text-right tabular-nums py-2 px-2">{sum.par}</td><td className="text-right tabular-nums py-2 px-2">{sum.home}</td>
                  <td className="text-right tabular-nums py-2 px-2">{sum.bag}</td><td className="text-right tabular-nums py-2 px-2">{sum.laundry}</td>
                  <td className="text-right tabular-nums py-2 px-2" style={{ color: sum.missing > 0 ? C.red : C.ink }}>{sum.missing}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {bags.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>{onlyMissing ? 'No hay casas con faltantes.' : 'Nada que mostrar.'}</p>}
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
