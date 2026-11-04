import { useMemo, useState } from 'react'
import { Search, ChevronDown, ArrowUpDown, SlidersHorizontal } from 'lucide-react'
import type { Board, BoardBag } from '../lib/types'
import { C, fmtDate, Sheet, STATE_COLOR, STATE_ORDER } from './ui'

type Unit = BoardBag['units'][number]
export type OpenMode = 'info' | 'inspect' | 'wash' | 'finish' | 'adjust' | 'incident' | 'dirty'

// Etapa de cada maleta física (una casa puede tener maletas en etapas distintas)
const unitStage = (b: BoardBag, u: Unit): string => {
  if (u.where === 'casa') return 'Clean'
  if (u.where === 'uso') return 'In Use'
  if (u.where === 'transito' || u.where === 'cleaner') return 'Dirty'
  return b.state === 'In Use' ? 'Clean' : (b.state || 'Sin estado')
}
// Orden del proceso: en tránsito → recibida → inspeccionada → lavando → limpia → en uso → en la casa
const unitRank = (b: BoardBag, u: Unit): number => {
  if (u.where === 'transito' || u.where === 'cleaner') return 0
  if (u.where === 'casa') return 6
  if (u.where === 'uso') return 5
  const st = unitStage(b, u)
  return st === 'Dirty' ? 1 : st === 'Inspected' ? 2 : st === 'Washing' ? 3 : 4
}
const RANK_LABEL = ['En tránsito', 'Recibida', 'Inspeccionada', 'Lavando', 'Limpia', 'En uso', 'En la casa']
const unitsOf = (b: BoardBag) => b.units.length
  ? b.units.map(u => ({ code: u.code || `${b.code || b.name}-${u.n}`, stage: unitStage(b, u), rank: unitRank(b, u), label: u.label, days: u.days }))
  : [{ code: b.codeLabel || b.code || b.name, stage: b.state || 'Sin estado', rank: b.state === 'Dirty' ? 1 : b.state === 'Inspected' ? 2 : b.state === 'Washing' ? 3 : 4, label: b.state || 'Sin estado', days: null as number | null }]

const houseName = (b: BoardBag) => (b.name && !b.name.includes('_') ? b.name : b.properties.map(p => p.name).join(' / ') || b.name)
const clientName = (b: BoardBag) => (b.clientName || (b.name.includes('_') ? b.name.split('_')[0] : '')).trim()
const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
const whenOf = (b: BoardBag) => b.nextCleaning ? (b.daysToNext === 0 ? 'Hoy' : b.daysToNext === 1 ? 'Mañana' : fmtDate(b.nextCleaning.date)) : 'Sin limpieza'
const whenColor = (b: BoardBag) => b.risk === 'red' ? C.red : b.risk === 'amber' ? C.amber : C.slate
const rowRank = (b: BoardBag) => Math.min(...unitsOf(b).map(u => u.rank))
const diffOf = (b: BoardBag) => b.inventory.rows.reduce((n, r) => n + (r.home + r.bag + r.laundry - r.par), 0)

// Siguiente paso de la maleta (los botones actúan sobre el ciclo de la maleta; si hay varias, la que va más atrás)
const stateOf = (b: BoardBag) => b.cycle?.state || b.state
type Action = { label: string; mode: OpenMode }
const nextAction = (b: BoardBag): Action => {
  const st = stateOf(b)
  if (st === 'Dirty') return { label: 'Inspeccionar', mode: 'inspect' }
  if (st === 'Inspected') return { label: 'Iniciar lavado', mode: 'wash' }
  if (st === 'Washing') return { label: 'Terminar', mode: 'finish' }
  return { label: 'Ver', mode: 'info' }
}
const menuOf = (b: BoardBag): Action[] => {
  const main = nextAction(b)
  const st = stateOf(b)
  const out: Action[] = []
  if (main.mode !== 'info') out.push({ label: main.mode === 'inspect' ? 'Inspeccionar (abrir y contar)' : main.label, mode: main.mode })
  if (st === 'Dirty') out.push({ label: 'Confirmar que llegó (sin contar)', mode: 'info' })
  if (!st || st === 'Clean' || st === 'In Use') out.push({ label: 'Marcar sucia (ajuste manual)', mode: 'dirty' })
  out.push({ label: 'Contar / ajustar contenido', mode: 'adjust' }, { label: 'Reportar problema', mode: 'incident' }, { label: 'Ver detalle de la maleta', mode: 'info' })
  return out
}

