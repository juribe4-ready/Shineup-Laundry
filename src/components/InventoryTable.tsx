import type { Inventory, InvRow } from '../lib/types'
import { C } from './ui'

const COLS: { k: keyof Omit<InvRow, 'item'>; label: string }[] = [
  { k: 'par', label: 'Par' }, { k: 'home', label: 'Casa' }, { k: 'bag', label: 'Maleta' }, { k: 'laundry', label: 'Lavand.' }, { k: 'missing', label: 'Falta' },
]

// Matriz: una fila por pieza, una columna por lugar donde puede estar.
export function InventoryTable({ rows, totals, compact = false }: { rows: InvRow[]; totals?: Inventory['totals']; compact?: boolean }) {
  if (!rows.length) return <p className="text-[12px]" style={{ color: C.muted }}>Sin contenido estándar definido en Laundry Bags.</p>
  const cell = (v: number, k: string) => (
    <td key={k} className="text-right tabular-nums py-1.5 pl-2" style={{ color: k === 'missing' ? (v > 0 ? C.red : C.muted) : v === 0 ? '#CBD5E1' : C.ink, fontWeight: k === 'missing' && v > 0 ? 700 : 500 }}>{v === 0 && k !== 'par' ? '·' : v}</td>
  )
  return (
    <table className="w-full" style={{ fontSize: compact ? 12 : 13 }}>
      <thead>
        <tr style={{ color: C.muted }}>
          <th className="text-left font-medium text-[11px] pb-1">Pieza</th>
          {COLS.map(c => <th key={c.k} className="text-right font-medium text-[11px] pb-1 pl-2">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.item} style={{ borderTop: `1px solid ${C.border}`, background: r.missing > 0 ? '#FEF2F2' : undefined }}>
            <td className="py-1.5 pr-2" style={{ color: C.slate }}>{r.item}</td>
            {COLS.map(c => cell(r[c.k], c.k))}
          </tr>
        ))}
        {totals && (
          <tr style={{ borderTop: `1px solid ${C.ink}` }}>
            <td className="py-1.5 font-semibold" style={{ color: C.ink }}>Total</td>
            {COLS.map(c => <td key={c.k} className="text-right tabular-nums py-1.5 pl-2 font-semibold" style={{ color: c.k === 'missing' && totals.missing > 0 ? C.red : C.ink }}>{totals[c.k]}</td>)}
          </tr>
        )}
      </tbody>
    </table>
  )
}
