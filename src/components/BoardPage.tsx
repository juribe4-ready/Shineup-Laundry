import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Board, BoardBag } from '../lib/types'
import { C, fmtDate, STATE_COLOR, STATE_ORDER } from './ui'

const DIRTYISH = ['Dirty', 'Inspected', 'Washing']
type Sort = 'urgencia' | 'casa' | 'cliente'
type Unit = BoardBag['units'][number]

// Etapa de cada maleta física (una casa puede tener maletas en etapas distintas)
const unitStage = (b: BoardBag, u: Unit): string => {
  if (u.where === 'casa') return 'Clean'                          // se quedó limpia en la casa
  if (u.where === 'uso') return 'In Use'                           // con el cleaner
  if (u.where === 'transito' || u.where === 'cleaner') return 'Dirty'
  // en lavandería: si la casa figura «In Use» pero esta maleta no salió, sigue limpia en lavandería
  return b.state === 'In Use' ? 'Clean' : (b.state || 'Sin estado')
}
const unitsOf = (b: BoardBag) => b.units.length
  ? b.units.map(u => ({ code: u.code || `${b.code || b.name}-${u.n}`, stage: unitStage(b, u), label: u.label, days: u.days }))
  : [{ code: b.codeLabel || b.code || b.name, stage: b.state || 'Sin estado', label: b.state || 'Sin estado', days: null as number | null }]

const houseName = (b: BoardBag) => (b.name && !b.name.includes('_') ? b.name : b.properties.map(p => p.name).join(' / ') || b.name)
const clientName = (b: BoardBag) => (b.clientName || (b.name.includes('_') ? b.name.split('_')[0] : '')).trim()
const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
const RANK: Record<string, number> = { red: 0, amber: 1, ok: 2 }
const whenOf = (b: BoardBag) => b.nextCleaning ? (b.daysToNext === 0 ? 'Hoy' : b.daysToNext === 1 ? 'Mañana' : fmtDate(b.nextCleaning.date)) : 'Sin limpieza'
const whenColor = (b: BoardBag) => b.risk === 'red' ? C.red : b.risk === 'amber' ? C.amber : C.slate
const isUrgent = (b: BoardBag) => DIRTYISH.includes(b.state || '') && b.risk === 'red'

const COLS = 'md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.9fr)_110px_80px] md:gap-3 md:items-start'

export default function BoardPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [stage, setStage] = useState<string | null>(null)
  const [onlyUrgent, setOnlyUrgent] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('urgencia')
  const s = board.summary

  // Maletas físicas por etapa (barra + leyenda)
  const stageCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const b of board.bags) for (const c of unitsOf(b)) m[c.stage] = (m[c.stage] || 0) + 1
    return m
  }, [board])
  const totalUnits = Object.values(stageCount).reduce((a, b) => a + b, 0)
  const urgent = useMemo(() => board.bags.filter(isUrgent).length, [board])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = board.bags.filter(b => {
      if (onlyUrgent && !isUrgent(b)) return false
      if (stage && !unitsOf(b).some(c => c.stage === stage)) return false
      return !t || `${houseName(b)} ${b.name} ${clientName(b)} ${b.code || ''} ${b.units.map(u => u.code || '').join(' ')} ${b.properties.map(p => p.name).join(' ')}`.toLowerCase().includes(t)
    })
    const byUrg = (a: BoardBag, b: BoardBag) => (RANK[a.alert] ?? 2) - (RANK[b.alert] ?? 2) || (a.daysToNext ?? 999) - (b.daysToNext ?? 999) || (b.daysDirty ?? -1) - (a.daysDirty ?? -1) || cmp(houseName(a), houseName(b))
    return list.sort(sort === 'casa' ? (a, b) => cmp(houseName(a), houseName(b))
      : sort === 'cliente' ? (a, b) => cmp(clientName(a) || '￿', clientName(b) || '￿') || cmp(houseName(a), houseName(b))
      : byUrg)
  }, [board, stage, q, sort, onlyUrgent])

  const shownUnits = stage ? rows.reduce((n, b) => n + unitsOf(b).filter(c => c.stage === stage).length, 0) : 0
  const filtered = !!(stage || onlyUrgent || q.trim())

  return (
    <div className="space-y-3">
      {/* Bloque fijo: no se mueve al hacer scroll */}
      <div className="sticky top-12 md:top-0 z-20 -mx-4 px-4 md:-mx-8 md:px-8 pt-2 pb-2" style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, boxShadow: '0 6px 10px -8px rgba(15,23,42,.25)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] mr-auto" style={{ color: C.slate }}><b>{board.bags.length}</b> casas · <b>{s.totalBags}</b> maletas</span>
          <button onClick={() => setOnlyUrgent(v => !v)} title="Sucias y la limpieza es hoy o mañana"
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: onlyUrgent ? '#DC2626' : urgent ? '#FEF2F2' : 'white', color: onlyUrgent ? 'white' : urgent ? '#DC2626' : C.slate, border: `1px solid ${onlyUrgent || urgent ? '#FECACA' : C.border}` }}>{urgent} urgentes</button>
          <span className="hidden md:inline text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>{s.dirtyOverLimit} sucias de más</span>
          <span className="hidden md:inline text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>{s.openIncidents} incidentes</span>
          <span className="hidden md:inline text-[11px] font-semibold px-2.5 py-1 rounded-full" title="Declaradas sucias por el cleaner que lavandería aún no confirma" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>{s.unitsInTransit} en tránsito</span>
        </div>

        {/* Barra del proceso = leyenda de colores = filtro */}
        <div className="mt-2 rounded-xl p-2.5" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: C.muted }}>Maletas por etapa · toca una para filtrar</p>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]" style={{ background: C.border }}>
            {STATE_ORDER.map(st => stageCount[st] ? <div key={st} style={{ flex: stageCount[st], background: STATE_COLOR[st] }} /> : null)}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {STATE_ORDER.map(st => {
              const n = stageCount[st] || 0, on = stage === st, c = STATE_COLOR[st]
              return (
                <button key={st} onClick={() => setStage(on ? null : st)} disabled={!n && !on}
                  className="inline-flex items-center gap-1 md:gap-1.5 rounded-lg px-1.5 md:px-2 py-1 text-[10px] md:text-[12px]"
                  style={{ background: on ? c : c + '1F', border: `1px solid ${on ? c : c + '66'}`, opacity: n || on ? 1 : 0.5 }}>
                  <b style={{ color: on ? 'white' : c }}>{n}</b><span className="font-bold" style={{ color: on ? 'white' : C.ink }}>{st}</span>
                </button>
              )
            })}
            {filtered && <button onClick={() => { setStage(null); setOnlyUrgent(false); setQ('') }} className="text-[11px] underline px-1" style={{ color: C.slate }}>quitar filtros</button>}
          </div>
          {totalUnits === 0 && <p className="text-[11px] mt-1" style={{ color: C.muted }}>Sin maletas con estado.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 flex-1 min-w-[140px]" style={{ background: 'white', border: `1px solid ${C.border}` }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar casa, cliente o código" className="w-full py-1.5 text-[12px] outline-none bg-transparent" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="rounded-lg px-2 py-1.5 text-[12px]" style={{ background: 'white', border: `1px solid ${C.border}`, color: C.slate }}>
            <option value="urgencia">Orden: urgencia</option><option value="cliente">Orden: cliente</option><option value="casa">Orden: casa</option>
          </select>
        </div>

        {filtered && (
          <p className="text-[12px] mt-2 px-1" style={{ color: C.slate }}>
            Mostrando <b>{rows.length}</b> de {board.bags.length} casas
            {stage ? <> con maletas <b style={{ color: STATE_COLOR[stage] }}>{stage}</b> ({shownUnits} {shownUnits === 1 ? 'maleta' : 'maletas'})</> : null}
            {onlyUrgent ? <> · solo urgentes</> : null}
          </p>
        )}
        <div className={`hidden ${COLS} px-4 pt-2.5 text-[10px] font-bold uppercase tracking-wide`} style={{ color: C.muted }}>
          <span>Casa</span><span>Dónde está cada maleta</span><span>Próx. limpieza</span><span>Días sucia</span>
        </div>
      </div>

      {s.withoutCode > 0 && <p className="text-[12px] px-1" style={{ color: C.amber }}>{s.withoutCode} casas sin código ({s.withoutCodeBags} maletas físicas por etiquetar). Ve a Etiquetas.</p>}

      <div className="space-y-2">
        {rows.map(b => <Row key={b.id} b={b} onOpen={onOpen} />)}
        {rows.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Ninguna casa coincide con los filtros.</p>}
      </div>
    </div>
  )
}

