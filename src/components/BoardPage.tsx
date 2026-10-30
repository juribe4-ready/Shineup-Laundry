import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { Board, BoardBag } from '../lib/types'
import { C, fmtDate, STATE_COLOR, STATE_ORDER } from './ui'

const DIRTYISH = ['Dirty', 'Inspected', 'Washing']
type Sort = 'urgencia' | 'casa' | 'cliente'

interface Group { key: string; title: string; hint: string; color: string; bags: BoardBag[] }

// Reparte cada casa (juego de maletas) en el primer grupo que le corresponde (de más a menos urgente).
function groupBags(board: Board, bags: BoardBag[]): Group[] {
  const cfg = board.config
  const g: Group[] = [
    { key: 'urgent', title: 'Urgente', hint: 'sucias y la limpieza es hoy o mañana', color: C.red, bags: [] },
    { key: 'soon', title: 'Próximas 48 h', hint: 'sucias y la limpieza se acerca', color: C.amber, bags: [] },
    { key: 'over', title: 'Sucias de más', hint: `más de ${cfg.laundryDirtyMaxDays} días sin lavar`, color: C.red, bags: [] },
    { key: 'ready', title: 'Listas para usar', hint: 'limpias con limpieza próxima', color: C.green, bags: [] },
    { key: 'queue', title: 'En proceso', hint: 'sin urgencia', color: C.slate, bags: [] },
  ]
  const by = Object.fromEntries(g.map(x => [x.key, x]))
  for (const b of bags) {
    const st = b.state || ''
    if (DIRTYISH.includes(st) && b.risk === 'red') by.urgent.bags.push(b)
    else if (DIRTYISH.includes(st) && b.risk === 'amber') by.soon.bags.push(b)
    else if (DIRTYISH.includes(st) && b.dirtyLevel === 'red') by.over.bags.push(b)
    else if (st === 'Clean' && b.daysToNext != null && b.daysToNext <= cfg.laundryRiskAmberDays) by.ready.bags.push(b)
    else if (DIRTYISH.includes(st)) by.queue.bags.push(b)
  }
  return g.filter(x => x.bags.length)
}

// Etapa de cada maleta física (la casa puede tener maletas en etapas distintas)
const unitStage = (b: BoardBag, u: BoardBag['units'][number]): string => {
  if (u.where === 'casa') return 'Clean'            // se quedó limpia en la casa
  if (u.where === 'uso') return 'In Use'
  if (u.where === 'transito' || u.where === 'cleaner') return 'Dirty'
  return b.state || 'Sin estado'
}
const chipsOf = (b: BoardBag) => b.units.length
  ? b.units.map(u => ({ code: u.code || `${b.code || b.name}-${u.n}`, stage: unitStage(b, u) }))
  : [{ code: b.codeLabel || b.code || b.name, stage: b.state || 'Sin estado' }]

const houseName = (b: BoardBag) => (b.name && !b.name.includes('_') ? b.name : b.properties.map(p => p.name).join(' / ') || b.name)
const clientName = (b: BoardBag) => (b.name.includes('_') ? b.name.split('_')[0] : '')
const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
const whenOf = (b: BoardBag) => b.nextCleaning ? (b.daysToNext === 0 ? 'Hoy' : b.daysToNext === 1 ? 'Mañana' : fmtDate(b.nextCleaning.date)) : 'Sin limpieza'
const whenColor = (b: BoardBag) => b.risk === 'red' ? C.red : b.risk === 'amber' ? C.amber : C.slate

const COLS = 'md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_110px_80px] md:gap-3 md:items-center'

