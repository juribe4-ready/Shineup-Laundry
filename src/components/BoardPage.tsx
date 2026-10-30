import { useMemo, useState } from 'react'
import type { Board, BoardBag } from '../lib/types'
import { C, Dot, fmtDate, LEVEL_COLOR, Pill, SEMAFORO_COLOR, STATE_COLOR, STATE_ORDER } from './ui'
import { Stat } from './InventoryPage'

const DIRTYISH = ['Dirty', 'Inspected', 'Washing']

interface Group { key: string; title: string; hint: string; color: string; bags: BoardBag[] }

// Reparte cada maleta en el primer grupo que le corresponde (de más a menos urgente).
function groupBags(board: Board): Group[] {
  const cfg = board.config
  const g: Group[] = [
    { key: 'urgent', title: 'Urgente', hint: 'Sin lavar y la limpieza es hoy o mañana', color: C.red, bags: [] },
    { key: 'soon', title: 'Próximas 48 h', hint: 'Sin lavar y la limpieza se acerca', color: C.amber, bags: [] },
    { key: 'over', title: 'Sucias de más', hint: `Más de ${cfg.laundryDirtyMaxDays} días sin lavar`, color: C.red, bags: [] },
    { key: 'ready', title: 'Listas para sacar', hint: 'Limpias con limpieza próxima', color: C.green, bags: [] },
    { key: 'queue', title: 'En proceso', hint: 'Sucias, inspeccionadas o lavando, sin urgencia', color: C.slate, bags: [] },
  ]
  const by = Object.fromEntries(g.map(x => [x.key, x]))
  for (const b of board.bags) {
    const st = b.state || ''
    if (DIRTYISH.includes(st) && b.risk === 'red') by.urgent.bags.push(b)
    else if (DIRTYISH.includes(st) && b.risk === 'amber') by.soon.bags.push(b)
    else if (DIRTYISH.includes(st) && b.dirtyLevel === 'red') by.over.bags.push(b)
    else if (st === 'Clean' && b.daysToNext != null && b.daysToNext <= cfg.laundryRiskAmberDays) by.ready.bags.push(b)
    else if (DIRTYISH.includes(st)) by.queue.bags.push(b)
  }
  for (const x of g) x.bags.sort((a, b) => (a.daysToNext ?? 99) - (b.daysToNext ?? 99) || (b.daysDirty ?? 0) - (a.daysDirty ?? 0))
  return g.filter(x => x.bags.length)
}

export default function BoardPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [filter, setFilter] = useState<string>('inicio')
  const s = board.summary
  const groups = useMemo(() => groupBags(board), [board])
  const flat = useMemo(() => filter === 'inicio' ? [] : board.bags.filter(b => filter === 'todas' ? true : (b.state || 'Sin estado') === filter), [board, filter])
  const pending = groups.reduce((n, x) => n + x.bags.length, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="En riesgo 48 h" value={s.atRisk48h} color={s.atRisk48h ? C.red : C.ink} />
        <Stat label="Sucias de más" value={s.dirtyOverLimit} color={s.dirtyOverLimit ? C.red : C.ink} />
        <Stat label="Incidentes" value={s.openIncidents} color={s.openIncidents ? C.amber : C.ink} />
      </div>
      {s.withoutCode > 0 && <p className="text-[12px] px-1" style={{ color: C.amber }}>{s.withoutCode} maletas sin código QR (ve a Etiquetas).</p>}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        {[['inicio', 'Inicio', pending], ['todas', 'Todas', board.bags.length], ...STATE_ORDER.map(st => [st, st, s.counts[st] || 0])].map(([k, label, n]) => (
          <button key={String(k)} onClick={() => setFilter(String(k))} className="px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap"
            style={{ background: filter === k ? C.ink : 'white', color: filter === k ? 'white' : C.slate, border: `1px solid ${filter === k ? C.ink : C.border}` }}>{label} · {n}</button>
        ))}
      </div>

      {filter === 'inicio' ? (
        groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] font-semibold" style={{ color: C.ink }}>Todo al día</p>
            <p className="text-[13px] mt-1" style={{ color: C.muted }}>No hay maletas pendientes. Usa «Todas» para ver el resto.</p>
          </div>
        ) : groups.map(grp => (
          <section key={grp.key}>
            <div className="flex items-baseline gap-2 mb-2 px-0.5">
              <Dot color={grp.color} size={8} />
              <h2 className="text-[15px] font-semibold" style={{ color: C.ink }}>{grp.title}</h2>
              <span className="text-[12px]" style={{ color: C.muted }}>{grp.bags.length}</span>
            </div>
            <p className="text-[12px] -mt-1 mb-2 px-0.5" style={{ color: C.muted }}>{grp.hint}</p>
            <div className="space-y-2">{grp.bags.map(b => <Row key={b.id} b={b} onOpen={onOpen} />)}</div>
          </section>
        ))
      ) : (
        <div className="space-y-2">
          {flat.map(b => <Row key={b.id} b={b} onOpen={onOpen} />)}
          {flat.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Nada en esta vista.</p>}
        </div>
      )}
    </div>
  )
}

function Row({ b, onOpen }: { b: BoardBag; onOpen: (b: BoardBag) => void }) {
  const when = b.nextCleaning ? (b.daysToNext === 0 ? 'Hoy' : b.daysToNext === 1 ? 'Mañana' : fmtDate(b.nextCleaning.date)) : null
  return (
    <button onClick={() => onOpen(b)} className="w-full text-left rounded-xl flex overflow-hidden" style={{ background: 'white', border: `1px solid ${C.border}` }}>
      <div className="w-[76px] shrink-0 flex flex-col items-center justify-center py-3 px-1 text-center" style={{ borderRight: `1px solid ${C.border}`, background: '#FAFBFC' }}>
        {when ? <>
          <span className="text-[10px]" style={{ color: C.muted }}>Limpieza</span>
          <span className="text-[13px] font-semibold" style={{ color: LEVEL_COLOR[b.risk] === C.green ? C.ink : LEVEL_COLOR[b.risk] }}>{when}</span>
        </> : <span className="text-[11px]" style={{ color: C.muted }}>Sin limpieza próxima</span>}
      </div>
      <div className="flex-1 min-w-0 p-3">
        <div className="flex items-center gap-2">
          <Dot color={SEMAFORO_COLOR[b.semaforo]} size={8} />
          <span className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{b.code || '—'} · {b.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Pill text={b.state || 'Sin estado'} color={STATE_COLOR[b.state || 'Sin estado']} />
          {b.daysDirty != null && <Pill text={`Sucia ${b.daysDirty} d`} color={LEVEL_COLOR[b.dirtyLevel]} />}
          {b.cycle?.special && <Pill text="Especial" color={C.amber} />}
          {b.openIncidents > 0 && <Pill text={`${b.openIncidents} incid.`} color={C.red} />}
          {b.inventory.totals.missing > 0 && <Pill text={`Faltan ${b.inventory.totals.missing}`} color={C.red} />}
        </div>
        <p className="text-[11px] mt-1.5 truncate" style={{ color: C.muted }}>{b.properties.map(p => p.name).join(' · ')}</p>
      </div>
    </button>
  )
}
