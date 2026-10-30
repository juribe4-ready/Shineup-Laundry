import { useMemo, useState } from 'react'
import type { Board, BoardBag } from '../lib/types'
import { C, Card, Dot, fmtDate, LEVEL_COLOR, Pill, SEMAFORO_COLOR, STATE_COLOR, STATE_ORDER } from './ui'

const urgency = (b: BoardBag) => {
  const lv = { red: 0, amber: 1, ok: 2 }
  return [lv[b.alert], b.daysToNext ?? 99, -(b.daysDirty ?? 0)] as const
}

export default function BoardPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [filter, setFilter] = useState<string>('todas')
  const s = board.summary
  const list = useMemo(() => {
    const l = board.bags.filter(b => filter === 'todas' ? true : filter === 'riesgo' ? b.alert !== 'ok' : (b.state || 'Sin estado') === filter)
    return l.sort((a, b) => { const x = urgency(a), y = urgency(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] })
  }, [board, filter])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="En riesgo 48h" value={s.atRisk48h} color={s.atRisk48h ? C.red : C.green} />
        <Stat label="Sucias de más" value={s.dirtyOverLimit} color={s.dirtyOverLimit ? C.red : C.green} />
        <Stat label="Incidentes" value={s.openIncidents} color={s.openIncidents ? C.amber : C.green} />
      </div>
      {s.withoutCode > 0 && <p className="text-[12px] font-semibold px-1" style={{ color: C.amber }}>{s.withoutCode} maletas sin código QR (ve a Etiquetas).</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[['todas', 'Todas', board.bags.length], ['riesgo', 'En riesgo', s.atRisk], ...STATE_ORDER.map(st => [st, st, s.counts[st] || 0])].map(([k, label, n]) => (
          <button key={String(k)} onClick={() => setFilter(String(k))} className="px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap"
            style={{ background: filter === k ? C.ink : 'white', color: filter === k ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{label} · {n}</button>
        ))}
      </div>
      {list.map(b => (
        <Card key={b.id}>
          <button className="w-full text-left" onClick={() => onOpen(b)}>
            <div className="flex items-center gap-2">
              <Dot color={SEMAFORO_COLOR[b.semaforo]} size={12} />
              <span className="text-[15px] font-black flex-1" style={{ color: C.ink }}>{b.code || '—'} · {b.name}</span>
              <Pill text={b.state || 'Sin estado'} color={STATE_COLOR[b.state || 'Sin estado']} solid />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {b.daysDirty != null && <Pill text={`Sucia ${b.daysDirty} d`} color={LEVEL_COLOR[b.dirtyLevel]} />}
              {b.nextCleaning && <Pill text={`Limpieza ${b.daysToNext === 0 ? 'HOY' : `en ${b.daysToNext} d`} · ${fmtDate(b.nextCleaning.date)}`} color={LEVEL_COLOR[b.risk]} />}
              {b.cycle?.special && <Pill text="Tratamiento especial" color={C.amber} solid />}
              {b.openIncidents > 0 && <Pill text={`${b.openIncidents} incid.`} color={C.red} />}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>{b.properties.map(p => p.name).join(' · ')}</p>
          </button>
        </Card>
      ))}
      {list.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Nada en esta vista.</p>}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: 'white', border: `1px solid ${C.border}` }}>
      <p className="text-[24px] font-black" style={{ color }}>{value}</p>
      <p className="text-[10px] font-bold uppercase" style={{ color: C.muted }}>{label}</p>
    </div>
  )
}