function Row({ b, onOpen }: { b: BoardBag; onOpen: (b: BoardBag) => void }) {
  const us = unitsOf(b)
  const cl = clientName(b)
  const cap = 'text-[9px] font-bold uppercase tracking-wide mb-0.5 md:hidden'
  return (
    <button onClick={() => onOpen(b)} className={`w-full text-left rounded-xl px-3.5 py-2.5 ${COLS}`}
      style={{ background: 'white', border: `1px solid ${C.border}`, borderLeft: `4px solid ${b.risk === 'red' ? C.red : b.risk === 'amber' ? C.amber : C.border}` }}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{houseName(b)}</p>
          <p className="text-[11px] truncate" style={{ color: C.muted }}>
            {us.length} {us.length === 1 ? 'maleta' : 'maletas'}{cl ? ` · ${cl}` : ''}
            {b.openIncidents > 0 ? <span style={{ color: C.red }}> · {b.openIncidents} incid.</span> : null}
            {b.inventory.totals.missing > 0 ? <span style={{ color: C.red }}> · Faltan {b.inventory.totals.missing}</span> : null}
          </p>
        </div>
        <div className="text-right md:hidden">
          <p className={cap} style={{ color: C.muted }}>Próx. limpieza</p>
          <p className="text-[13px] font-extrabold" style={{ color: whenColor(b) }}>{whenOf(b)}</p>
        </div>
      </div>
      <div className="mt-2 md:mt-0 min-w-0">
        <p className={cap} style={{ color: C.muted }}>Dónde está cada maleta</p>
        <div className="space-y-1">
          {us.map(c => { const col = STATE_COLOR[c.stage] || C.muted; return (
            <div key={c.code} className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] font-bold rounded-md px-1.5 py-0.5 shrink-0" style={{ background: col + '1F', border: `1px solid ${col}66`, color: C.ink }}>{c.code}</span>
              <span className="text-[11px] truncate" style={{ color: C.slate }}>{c.label}{c.days != null && c.days > 0 && c.stage === 'Dirty' ? ` · ${c.days} d` : ''}</span>
            </div>
          ) })}
        </div>
      </div>
      <p className="hidden md:block text-[13px] font-bold" style={{ color: whenColor(b) }}>{whenOf(b)}</p>
      <p className="hidden md:block text-[13px]" style={{ color: C.slate }}>{b.daysDirty != null ? `${b.daysDirty} d` : '—'}</p>
    </button>
  )
}