type SortK = 'casa' | 'maleta' | 'prox' | 'estado' | 'sucia'
const WHEN_OPTS = ['Hoy', 'Mañana', 'Esta semana', 'Sin limpieza']
const whenKey = (b: BoardBag) => !b.nextCleaning ? 'Sin limpieza' : b.daysToNext === 0 ? 'Hoy' : b.daysToNext === 1 ? 'Mañana' : (b.daysToNext ?? 99) <= 7 ? 'Esta semana' : 'Más adelante'

const COLS = 'md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_110px_minmax(0,1.3fr)_80px_170px] md:gap-3 md:items-center'

export default function BoardPage({ board, onOpen }: { board: Board; onOpen: (b: BoardBag, mode?: OpenMode) => void }) {
  const [stage, setStage] = useState<string | null>('Dirty')   // abre en «Por lavar»
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: SortK; asc: boolean }>({ k: 'prox', asc: true })
  const [fEstado, setFEstado] = useState<number[]>([])
  const [fWhen, setFWhen] = useState<string[]>([])
  const [fDias, setFDias] = useState<number>(0)
  const [fDiff, setFDiff] = useState(false)
  const [pop, setPop] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const s = board.summary

  const stageCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const b of board.bags) for (const c of unitsOf(b)) m[c.stage] = (m[c.stage] || 0) + 1
    return m
  }, [board])
  const totalUnits = Object.values(stageCount).reduce((a, b) => a + b, 0)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = board.bags.filter(b => {
      if (stage && !unitsOf(b).some(c => c.stage === stage)) return false
      if (fEstado.length && !unitsOf(b).some(c => fEstado.includes(c.rank))) return false
      if (fWhen.length && !fWhen.includes(whenKey(b))) return false
      if (fDias && !((b.daysDirty ?? 0) >= fDias)) return false
      if (fDiff && diffOf(b) === 0) return false
      return !t || `${houseName(b)} ${b.name} ${clientName(b)} ${b.code || ''} ${b.units.map(u => u.code || '').join(' ')} ${b.properties.map(p => p.name).join(' ')}`.toLowerCase().includes(t)
    })
    const dir = sort.asc ? 1 : -1
    const byProx = (a: BoardBag, b: BoardBag) => ((a.daysToNext ?? 9999) - (b.daysToNext ?? 9999)) || ((b.daysDirty ?? -1) - (a.daysDirty ?? -1)) || cmp(houseName(a), houseName(b))
    const f: Record<SortK, (a: BoardBag, b: BoardBag) => number> = {
      casa: (a, b) => cmp(houseName(a), houseName(b)),
      maleta: (a, b) => cmp(a.units[0]?.code || a.code || a.name, b.units[0]?.code || b.code || b.name),
      prox: byProx,
      estado: (a, b) => (rowRank(a) - rowRank(b)) || byProx(a, b),
      sucia: (a, b) => ((a.daysDirty ?? -1) - (b.daysDirty ?? -1)) || cmp(houseName(a), houseName(b)),
    }
    // «Sin limpieza» siempre al final cuando se ordena por próxima limpieza
    return list.sort((a, b) => sort.k === 'prox' && (!a.nextCleaning !== !b.nextCleaning) ? (a.nextCleaning ? -1 : 1) : dir * f[sort.k](a, b))
  }, [board, stage, q, sort, fEstado, fWhen, fDias, fDiff])

  const filters = fEstado.length + fWhen.length + (fDias ? 1 : 0) + (fDiff ? 1 : 0) + (q.trim() ? 1 : 0)
  const clearAll = () => { setFEstado([]); setFWhen([]); setFDias(0); setFDiff(false); setQ('') }
  const toggle = <T,>(arr: T[], v: T, set: (a: T[]) => void) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const sortBy = (k: SortK) => setSort(p => p.k === k ? { k, asc: !p.asc } : { k, asc: true })
  const arrow = (k: SortK) => sort.k === k ? (sort.asc ? '▲' : '▼') : '⇅'

  const Th = ({ k, label, fk }: { k: SortK; label: string; fk?: string }) => (
    <span className="relative inline-flex items-center gap-1">
      <button onClick={() => sortBy(k)} className="uppercase font-bold tracking-wide" style={{ color: sort.k === k ? C.ink : C.muted }}>{label} <span style={{ fontSize: 9 }}>{arrow(k)}</span></button>
      {fk && <button onClick={() => setPop(pop === fk ? null : fk)} title="Filtrar"><ChevronDown className="w-3.5 h-3.5" style={{ color: (fk === 'estado' && fEstado.length) || (fk === 'when' && fWhen.length) || (fk === 'dias' && fDias) ? C.teal : C.muted }} /></button>}
      {pop === fk && fk && (
        <div className="absolute left-0 top-6 z-30 rounded-xl p-2 normal-case font-medium text-[13px] tracking-normal" style={{ background: 'white', border: `1px solid ${C.border}`, boxShadow: '0 12px 28px rgba(15,23,42,.18)', minWidth: 210 }}>
          {fk === 'estado' && <>
            {RANK_LABEL.map((l, i) => <label key={l} className="flex items-center gap-2 px-2 py-1.5"><input type="checkbox" checked={fEstado.includes(i)} onChange={() => toggle(fEstado, i, setFEstado)} />{l}</label>)}
            <label className="flex items-center gap-2 px-2 py-1.5"><input type="checkbox" checked={fDiff} onChange={() => setFDiff(v => !v)} />Con diferencias (−/+)</label>
          </>}
          {fk === 'when' && WHEN_OPTS.map(l => <label key={l} className="flex items-center gap-2 px-2 py-1.5"><input type="checkbox" checked={fWhen.includes(l)} onChange={() => toggle(fWhen, l, setFWhen)} />{l}</label>)}
          {fk === 'dias' && [0, 2, 3].map(n => <label key={n} className="flex items-center gap-2 px-2 py-1.5"><input type="radio" checked={fDias === n} onChange={() => setFDias(n)} />{n ? `Más de ${n} días` : 'Todas'}</label>)}
          <button onClick={() => { setFEstado([]); setFWhen([]); setFDias(0); setFDiff(false); setPop(null) }} className="px-2 py-1.5 text-[12px]" style={{ color: C.muted }}>Limpiar filtro</button>
        </div>
      )}
    </span>
  )

  return (
    <div className="space-y-3" onClick={() => { if (pop) setPop(null); if (menu) setMenu(null) }}>
      <div className="sticky top-12 md:top-0 z-20 -mx-4 px-4 md:-mx-8 md:px-8 pt-2 pb-2" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setStage(null)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: stage === null ? C.ink : 'white', color: stage === null ? 'white' : C.slate, border: `1px solid ${stage === null ? C.ink : C.border}` }}>Todas {totalUnits}</button>
          {STATE_ORDER.map(st => {
            const n = stageCount[st] || 0, on = stage === st
            return <button key={st} onClick={() => setStage(on ? null : st)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: on ? C.ink : 'white', color: on ? 'white' : C.slate, border: `1px solid ${on ? C.ink : C.border}`, opacity: n || on ? 1 : 0.5 }}>{n} {st === 'Dirty' ? 'Por lavar' : st}</button>
          })}
          <span className="hidden md:inline text-[11px] ml-auto" style={{ color: C.muted }}>{board.bags.length} casas · {s.totalBags} maletas · {s.openIncidents} incidentes</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 flex-1" style={{ background: 'white', border: `1px solid ${C.border}` }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar casa, cliente o código" className="w-full py-1.5 text-[12px] outline-none bg-transparent" />
          </div>
          <button onClick={() => setSheet(true)} className="md:hidden inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold" style={{ background: 'white', border: `1px solid ${C.border}`, color: C.slate }}><SlidersHorizontal className="w-3.5 h-3.5" />Ordenar / filtrar{filters ? ` · ${filters}` : ''}</button>
          {filters > 0 && <button onClick={clearAll} className="text-[11px] underline px-1" style={{ color: C.slate }}>quitar filtros</button>}
        </div>
        <div className={`hidden ${COLS} px-4 pt-2.5 text-[10px]`}>
          <Th k="casa" label="Casa" /><Th k="maleta" label="Maleta" /><Th k="prox" label="Próx. limpieza" fk="when" /><Th k="estado" label="Estado" fk="estado" /><Th k="sucia" label="Sucia hace" fk="dias" /><span />
        </div>
      </div>

      {s.withoutCode > 0 && <p className="text-[12px] px-1" style={{ color: C.amber }}>{s.withoutCode} casas sin código ({s.withoutCodeBags} maletas físicas por etiquetar). Ve a Etiquetas.</p>}

      <div className="space-y-2">
        {rows.map(b => <Row key={b.id} b={b} stage={stage} onOpen={onOpen} menu={menu} setMenu={setMenu} />)}
        {rows.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Ninguna casa coincide con los filtros.</p>}
      </div>

      {sheet && (
        <Sheet title="Ordenar y filtrar" onClose={() => setSheet(false)} footer={<button onClick={() => setSheet(false)} className="w-full rounded-xl py-3.5 text-[14px] font-medium text-white" style={{ background: C.ink }}>Ver {rows.length} {rows.length === 1 ? 'casa' : 'casas'}</button>}>
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Ordenar por</p>
          {([['prox', 'Próxima limpieza'], ['estado', 'Estado (orden del proceso)'], ['sucia', 'Días sucia'], ['casa', 'Casa (A–Z)']] as [SortK, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setSort(p => p.k === k ? { k, asc: !p.asc } : { k, asc: true })} className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] text-left" style={{ background: 'white', border: `1.5px solid ${sort.k === k ? C.ink : C.border}` }}>
              <ArrowUpDown className="w-4 h-4" style={{ color: C.muted }} />{l}<span className="ml-auto" style={{ color: C.muted }}>{sort.k === k ? (sort.asc ? '▲' : '▼') : ''}</span>
            </button>
          ))}
          <p className="text-[11px] font-bold uppercase tracking-wide mt-2" style={{ color: C.muted }}>Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {RANK_LABEL.map((l, i) => <button key={l} onClick={() => toggle(fEstado, i, setFEstado)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: fEstado.includes(i) ? C.ink : 'white', color: fEstado.includes(i) ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{l}</button>)}
            <button onClick={() => setFDiff(v => !v)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: fDiff ? C.ink : 'white', color: fDiff ? 'white' : C.slate, border: `1px solid ${C.border}` }}>Con diferencias</button>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wide mt-2" style={{ color: C.muted }}>Próxima limpieza</p>
          <div className="flex flex-wrap gap-1.5">{WHEN_OPTS.map(l => <button key={l} onClick={() => toggle(fWhen, l, setFWhen)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: fWhen.includes(l) ? C.ink : 'white', color: fWhen.includes(l) ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{l}</button>)}</div>
          <p className="text-[11px] font-bold uppercase tracking-wide mt-2" style={{ color: C.muted }}>Días sucia</p>
          <div className="flex gap-1.5">{[2, 3].map(n => <button key={n} onClick={() => setFDias(fDias === n ? 0 : n)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: fDias === n ? C.ink : 'white', color: fDias === n ? 'white' : C.slate, border: `1px solid ${C.border}` }}>+{n} d</button>)}</div>
        </Sheet>
      )}
    </div>
  )
}

