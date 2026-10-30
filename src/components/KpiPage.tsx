import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import type { Kpis } from '../lib/types'
import { C, Card, fmtHours, SectionTitle, Spinner } from './ui'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const pct = (n: number | null) => n == null ? '—' : `${n.toFixed(0)}%`

export default function KpiPage({ onMsg }: { onMsg: (m: string, err?: boolean) => void }) {
  const [days, setDays] = useState(30)
  const [k, setK] = useState<Kpis | null>(null)
  useEffect(() => {
    setK(null)
    const to = new Date(), from = new Date(Date.now() - days * 864e5)
    apiGet<Kpis>('kpis', { from: iso(from), to: iso(to) }).then(setK).catch(e => onMsg(e.message, true))
  }, [days]) // eslint-disable-line
  return (
    <div className="space-y-3 pb-4">
      <div className="flex gap-2 no-print">
        {[7, 30, 90].map(d => <button key={d} onClick={() => setDays(d)} className="px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ background: days === d ? C.ink : 'white', color: days === d ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{d} días</button>)}
        <button onClick={() => window.print()} className="ml-auto px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>Imprimir / PDF</button>
      </div>
      {!k ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <T label="Ciclos" v={String(k.cycles)} />
            <T label="Ciclo promedio" v={fmtHours(k.cycleTime.avgH)} sub={`mediana ${fmtHours(k.cycleTime.medianH)} · p90 ${fmtHours(k.cycleTime.p90H)}`} />
            <T label="A tiempo" v={pct(k.onTime.pct)} sub={`${k.onTime.onTime}/${k.onTime.total}`} />
            <T label="Lavado promedio" v={fmtHours(k.washDurationAvgH)} sub={`inspección tarda ${fmtHours(k.inspectionDelayAvgH)}`} />
            <T label="Trat. especial" v={pct(k.specialPct)} />
            <T label="Enviado de menos" v={pct(k.shortPct)} />
            <T label="Re-lavado" v={pct(k.rewashPct)} />
            <T label="Maletas llevadas / devueltas" v={`${k.bags.out} / ${k.bags.back}`} sub={`${k.bags.cyclesWithGap} ciclos con diferencia`} />
            <T label="Externo" v={pct(k.external.pct)} sub={`${k.external.cycles} ciclos`} />
          </div>
          <SectionTitle>Incidentes ({k.incidents.total} · {k.incidents.per100 ?? '—'} por 100 ciclos)</SectionTitle>
          <List title="Por tipo" rows={k.incidents.byType} />
          <List title="Por ítem" rows={k.incidents.byItem} />
          <List title="Por etapa" rows={k.incidents.byStage} />
          <List title="Piezas repuestas (nuevas)" rows={k.replaced} />
          <SectionTitle>Quién lava</SectionTitle>
          <Card>{k.washers.length === 0 ? <p className="text-[12px]" style={{ color: C.muted }}>Sin datos.</p> : k.washers.map(w => <Row key={w.name} a={w.name} b={`${w.cycles} ciclos · ${fmtHours(w.avgWashH)}`} />)}</Card>
          <SectionTitle>Maletas con más problemas</SectionTitle>
          <Card>{k.worstBags.length === 0 ? <p className="text-[12px]" style={{ color: C.muted }}>Sin datos.</p> : k.worstBags.map(w => <Row key={w.name} a={w.name} b={`${w.incidents} incid. · ${w.special} especiales / ${w.cycles}`} />)}</Card>
          {k.debug.warnings.length > 0 && <p className="text-[11px]" style={{ color: C.amber }}>{k.debug.warnings.join(' | ')}</p>}
        </>
      )}
    </div>
  )
}
const T = ({ label, v, sub }: { label: string; v: string; sub?: string }) => (
  <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
    <p className="text-[10px] font-medium uppercase" style={{ color: C.muted }}>{label}</p>
    <p className="text-[22px] font-semibold" style={{ color: C.ink }}>{v}</p>
    {sub && <p className="text-[10px]" style={{ color: C.slate }}>{sub}</p>}
  </div>
)
const Row = ({ a, b }: { a: string; b: string }) => <div className="flex justify-between py-1 text-[12px]"><span className="font-semibold" style={{ color: C.ink }}>{a}</span><span style={{ color: C.slate }}>{b}</span></div>
const List = ({ title, rows }: { title: string; rows: { name: string; n: number }[] }) => (
  <Card><p className="text-[11px] font-medium uppercase mb-1" style={{ color: C.muted }}>{title}</p>{rows.length === 0 ? <p className="text-[12px]" style={{ color: C.muted }}>—</p> : rows.map(r => <Row key={r.name} a={r.name} b={String(r.n)} />)}</Card>
)
