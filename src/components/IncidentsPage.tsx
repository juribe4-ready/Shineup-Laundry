import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'
import type { ConfigInfo, Incident, Me } from '../lib/types'
import { Btn, C, Card, Field, fmtDateTime, inputStyle, Pill, Sheet, Spinner } from './ui'

type GroupBy = 'maleta' | 'casa' | 'tipo'
const typeColor = (t: string | null) => (t === 'Sobrante' ? C.green : t === 'Faltante' || t === 'Dañado' || t === 'Sucio / Manchado' ? C.red : C.slate)

export default function IncidentsPage({ me, onMsg }: { me: Me; cfg: ConfigInfo | null; onMsg: (m: string, err?: boolean) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [list, setList] = useState<Incident[] | null>(null)
  const [sel, setSel] = useState<Incident | null>(null)
  const [resolve, setResolve] = useState<Incident[] | null>(null)
  const [by, setBy] = useState<GroupBy>('maleta')
  const load = () => { setList(null); apiGet<{ incidents: Incident[] }>('incidents', { status }).then(d => setList(d.incidents)).catch(e => { onMsg(e.message, true); setList([]) }) }
  useEffect(load, [status]) // eslint-disable-line

  const groups = (() => {
    const m = new Map<string, { key: string; title: string; sub: string; items: Incident[] }>()
    for (const i of list || []) {
      const key = by === 'maleta' ? (i.bagId || i.bagName || '—') : by === 'casa' ? (i.propertyName || '—') : (i.type || 'Otro')
      const title = by === 'maleta' ? (i.bagName || '—') : by === 'casa' ? (i.propertyName || 'Sin casa') : (i.type || 'Otro')
      if (!m.has(key)) m.set(key, { key, title, sub: '', items: [] })
      m.get(key)!.items.push(i)
    }
    for (const g of m.values()) {
      const props = [...new Set(g.items.map(i => i.propertyName).filter(Boolean))] as string[]
      const bags = [...new Set(g.items.map(i => i.bagName).filter(Boolean))] as string[]
      g.sub = by === 'maleta' ? props.join(' · ') : by === 'casa' ? bags.join(' · ') : ''
    }
    return [...m.values()].sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title, 'es'))
  })()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-2 gap-2 flex-1">
          {(['open', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className="py-2 rounded-xl text-[13px] font-medium" style={{ background: status === s ? C.ink : 'white', color: status === s ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{s === 'open' ? `Abiertos${status === 'open' && list ? ` ${list.length}` : ''}` : 'Cerrados'}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: C.slate }}>
        Agrupar por:
        {(['maleta', 'casa', 'tipo'] as GroupBy[]).map(g => <button key={g} onClick={() => setBy(g)} className="rounded-full px-3 py-1 font-semibold capitalize" style={{ background: by === g ? C.ink : 'white', color: by === g ? 'white' : C.slate, border: `1px solid ${by === g ? C.ink : C.border}` }}>{g}</button>)}
      </div>
      {list === null ? <div className="flex justify-center py-8"><Spinner /></div> : groups.map(g => (
        <Card key={g.key}>
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <span className="text-[15px] font-semibold" style={{ color: C.ink }}>{g.title}</span>
            {g.sub && <span className="text-[12px]" style={{ color: C.muted }}>{g.sub}</span>}
            <span className="ml-auto text-[11px]" style={{ color: C.muted }}>{g.items.length} {g.items.length === 1 ? 'incidente' : 'incidentes'}</span>
          </div>
          {g.items.map(i => (
            <div key={i.id} className="flex items-center gap-2 py-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <button className="flex-1 text-left min-w-0" onClick={() => setSel(i)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill text={i.type || 'Incidente'} color={typeColor(i.type)} />
                  <span className="text-[13.5px] font-semibold" style={{ color: C.ink }}>{i.item || 'maleta'}{i.qty ? ` ×${i.qty}` : ''}</span>
                </div>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: C.muted }}>{by === 'tipo' ? `${i.bagName || '—'}${i.propertyName ? ` · ${i.propertyName}` : ''} · ` : ''}{fmtDateTime(i.created)}{i.owner ? ` · ${i.owner}` : ''}</p>
              </button>
              {status === 'open' && <button onClick={() => setResolve([i])} className="rounded-xl px-3 py-1.5 text-[12px] font-semibold" style={{ background: 'white', border: `1px solid ${C.border}`, color: C.ink }}>Resolver</button>}
            </div>
          ))}
          {status === 'open' && g.items.length > 1 && (
            <div className="flex justify-end pt-2"><button onClick={() => setResolve(g.items)} className="rounded-xl px-3.5 py-2 text-[12px] font-semibold text-white" style={{ background: C.ink }}>Resolver los {g.items.length} juntos</button></div>
          )}
        </Card>
      ))}
      {list && list.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Sin incidentes.</p>}
      {sel && <IncidentSheet inc={sel} me={me} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); onMsg('Incidente actualizado ✓') }} onError={m => onMsg(m, true)} />}
      {resolve && <ResolveSheet items={resolve} onClose={() => setResolve(null)} onDone={m => { setResolve(null); load(); onMsg(m) }} onError={m => onMsg(m, true)} />}
    </div>
  )
}