function Row({ b, onOpen, stage, menu, setMenu }: { b: BoardBag; onOpen: (b: BoardBag, mode?: OpenMode) => void; stage: string | null; menu: string | null; setMenu: (id: string | null) => void }) {
  const all = unitsOf(b)
  const us = stage ? all.filter(c => c.stage === stage) : all
  const hidden = all.length - us.length
  const cl = clientName(b)
  const diff = diffOf(b)
  const act = nextAction(b)
  const open = menu === b.id
  const cap = 'text-[9px] font-bold uppercase tracking-wide mb-0.5 md:hidden'
  const diffEl = diff !== 0 ? <b style={{ color: diff < 0 ? C.red : C.green }}> {diff > 0 ? '+' : '−'}{Math.abs(diff)}</b> : null
  return (
    <div className={`relative w-full text-left rounded-xl px-3.5 py-2.5 ${COLS}`} onClick={e => e.stopPropagation()}
      style={{ background: 'white', border: `1px solid ${C.border}`, borderLeft: `4px solid ${b.risk === 'red' ? C.red : b.risk === 'amber' ? C.amber : C.border}` }}>
      <button onClick={() => onOpen(b)} className="text-left min-w-0 md:contents">
        <div className="flex items-start gap-2 min-w-0 md:block">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{houseName(b)}</p>
            <p className="text-[11px] truncate" style={{ color: C.muted }}>
              {all.length} {all.length === 1 ? 'maleta' : 'maletas'}{hidden > 0 ? ` (${hidden} en otra etapa)` : ''}{cl ? ` · ${cl}` : ''}
              {b.openIncidents > 0 ? <span style={{ color: C.red }}> · {b.openIncidents} incid.</span> : null}
            </p>
          </div>
          <div className="text-right md:hidden">
            <p className={cap} style={{ color: C.muted }}>Próx. limpieza</p>
            <p className="text-[13px] font-extrabold" style={{ color: whenColor(b) }}>{whenOf(b)}</p>
            <p className="text-[11px]" style={{ color: C.muted }}>{b.daysDirty != null ? `sucia hace ${b.daysDirty} d` : ''}</p>
          </div>
        </div>
        <div className="mt-2 md:mt-0 space-y-1 md:contents">
          <div className="hidden md:block space-y-1">
            {us.map(c => { const col = STATE_COLOR[c.stage] || C.muted; return (
              <div key={c.code} className="flex items-center h-[26px]"><span className="font-mono text-[11px] font-bold rounded-md px-1.5 py-0.5" style={{ background: col + '1F', border: `1px solid ${col}66`, color: C.ink }}>{c.code}</span></div>
            ) })}
          </div>
        </div>
        <p className="hidden md:block text-[13px] font-bold" style={{ color: whenColor(b) }}>{whenOf(b)}</p>
        <div className="md:space-y-1">
          {us.map((c, i) => <div key={c.code} className="flex items-center md:h-[26px] text-[12px]" style={{ color: C.slate }}><span className="md:hidden font-mono text-[10px] mr-2" style={{ color: C.muted }}>{c.code}</span>{c.label}{i === 0 ? diffEl : null}</div>)}
        </div>
        <p className="hidden md:block text-[13px]" style={{ color: C.slate }}>{b.daysDirty != null ? `${b.daysDirty} d` : '—'}</p>
      </button>
      <div className="relative flex justify-end mt-2 md:mt-0">
        <div className="inline-flex rounded-xl overflow-hidden text-[12.5px] font-semibold" style={act.mode === 'info' ? { background: 'white', color: C.ink, border: `1px solid ${C.border}` } : { background: C.ink, color: 'white' }}>
          <button className="px-3.5 py-2" onClick={() => onOpen(b, act.mode)}>{act.label}</button>
          <button className="px-2.5 py-2" style={{ borderLeft: `1px solid ${act.mode === 'info' ? C.border : '#334155'}` }} onClick={() => setMenu(open ? null : b.id)} aria-label="Más opciones"><ChevronDown className="w-4 h-4" /></button>
        </div>
        {open && (
          <div className="absolute right-0 top-11 z-30 rounded-xl p-1.5 text-[13px] font-medium" style={{ background: 'white', border: `1px solid ${C.border}`, boxShadow: '0 12px 28px rgba(15,23,42,.18)', minWidth: 250 }}>
            {menuOf(b).map((m, i) => <button key={m.label} onClick={() => { setMenu(null); onOpen(b, m.mode) }} className="block w-full text-left px-3 py-2 rounded-lg" style={i === 0 && act.mode !== 'info' ? { background: '#F1F5F9', fontWeight: 600 } : undefined}>{m.label}</button>)}
          </div>
        )}
      </div>
    </div>
  )
}
