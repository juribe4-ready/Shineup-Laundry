import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'
import type { ConfigInfo, Incident, Me } from '../lib/types'
import { Btn, C, Card, Field, fmtDateTime, inputStyle, Pill, Sheet, Spinner } from './ui'

export default function IncidentsPage({ me, onMsg }: { me: Me; cfg: ConfigInfo | null; onMsg: (m: string, err?: boolean) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [list, setList] = useState<Incident[] | null>(null)
  const [sel, setSel] = useState<Incident | null>(null)
  const load = () => { setList(null); apiGet<{ incidents: Incident[] }>('incidents', { status }).then(d => setList(d.incidents)).catch(e => { onMsg(e.message, true); setList([]) }) }
  useEffect(load, [status]) // eslint-disable-line

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(['open', 'closed'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} className="py-2 rounded-xl text-[13px] font-medium" style={{ background: status === s ? C.ink : 'white', color: status === s ? 'white' : C.slate, border: `1px solid ${C.border}` }}>{s === 'open' ? 'Abiertos' : 'Cerrados'}</button>
        ))}
      </div>
      {list === null ? <div className="flex justify-center py-8"><Spinner /></div> : list.map(i => (
        <Card key={i.id}>
          <button className="w-full text-left" onClick={() => setSel(i)}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold flex-1" style={{ color: C.ink }}>{i.type || 'Incidente'} · {i.item || 'maleta'}{i.qty ? ` ×${i.qty}` : ''}</span>
              <Pill text={i.status === 'Reported' ? 'Reportado' : i.status === 'In Progress' ? 'En curso' : 'Cerrado'} color={i.status === 'Closed' ? C.green : i.status === 'In Progress' ? C.blue : C.amber} />
            </div>
            <p className="text-[12px] mt-1" style={{ color: C.slate }}>{i.bagName || '—'} · {fmtDateTime(i.created)}</p>
            <p className="text-[11px]" style={{ color: C.muted }}>Asignado a: {i.owner || 'sin asignar'}</p>
          </button>
        </Card>
      ))}
      {list && list.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: C.muted }}>Sin incidentes.</p>}
      {sel && <IncidentSheet inc={sel} me={me} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); onMsg('Incidente actualizado ✓') }} onError={m => onMsg(m, true)} />}
    </div>
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