export default function BoardPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag) => void }) {
  const [filter, setFilter] = useState<'accion' | 'todas'>('accion')
  const [stage, setStage] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('urgencia')
  const [closed, setClosed] = useState<Set<string>>(new Set(['queue']))
  const s = board.summary

  // Maletas físicas por etapa (para la barra y la leyenda)
  const stageCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const b of board.bags) for (const c of chipsOf(b)) m[c.stage] = (m[c.stage] || 0) + 1
    return m
  }, [board])
  const totalUnits = Object.values(stageCount).reduce((a, b) => a + b, 0)

  const sorter = (a: BoardBag, b: BoardBag) =>
    sort === 'casa' ? cmp(houseName(a), houseName(b))
    : sort === 'cliente' ? (cmp(clientName(a) || '￿', clientName(b) || '￿') || cmp(houseName(a), houseName(b)))
    : ((a.daysToNext ?? 99) - (b.daysToNext ?? 99) || (b.daysDirty ?? 0) - (a.daysDirty ?? 0) || cmp(houseName(a), houseName(b)))

  const matches = (b: BoardBag) => {
    if (stage && !chipsOf(b).some(c => c.stage === stage)) return false
    const t = q.trim().toLowerCase()
    return !t || `${houseName(b)} ${b.name} ${b.code || ''} ${b.units.map(u => u.code || '').join(' ')} ${b.properties.map(p => p.name).join(' ')}`.toLowerCase().includes(t)
  }
  const all = useMemo(() => board.bags.filter(matches).sort(sorter), [board, stage, q, sort]) // eslint-disable-line
  const groups = useMemo(() => groupBags(board, all).map(g => ({ ...g, bags: g.bags.slice().sort(sorter) })), [board, all, sort]) // eslint-disable-line
  const pending = useMemo(() => groupBags(board, board.bags).reduce((n, x) => n + x.bags.length, 0), [board])
  const urgent = useMemo(() => board.bags.filter(b => DIRTYISH.includes(b.state || '') && b.risk === 'red').length, [board])
  const grouped = filter === 'accion' && !stage && !q.trim()
  const flat = filter === 'accion' ? groups.flatMap(g => g.bags) : all

  const pillBase = 'px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap'
  const toggle = (k: string) => setClosed(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })

  return (
    <div className="space-y-3">
      {/* Bloque fijo: no se mueve al hacer scroll */}
      <div className="sticky top-12 md:top-0 z-20 -mx-4 px-4 md:-mx-8 md:px-8 pt-2 pb-2" style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, boxShadow: '0 6px 10px -8px rgba(15,23,42,.25)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] mr-auto" style={{ color: C.slate }}><b>{board.bags.length}</b> casas · <b>{s.totalBags}</b> maletas</span>
          {urgent > 0 && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{urgent} urgentes</span>}
          <span className="hidden md:inline text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>{s.dirtyOverLimit} sucias de más</span>
          <span className="hidden md:inline text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>{s.openIncidents} incidentes</span>
          <span className="hidden md:inline text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'white', color: C.slate, border: `1px solid ${C.border}` }}>{s.unitsInTransit} en tránsito</span>
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
            {stage && <button onClick={() => setStage(null)} className="text-[11px] underline px-1" style={{ color: C.slate }}>quitar filtro</button>}
          </div>
          {totalUnits === 0 && <p className="text-[11px] mt-1" style={{ color: C.muted }}>Sin maletas con estado.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 flex-1 min-w-[140px]" style={{ background: 'white', border: `1px solid ${C.border}` }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar casa, cliente o código" className="w-full py-1.5 text-[12px] outline-none bg-transparent" />
          </div>
          {([['accion', `Acción · ${pending}`], ['todas', `Todas · ${board.bags.length}`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={pillBase} style={{ background: filter === k ? C.ink : 'white', color: filter === k ? 'white' : C.slate, border: `1px solid ${filter === k ? C.ink : C.border}` }}>{label}</button>
          ))}
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="hidden md:block rounded-lg px-2 py-1.5 text-[12px]" style={{ background: 'white', border: `1px solid ${C.border}`, color: C.slate }}>
            <option value="urgencia">Orden: urgencia</option><option value="cliente">Orden: cliente</option><option value="casa">Orden: casa</option>
          </select>
        </div>

        {stage && (
          <p className="text-[12px] mt-2 px-1" style={{ color: C.slate }}>Mostrando <b>{all.length}</b> {all.length === 1 ? 'casa' : 'casas'} con maletas <b style={{ color: STATE_COLOR[stage] }}>{stage}</b> ({stageCount[stage] || 0} {(stageCount[stage] || 0) === 1 ? 'maleta' : 'maletas'})</p>
        )}
        <div className={`hidden ${COLS} px-4 pt-2.5 text-[10px] font-bold uppercase tracking-wide`} style={{ color: C.muted }}>
          <span>Casa</span><span>Maletas</span><span>Próx. limpieza</span><span>Días sucia</span>
        </div>
      </div>

      {s.withoutCode > 0 && <p className="text-[12px] px-1" style={{ color: C.amber }}>{s.withoutCode} casas sin código ({s.withoutCodeBags} maletas físicas por etiquetar). Ve a Etiquetas.</p>}

      {grouped ? (
        groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] font-semibold" style={{ color: C.ink }}>Todo al día</p>
            <p className="text-[13px] mt-1" style={{ color: C.muted }}>No hay casas pendientes. Usa «Todas» para ver el resto.</p>
          </div>
        ) : groups.map(grp => {
          const shut = closed.has(grp.key)
          return (
            <section key={grp.key}>
              <button onClick={() => toggle(grp.key)} className="w-full flex items-center gap-2 mb-2 pl-2 text-left" style={{ borderLeft: `4px solid ${grp.color}` }}>
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: grp.color }}>{grp.title}</span>
                <span className="text-[12px]" style={{ color: C.muted }}>{grp.bags.length} {grp.bags.length === 1 ? 'casa' : 'casas'}<span className="hidden md:inline"> · {grp.hint}</span></span>
                <span className="ml-auto" style={{ color: C.muted }}>{shut ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
              </button>
              {!shut && <div className="space-y-2">{grp.bags.map(b => <Row key={b.id} b={b} onOpen={onOpen} />)}</div>}
            </section>
          )
        })
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
  const chips = chipsOf(b)
  const cl = clientName(b)
  const cap = 'text-[9px] font-bold uppercase tracking-wide mb-0.5 md:hidden'
  return (
    <button onClick={() => onOpen(b)} className={`w-full text-left rounded-xl px-3.5 py-2.5 ${COLS}`}
      style={{ background: 'white', border: `1px solid ${C.border}`, borderLeft: `4px solid ${b.risk === 'red' ? C.red : b.risk === 'amber' ? C.amber : C.border}` }}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{houseName(b)}</p>
          <p className="text-[11px] truncate" style={{ color: C.muted }}>
            {chips.length} {chips.length === 1 ? 'maleta' : 'maletas'}{cl ? ` · ${cl}` : ''}{b.openIncidents > 0 || b.inventory.totals.missing > 0 ? ' · ' : ''}
            {b.openIncidents > 0 ? <span style={{ color: C.red }}>{b.openIncidents} incid. </span> : null}
            {b.inventory.totals.missing > 0 ? <span style={{ color: C.red }}>Faltan {b.inventory.totals.missing}</span> : null}
          </p>
        </div>
        <div className="text-right md:hidden">
          <p className={cap} style={{ color: C.muted }}>Próx. limpieza</p>
          <p className="text-[13px] font-extrabold" style={{ color: whenColor(b) }}>{whenOf(b)}</p>
        </div>
      </div>
      <div className="mt-2 md:mt-0 min-w-0">
        <p className={cap} style={{ color: C.muted }}>Maletas</p>
        <div className="flex flex-wrap gap-1.5">
          {chips.map(c => { const col = STATE_COLOR[c.stage] || C.muted; return (
            <span key={c.code} title={c.stage} className="font-mono text-[11px] font-bold rounded-md px-1.5 py-0.5" style={{ background: col + '1F', border: `1px solid ${col}66`, color: C.ink }}>{c.code}</span>
          ) })}
        </div>
      </div>
      <p className="hidden md:block text-[13px] font-bold" style={{ color: whenColor(b) }}>{whenOf(b)}</p>
      <p className="hidden md:block text-[13px]" style={{ color: C.slate }}>{b.daysDirty != null ? `${b.daysDirty} d` : '—'}</p>
    </button>
  )
}
