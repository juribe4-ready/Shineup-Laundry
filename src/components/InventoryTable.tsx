import type { Inventory, InvRow } from '../lib/types'
import { C } from './ui'

const sepBorder = `1px solid ${C.ink}`
const hayOf = (r: InvRow) => r.home + r.bag + r.laundry
const fmtDiff = (d: number) => (d === 0 ? '0' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`)
const diffColor = (d: number) => (d < 0 ? C.red : d > 0 ? C.green : '#CBD5E1')

// Una fila por pieza: lo que DEBERÍA haber (estándar), lo que HAY (último conteo), dónde está y la diferencia (rojo falta · verde sobra).
export function InventoryTable({ rows, totals, compact = false }: { rows: InvRow[]; totals?: Inventory['totals']; compact?: boolean }) {
  if (!rows.length) return <p className="text-[12px]" style={{ color: C.muted }}>Sin contenido estándar definido en Laundry Bags.</p>
  const place = (v: number, key: string) => <td key={key} className="text-right tabular-nums py-1.5 pl-2 pr-1" style={{ color: v === 0 ? '#CBD5E1' : C.ink, fontWeight: 500 }}>{v === 0 ? '·' : v}</td>
  const net = rows.reduce((n, r) => n + hayOf(r) - r.par, 0)
  const hayTotal = rows.reduce((n, r) => n + hayOf(r), 0)
  const th = 'text-right font-medium text-[11px] pb-1 pl-2 pr-1'
  return (
    <table className="w-full" style={{ fontSize: compact ? 12 : 13 }}>
      <thead>
        <tr style={{ color: C.muted }}>
          <th className="text-left font-medium text-[11px] pb-1">Pieza</th>
          <th className={th} style={{ color: C.ink }}>Debería</th>
          <th className={th} style={{ color: C.ink, borderRight: sepBorder, paddingRight: 10 }}>Hay</th>
          <th className={th}>Casa</th><th className={th}>Maleta</th><th className={th}>Lavand.</th>
          <th className={th} style={{ fontWeight: 600 }}>Diferencia</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const d = hayOf(r) - r.par
          return (
            <tr key={r.item} style={{ borderTop: `1px solid ${C.border}`, background: d < 0 ? '#FEF2F2' : d > 0 ? '#F0FDF4' : undefined }}>
              <td className="py-1.5 pr-2" style={{ color: C.slate }}>{r.item}{r.par === 0 && d > 0 ? <span className="ml-1 text-[10px] font-semibold rounded-full px-1.5" style={{ background: '#DCFCE7', color: '#15803D' }}>extra</span> : null}</td>
              <td className="text-right tabular-nums py-1.5 pl-2 pr-1" style={{ color: C.slate }}>{r.par}</td>
              <td className="text-right tabular-nums py-1.5 pl-2 pr-1" style={{ color: C.ink, fontWeight: 600, borderRight: sepBorder, paddingRight: 10 }}>{hayOf(r)}</td>
              {place(r.home, 'h')}{place(r.bag, 'b')}{place(r.laundry, 'l')}
              <td className="text-right tabular-nums py-1.5 pl-2 pr-1" style={{ color: diffColor(d), fontWeight: d !== 0 ? 700 : 500 }}>{fmtDiff(d)}</td>
            </tr>
          )
        })}
        {totals && (
          <tr style={{ borderTop: sepBorder }}>
            <td className="py-1.5 font-semibold" style={{ color: C.ink }}>Suma</td>
            <td className="text-right tabular-nums py-1.5 pl-2 pr-1 font-semibold" style={{ color: C.ink }}>{rows.reduce((n, r) => n + r.par, 0)}</td>
            <td className="text-right tabular-nums py-1.5 pl-2 pr-1 font-semibold" style={{ color: C.ink, borderRight: sepBorder, paddingRight: 10 }}>{hayTotal}</td>
            <td className="text-right tabular-nums py-1.5 pl-2 pr-1 font-semibold">{rows.reduce((n, r) => n + r.home, 0)}</td>
            <td className="text-right tabular-nums py-1.5 pl-2 pr-1 font-semibold">{rows.reduce((n, r) => n + r.bag, 0)}</td>
            <td className="text-right tabular-nums py-1.5 pl-2 pr-1 font-semibold">{rows.reduce((n, r) => n + r.laundry, 0)}</td>
            <td className="text-right tabular-nums py-1.5 pl-2 pr-1 font-bold" style={{ color: diffColor(net) }}>{fmtDiff(net)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
