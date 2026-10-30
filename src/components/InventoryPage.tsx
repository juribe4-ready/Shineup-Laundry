import { useMemo, useState } from 'react'
import type { Board, BoardBag, InvRow } from '../lib/types'
import { C, Pill, STATE_COLOR } from './ui'
import { InventoryTable } from './InventoryTable'

type View = 'maleta' | 'pieza'

export default function InventoryPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [view, setView] = useState<View>('maleta')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const s = board.summary

  const bags = useMemo(() => board.bags
    .filter(b => b.inventory.rows.length > 0)
    .filter(b => !onlyMissing || b.inventory.totals.missing > 0)
    .sort((a, b) => b.inventory.totals.missing - a.inventory.totals.missing || String(a.code || a.name).localeCompare(String(b.code || b.name))), [board, onlyMissing])

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Piezas faltantes" value={s.missingPieces} color={s.missingPieces ? C.red : C.ink} />
        <Stat label="Maletas con falta" value={s.bagsWithMissing} color={s.bagsWithMissing ? C.red : C.ink} />
        <Stat label="En lavandería" value={grand.laundry} color={C.ink} />
      </div>

      <div className="flex items-center gap-2">
        <Seg value={view} onChange={v => setView(v as View)} options={[['maleta', 'Por maleta'], ['pieza', 'Por pieza']]} />
        {view === 'maleta' && (
          <button onClick={() => setOnlyMissing(v => !v)} className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ background: onlyMissing ? C.ink : 'white', color: onlyMissing ? 'white' : C.slate, border: `1px solid ${C.border}` }}>Solo con falta</button>
        )}
      </div>

      {view === 'pieza' ? (
        <div className="rounded-xl p-4" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <InventoryTable rows={byPiece} totals={grand} />
          <p className="text-[11px] mt-3" style={{ color: C.muted }}>Suma de todas las maletas. «Casa» y «Falta» son estimados a partir de lo declarado; un conteo físico los corrige.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bags.map(b => {
            const t = b.inventory.totals, isOpen = open === b.id
            return (
              <div key={b.id} className="rounded-xl" style={{ background: 'white', border: `1px solid ${C.border}` }}>
                <button className="w-full text-left p-3" onClick={() => setOpen(isOpen ? null : b.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold flex-1 truncate" style={{ color: C.ink }}>{b.codeLabel || b.code || '—'} · {b.name}</span>
                    <Pill text={b.state || 'Sin estado'} color={STATE_COLOR[b.state || 'Sin estado']} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                    <Mini label="Casa" v={t.home} /><Mini label="Maleta" v={t.bag} /><Mini label="Lavand." v={t.laundry} /><Mini label="Falta" v={t.missing} bad />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <InventoryTable rows={b.inventory.rows} totals={t} compact />
                    <button onClick={() => onOpen(b)} className="mt-2 text-[12px] font-medium" style={{ color: C.tealDark }}>Abrir maleta →</button>
                  </div>
                )}
              </div>
            )
          })}
          {bags.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>{onlyMissing ? 'No hay maletas con faltantes.' : 'Ninguna maleta tiene contenido estándar definido.'}</p>}
        </div>
      )}
    </div>
  )
}

function Mini({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  return (
    <div className="rounded-lg py-1.5" style={{ background: bad && v > 0 ? '#FEF2F2' : C.bg }}>
      <p className="text-[15px] font-semibold tabular-nums" style={{ color: bad && v > 0 ? C.red : v === 0 ? '#CBD5E1' : C.ink }}>{v}</p>
      <p className="text-[10px]" style={{ color: C.muted }}>{label}</p>
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