const OUTCOMES = ['Reemplazado', 'Apareció', 'Descartado', 'Otro']
function ResolveSheet({ items, onClose, onDone, onError }: { items: Incident[]; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [outcome, setOutcome] = useState('Reemplazado')
  const [note, setNote] = useState('')
  const [add, setAdd] = useState(true)
  const [busy, setBusy] = useState(false)
  // qué ajustaría el conteo de la maleta: faltante repuesto/apareció → suma · sobrante descartado → resta
  const adjustable = items.filter(i => (i.type === 'Faltante' && (outcome === 'Reemplazado' || outcome === 'Apareció')) || (i.type === 'Sobrante' && outcome === 'Descartado'))
  const canSave = outcome !== 'Otro' || note.trim().length > 0
  const go = async () => {
    setBusy(true)
    try {
      const closeComment = `${outcome}${note.trim() ? ' — ' + note.trim() : ''}`
      for (const i of items) await apiPost('updateIncident', { id: i.id, status: 'Closed', closeComment, addToBag: add && adjustable.some(a => a.id === i.id) })
      onDone(items.length === 1 ? 'Incidente resuelto ✓' : `${items.length} incidentes resueltos ✓`)
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet title={items.length === 1 ? `Resolver · ${items[0].type || 'Incidente'} ${items[0].item || ''}${items[0].qty ? ` ×${items[0].qty}` : ''}` : `Resolver ${items.length} incidentes`} onClose={onClose}
      footer={<Btn color={C.teal} disabled={busy || !canSave} onClick={go}>Resolver</Btn>}>
      <Field label="Qué pasó">
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map(o => <button key={o} onClick={() => setOutcome(o)} className="px-3 py-2 rounded-xl text-[12px] font-medium" style={{ background: outcome === o ? C.ink : 'white', color: outcome === o ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{o}</button>)}
        </div>
      </Field>
      {adjustable.length > 0 && (
        <label className="flex items-start gap-2 rounded-xl p-3 text-[13px] font-medium" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' }}>
          <input type="checkbox" checked={add} onChange={e => setAdd(e.target.checked)} className="mt-0.5" />
          <span>{adjustable.map(i => `${i.type === 'Faltante' ? 'Sumar' : 'Restar'} ${i.qty || 1} ${i.item}`).join(' · ')} {adjustable.length === 1 ? 'a la maleta' : 'a sus maletas'}<br /><span className="font-normal text-[12px]">Actualiza el conteo de lo que hay.</span></span>
        </label>
      )}
      <Field label={`Nota${outcome === 'Otro' ? ' (obligatoria)' : ' (opcional)'}`}><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={inputStyle} placeholder="Ej. compré 1 en Walmart" /></Field>
    </Sheet>
  )
}

function IncidentSheet({ inc, me, onClose, onSaved, onError }: { inc: Incident; me: Me; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [status, setStatus] = useState(inc.status)
  const [closeComment, setCloseComment] = useState(inc.closeComment || '')
  const [owner, setOwner] = useState(inc.ownerId || '')
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
  useEffect(() => { if (me.permissions.admin) apiGet<{ staff: { id: string; name: string }[] }>('staff').then(d => setStaff(d.staff)).catch(() => {}) }, []) // eslint-disable-line
  const [busy, setBusy] = useState(false)
  const canClose = status !== 'Closed' || closeComment.trim().length > 0
  const save = async () => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { id: inc.id, status, closeComment }
      if (me.permissions.admin && owner !== (inc.ownerId || '')) body.ownerId = owner
      await apiPost('updateIncident', body)
      onSaved()
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet title={`${inc.type || 'Incidente'} · ${inc.item || inc.bagName || ''}`} onClose={onClose}
      footer={<Btn color={C.teal} disabled={busy || !canClose} onClick={save}>Guardar</Btn>}>
      <p className="text-[13px]" style={{ color: C.slate }}>{inc.comment || 'Sin comentario.'}</p>
      {inc.media && <a href={inc.media} target="_blank" rel="noreferrer"><img src={inc.media} alt="" className="w-24 h-24 rounded-xl object-cover" /></a>}
      <Field label="Estado">
        <div className="grid grid-cols-3 gap-2">
          {(['Reported', 'In Progress', 'Closed'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} className="py-2 rounded-xl text-[12px] font-medium" style={{ background: status === s ? C.ink : 'white', color: status === s ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{s === 'Reported' ? 'Reportado' : s === 'In Progress' ? 'En curso' : 'Cerrado'}</button>
          ))}
        </div>
      </Field>
      {me.permissions.admin ? (
        <Field label="Asignado a (lo define un manager)">
          <select value={owner} onChange={e => setOwner(e.target.value)} style={inputStyle}>
            <option value="">Sin asignar</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      ) : <p className="text-[12px]" style={{ color: C.muted }}>Asignado a: {inc.owner || 'sin asignar'}</p>}
      <Field label={`Qué se hizo para resolverlo${status === 'Closed' ? ' (obligatorio para cerrar)' : ''}`}><textarea value={closeComment} onChange={e => setCloseComment(e.target.value)} rows={2} style={inputStyle} /></Field>
    </Sheet>
  )
}
