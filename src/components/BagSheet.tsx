import { InventoryTable } from './InventoryTable'
import { useEffect, useState } from 'react'
import { Camera, AlertTriangle, Droplets, ClipboardCheck, PackageCheck, PackageOpen } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import type { BoardBag, Counts, Incident } from '../lib/types'
import { Btn, C, Dot, Field, fmtDate, fmtDateTime, inputStyle, LEVEL_COLOR, Pill, PhotoPicker, SEMAFORO_COLOR, Sheet, Spinner, STATE_COLOR, Stepper } from './ui'

interface Props {
  bag: BoardBag
  items: string[]
  unit?: number | null
  canOperate: boolean
  onClose: () => void
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}

type Mode = 'info' | 'inspect' | 'wash' | 'finish' | 'incident'

const expectedOf = (bag: BoardBag): Counts => {
  const exp: Counts = { ...bag.standard }
  for (const s of bag.cycle?.short || []) if (exp[s.item] != null) exp[s.item] = Math.max(0, exp[s.item] - s.qty)
  return exp
}

export default function BagSheet({ bag, items, unit, canOperate, onClose, onChanged, onError }: Props) {
  const [mode, setMode] = useState<Mode>('info')
  const [incidents, setIncidents] = useState<Incident[] | null>(null)
  const [liveCyc, setLiveCyc] = useState<BoardBag['cycle'] | null>(null)
  const [cycErr, setCycErr] = useState('')

  useEffect(() => {
    apiGet<{ incidents: Incident[] }>('incidents', { status: 'open' })
      .then(d => setIncidents(d.incidents.filter(i => i.bagId === bag.id)))
      .catch(() => setIncidents([]))
  }, [bag.id])

  // Si el tablero no trajo el ciclo de esta maleta, se lee directo (antes los botones de lavado no hacían nada)
  useEffect(() => {
    if (bag.cycle) return
    apiGet<{ cycle: BoardBag['cycle'] | null }>('cycle', { id: bag.id }).then(d => { if (d.cycle) setLiveCyc(d.cycle); else setCycErr('Esta maleta no tiene ciclo registrado en Airtable (campo Last Cycle vacío).') }).catch(e => setCycErr(e.message || 'No se pudo leer el ciclo'))
  }, [bag.id])
  const cyc = bag.cycle || liveCyc
  if (!bag.cycle && liveCyc) bag = { ...bag, cycle: liveCyc }
  const title = `${bag.codeLabel || bag.code || '(sin código)'} · ${bag.name}`

  if (['inspect', 'wash', 'finish'].includes(mode) && !cyc) return (
    <Sheet title={title} onClose={() => setMode('info')} footer={<Btn ghost color={C.slate} onClick={() => setMode('info')}>Volver</Btn>}>
      <div className="rounded-xl p-3 text-[13px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}><b>No puedo abrir este paso.</b><br />{cycErr || 'Leyendo el ciclo de la maleta…'}<br /><span style={{ fontSize: 11 }}>Debug · maleta {bag.id} · estado {bag.state || '—'} · lastCycleId {String((bag as any).lastCycleId || '—')}</span></div>
    </Sheet>
  )
  if (mode === 'inspect' && cyc) return <InspectForm bag={bag} onClose={() => setMode('info')} onDone={m => { onChanged(m) }} onError={onError} />
  if (mode === 'wash' && cyc) return <WashStartForm bag={bag} onClose={() => setMode('info')} onDone={m => { onChanged(m) }} onError={onError} />
  if (mode === 'finish' && cyc) return <FinishForm bag={bag} onClose={() => setMode('info')} onDone={m => { onChanged(m) }} onError={onError} />
  if (mode === 'incident') return <IncidentForm bag={bag} items={items} unit={unit ?? null} onClose={() => setMode('info')} onDone={m => { onChanged(m) }} onError={onError} />

  const stateColor = STATE_COLOR[bag.state || 'Sin estado']
  return (
    <Sheet title={title} onClose={onClose}
      footer={canOperate ? (
        <>
          {bag.state === 'Dirty' && cyc && bag.units.some(u => u.where === 'transito') && (
            <Btn ghost color={C.teal} onClick={async () => {
              try { await apiPost('receive', unit && bag.units.find(u => u.n === unit)?.where === 'transito' ? { cycleId: cyc.id, unit } : { cycleId: cyc.id, all: true }); onChanged('Recepción confirmada ✓') }
              catch (e: any) { onError(e.message) }
            }}><PackageOpen className="w-4 h-4" /> {unit && bag.units.find(u => u.n === unit)?.where === 'transito' ? `Confirmar que llegó la #${unit}` : 'Confirmar que llegaron (opcional)'}</Btn>
          )}
          {bag.state === 'Dirty' && <Btn color={C.violet} onClick={() => setMode('inspect')}><ClipboardCheck className="w-4 h-4" /> Inspeccionar (abrir y contar)</Btn>}
          {bag.state === 'Inspected' && <Btn color={C.blue} onClick={() => setMode('wash')}><Droplets className="w-4 h-4" /> Iniciar lavado</Btn>}
          {bag.state === 'Washing' && <Btn color={C.green} onClick={() => setMode('finish')}><PackageCheck className="w-4 h-4" /> Terminar y marcar Clean</Btn>}
          {bag.state === 'In Use' && cyc && !(cyc.unitsBack || []).length && (
            <Btn ghost color={C.slate} onClick={async () => {
              if (!window.confirm(`¿Deshacer la carga de ${bag.name}? Vuelve a Clean (todas sus maletas).`)) return
              try { await apiPost('undoLoad', { bagId: bag.id }); onChanged('Carga deshecha ✓ (vuelve a Clean)') }
              catch (e: any) { onError(e.message) }
            }}>↩ Deshacer carga de turno</Btn>
          )}
          <Btn ghost color={C.red} onClick={() => setMode('incident')}><AlertTriangle className="w-4 h-4" /> Reportar problema</Btn>
        </>
      ) : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill text={bag.state || 'Sin estado'} color={stateColor} solid />
        <Pill text={`Semáforo ${bag.semaforo}`} color={SEMAFORO_COLOR[bag.semaforo]} />
        {bag.qty > 1 && <Pill text={`${bag.qty} maletas${unit ? ` · vista #${unit}` : ''}`} color={C.slate} />}
        {bag.daysDirty != null && <Pill text={`Sucia hace ${bag.daysDirty} d`} color={LEVEL_COLOR[bag.dirtyLevel]} />}
      </div>

      {bag.units.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Maletas físicas</p>
          {bag.units.map(u => (
            <div key={u.n} className="flex items-center gap-2 py-1" style={unit === u.n ? { background: '#ECFEFF', borderRadius: 8, padding: '4px 6px' } : undefined}>
              <Dot color={u.level === 'red' ? C.red : u.level === 'amber' ? C.amber : u.where === 'casa' ? C.slate : C.green} />
              <span className="text-[12px] font-mono font-semibold" style={{ color: C.ink }}>{u.code || `#${u.n}`}</span>
              <span className="text-[12px] flex-1" style={{ color: C.slate }}>{u.label}</span>
              {u.days != null && u.days > 0 && <span className="text-[11px] font-semibold" style={{ color: u.level === 'red' ? C.red : u.level === 'amber' ? C.amber : C.muted }}>{u.days} d</span>}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: C.muted }}>Propiedades</p>
        <p className="text-[13px] font-semibold" style={{ color: C.ink }}>{bag.properties.map(p => p.name).join(' · ') || '—'}</p>
        {bag.nextCleaning && (
          <p className="text-[12px] font-semibold mt-1.5" style={{ color: LEVEL_COLOR[bag.risk] }}>
            Próxima limpieza: {fmtDate(bag.nextCleaning.date)} ({bag.daysToNext === 0 ? 'hoy' : `en ${bag.daysToNext} d`}) · {bag.nextCleaning.propertyName}
          </p>
        )}
      </div>

      {cyc && (cyc.condition !== 'Normal' && cyc.condition !== 'Bueno' || cyc.tags.length > 0 || !!cyc.cleanerNote ? (
        <div className="rounded-xl p-3" style={{ background: '#FEF3C7', border: '1.5px solid #FCD34D' }}>
          <p className="text-[12px] font-semibold mb-1" style={{ color: '#92400E' }}>⚠ Condición: {cyc.condition}{cyc.special ? ' · tratamiento especial' : ''}</p>
          {cyc.tags.length > 0 && <p className="text-[12px] font-semibold" style={{ color: '#92400E' }}>{cyc.tags.join(' · ')}</p>}
          {cyc.cleanerNote && <p className="text-[12px] mt-1" style={{ color: '#92400E' }}>“{cyc.cleanerNote}” — {cyc.declaredBy}</p>}
        </div>
      ) : (
        <p className="text-[12px] px-1" style={{ color: C.slate }}>Condición: <b style={{ color: C.ink }}>{cyc.condition}</b>{cyc.special ? ' · marcada como especial' : ''}</p>
      ))}

      {cyc && cyc.short.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: C.muted }}>Piezas que el cleaner NO envía sucias</p>
          {cyc.short.map(s => <p key={s.item} className="text-[13px] font-semibold" style={{ color: C.ink }}>{s.item} ×{s.qty}{s.kind === 'left' ? ' — quedó limpio en la casa' : s.kind === 'clean' ? ' — regresa limpio' : ''}{s.reason ? ` — ${s.reason}` : ''}</p>)}
        </div>
      )}

      <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
        <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Dónde está cada pieza</p>
        <InventoryTable rows={bag.inventory.rows} totals={bag.inventory.totals} compact />
      </div>

      {cyc && (
        <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Ciclo actual</p>
          <div className="space-y-1 text-[12px]" style={{ color: C.slate }}>
            {cyc.bagsOut != null && <p>Maletas: llevadas <b>{cyc.bagsOut}</b> · devueltas <b>{cyc.bagsBack ?? '—'}</b>{cyc.unitsBack.length > 0 && ` (${cyc.unitsBack.map(u => `#${u.unit} ${u.status === 'dirty' ? 'sucia' : u.status === 'clean' ? 'limpia' : 'se quedó en la casa'}`).join(', ')})`}</p>}
            <p>Dirty: <b>{fmtDateTime(cyc.dirtyAt)}</b> {cyc.declaredBy ? `· declaró ${cyc.declaredBy}` : ''}</p>
            {cyc.inspectedAt && <p>Inspeccionada: <b>{fmtDateTime(cyc.inspectedAt)}</b> · {cyc.inspectedBy} · {cyc.endorsement}</p>}
            {cyc.washStart && <p>Lavado: <b>{fmtDateTime(cyc.washStart)}</b> → <b>{fmtDateTime(cyc.washEnd)}</b> · {cyc.washedBy} · {cyc.washPlace}</p>}
            {cyc.readyAt && <p>Lista: <b>{fmtDateTime(cyc.readyAt)}</b></p>}
            {cyc.loadedAt && <p>Cargada en turno: <b>{fmtDateTime(cyc.loadedAt)}</b></p>}
            {cyc.openedAt && <p>Abierta en propiedad: <b>{fmtDateTime(cyc.openedAt)}</b></p>}
          </div>
          {cyc.log.some(l => l.photos?.length) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {cyc.log.flatMap(l => l.photos || []).map(u => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-14 h-14 rounded-xl object-cover" /></a>)}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
        <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Incidentes abiertos</p>
        {incidents === null ? <Spinner size={16} /> : incidents.length === 0 ? <p className="text-[12px]" style={{ color: C.muted }}>Ninguno 🎉</p> : incidents.map(i => (
          <div key={i.id} className="flex items-center gap-2 py-1">
            <Dot color={i.type === 'Faltante' ? C.amber : i.type === 'Dañado' || i.type === 'Sucio / Manchado' ? C.red : C.slate} />
            <span className="text-[12px] font-semibold flex-1" style={{ color: C.ink }}>{i.type} · {i.item || 'maleta'}{i.qty ? ` ×${i.qty}` : ''}</span>
            <span className="text-[10px]" style={{ color: C.muted }}>{i.owner || 'sin responsable'}</span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ─── Inspección: abrir la maleta y contar ───────────────────────────────────
function InspectForm({ bag, onClose, onDone, onError }: { bag: BoardBag; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const cyc = bag.cycle!
  const expected = expectedOf(bag)
  const [counts, setCounts] = useState<Counts>({ ...expected })
  const [damaged, setDamaged] = useState<Counts>({})
  const [stained, setStained] = useState<Counts>({})
  const [flagOpen, setFlagOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [noPhotoOk, setNoPhotoOk] = useState(false)
  const [reportMissing, setReportMissing] = useState(false)
  const [busy, setBusy] = useState(false)

  const diffs = Object.keys(expected).filter(k => (counts[k] ?? 0) !== expected[k])
  const hasFlags = Object.values(damaged).some(n => n > 0) || Object.values(stained).some(n => n > 0)
  const needPhoto = hasFlags && !photos.length && !noPhotoOk

  const send = async (confirmOnly: boolean) => {
    setBusy(true)
    try {
      await apiPost('inspect', { cycleId: cyc.id, counts: confirmOnly ? expected : counts, damaged: confirmOnly ? {} : damaged, stained: confirmOnly ? {} : stained, note, photos, reportMissing })
      onDone(confirmOnly ? 'Inspección confirmada ✓' : 'Inspección guardada (incidentes creados si hubo diferencias)')
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }

  return (
    <Sheet title={`Inspección · ${bag.code || bag.name}`} onClose={onClose}
      footer={<>
        <Btn color={C.green} disabled={busy || diffs.length > 0 || hasFlags} onClick={() => send(true)}>✅ Todo conforme (coincide con lo esperado)</Btn>
        <Btn color={C.violet} disabled={busy || (diffs.length === 0 && !hasFlags) || needPhoto} onClick={() => send(false)}>Guardar corrección ({diffs.length + Object.values(damaged).filter(n => n > 0).length + Object.values(stained).filter(n => n > 0).length} diferencias)</Btn>
      </>}>
      {cyc.special && (cyc.condition === 'Malo' || cyc.tags.length > 0 || !!cyc.cleanerNote) && (
        <div className="rounded-xl p-3" style={{ background: '#FEF3C7', border: '1.5px solid #FCD34D' }}>
          <p className="text-[12px] font-semibold" style={{ color: '#92400E' }}>⚠ El cleaner reportó condición {cyc.condition}: {cyc.tags.join(', ') || 'ver nota'}</p>
          {cyc.cleanerNote && <p className="text-[12px] mt-1" style={{ color: '#92400E' }}>“{cyc.cleanerNote}”</p>}
        </div>
      )}
      {cyc.stayedUnits > 0 && (
        <div className="rounded-xl p-3" style={{ background: '#E0F2FE', border: '1.5px solid #7DD3FC' }}>
          <p className="text-[12px] font-medium" style={{ color: '#075985' }}>El cleaner dejó {cyc.stayedUnits} maleta(s) en la casa: llegaron {cyc.bagsBack} de {cyc.bagsOut}. Los faltantes de piezas se consideran explicados y no crean incidente.</p>
          <label className="flex items-center gap-2 mt-1.5 text-[12px] font-semibold" style={{ color: '#075985' }}><input type="checkbox" checked={reportMissing} onChange={e => setReportMissing(e.target.checked)} /> Reportar faltantes como incidente igual</label>
        </div>
      )}
      {cyc.short.length > 0 && <p className="text-[12px] font-semibold px-1" style={{ color: C.slate }}>Ya descontado lo que el cleaner dejó limpio en la propiedad.</p>}
      <p className="text-[12px] px-1" style={{ color: C.slate }}>Viene precargado con lo que <b>debería</b> traer. Cambia solo lo que difiera.</p>
      {Object.keys(expected).map(it => {
        const diff = (counts[it] ?? 0) - expected[it]
        return (
          <div key={it} className="rounded-xl p-3" style={{ background: 'white', border: `1.5px solid ${diff !== 0 ? C.amber : C.border}` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium" style={{ color: C.ink }}>{it}</p>
                <p className="text-[11px]" style={{ color: diff < 0 ? C.red : diff > 0 ? C.amber : C.muted }}>
                  Esperado {expected[it]}{diff !== 0 ? ` · ${diff < 0 ? `faltan ${-diff}` : `sobran ${diff}`}` : ''}
                </p>
              </div>
              <Stepper value={counts[it] ?? 0} onChange={n => setCounts(c => ({ ...c, [it]: n }))} color={diff !== 0 ? C.amber : C.ink} />
            </div>
            <button onClick={() => setFlagOpen(flagOpen === it ? null : it)} className="text-[11px] font-medium mt-2" style={{ color: C.red }}>
              {(damaged[it] || stained[it]) ? `Dañado ${damaged[it] || 0} · Manchado ${stained[it] || 0}` : '＋ marcar dañado / manchado'}
            </button>
            {flagOpen === it && (
              <div className="flex gap-6 mt-2">
                <div><p className="text-[10px] font-medium mb-1" style={{ color: C.muted }}>DAÑADO</p><Stepper value={damaged[it] || 0} onChange={n => setDamaged(d => ({ ...d, [it]: n }))} color={C.red} max={counts[it] ?? 99} /></div>
                <div><p className="text-[10px] font-medium mb-1" style={{ color: C.muted }}>MANCHADO</p><Stepper value={stained[it] || 0} onChange={n => setStained(d => ({ ...d, [it]: n }))} color={C.red} max={counts[it] ?? 99} /></div>
              </div>
            )}
          </div>
        )
      })}
      <Field label="Nota (opcional)"><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={inputStyle} placeholder="Ej. olor fuerte, cabello en las sábanas…" /></Field>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: C.muted }}><Camera className="inline w-3 h-3" /> Fotos {hasFlags ? '(obligatoria por daño/mancha)' : '(opcional)'}</p>
        <PhotoPicker tag={`insp_${bag.code || bag.id}`} urls={photos} onChange={setPhotos} required={hasFlags} />
        {hasFlags && !photos.length && (
          <label className="flex items-center gap-2 mt-2 text-[12px] font-semibold" style={{ color: C.slate }}>
            <input type="checkbox" checked={noPhotoOk} onChange={e => setNoPhotoOk(e.target.checked)} /> No hay señal: continuar sin foto
          </label>
        )}
      </div>
    </Sheet>
  )
}

// ─── Iniciar lavado ──────────────────────────────────────────────────────────
function WashStartForm({ bag, onClose, onDone, onError }: { bag: BoardBag; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const cyc = bag.cycle!
  const [place, setPlace] = useState<'Propia' | 'Externa'>('Propia')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await apiPost('startWash', { cycleId: cyc.id, place })
      onDone('Lavado iniciado')
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet title={`Iniciar lavado · ${bag.code || bag.name}`} onClose={onClose}
      footer={<Btn color={C.blue} disabled={busy} onClick={go}><Droplets className="w-4 h-4" /> Iniciar lavado ahora</Btn>}>
      {cyc.special && (cyc.condition === 'Malo' || cyc.tags.length > 0 || !!cyc.cleanerNote) && <div className="rounded-xl p-3 text-[12px] font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>⚠ Tratamiento especial: {cyc.tags.join(', ') || cyc.condition}</div>}
      <Field label="¿Dónde se lava?">
        <div className="grid grid-cols-2 gap-2">
          {(['Propia', 'Externa'] as const).map(p => (
            <button key={p} onClick={() => setPlace(p)} className="py-3 rounded-xl font-medium text-[14px]"
              style={{ background: place === p ? C.blue : 'white', color: place === p ? 'white' : C.slate, border: `1.5px solid ${place === p ? C.blue : C.border}` }}>{p === 'Propia' ? '🏠 Propia' : '🚚 Externa'}</button>
          ))}
        </div>
      </Field>
      <p className="text-[12px] px-1" style={{ color: C.slate }}>Se guarda automáticamente la hora de inicio y quién la inició.</p>
    </Sheet>
  )
}

// ─── Terminar lavado → LISTA ─────────────────────────────────────────────────
function FinishForm({ bag, onClose, onDone, onError }: { bag: BoardBag; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const cyc = bag.cycle!
  const base: Counts = cyc.counted?.counts || cyc.counted?.expected || bag.standard
  const [counts, setCounts] = useState<Counts>({ ...base })
  const [discarded, setDiscarded] = useState<Counts>({})
  const [added] = useState<Counts>({})
  const [suggest, setSuggest] = useState<{ id: string; item: string; type: string; qty: number | null }[] | null>(null)
  const [rewash, setRewash] = useState(false)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const lost = Object.keys(base).filter(k => (counts[k] ?? 0) < (base[k] - (discarded[k] || 0)))
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiPost<{ incidentsCreated: number; suggestClose?: { id: string; item: string; type: string; qty: number | null }[] }>('finishWash', { cycleId: cyc.id, bagId: bag.id, counts, discarded, added, rewash, note, photos })
      if (r.suggestClose && r.suggestClose.length) { setSuggest(r.suggestClose); return }
      onDone(r.incidentsCreated ? `Clean ✓ (se creó ${r.incidentsCreated} incidente por faltante)` : 'Maleta Clean ✓')
    } catch (e: any) { setErr(e.message || 'Error al marcar Clean'); onError(e.message) } finally { setBusy(false) }
  }
  const closeAll = async () => {
    setBusy(true)
    try {
      for (const i of suggest || []) await apiPost('updateIncident', { id: i.id, status: 'Closed', closeComment: 'Reemplazado al terminar el lavado' })
      onDone('Clean ✓ e incidentes cerrados con «Reemplazado»')
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }
  if (suggest) return (
    <Sheet title="¿Cerrar incidentes?" onClose={() => onDone('Clean ✓')}
      footer={<><Btn color={C.green} disabled={busy} onClick={closeAll}>Sí, cerrarlos (Reemplazado)</Btn><Btn ghost color={C.slate} onClick={() => onDone('Clean ✓')}>No, dejarlos abiertos</Btn></>}>
      <p className="text-[13px]" style={{ color: C.slate }}>Agregaste piezas nuevas y hay incidentes abiertos de esos ítems:</p>
      {suggest.map(i => <p key={i.id} className="text-[13px] font-medium" style={{ color: C.ink }}>{i.type} · {i.item}{i.qty ? ` ×${i.qty}` : ''}</p>)}
    </Sheet>
  )
  return (
    <Sheet title={`Terminar · ${bag.code || bag.name}`} onClose={onClose}
      footer={<Btn color={C.green} disabled={busy} onClick={go}><PackageCheck className="w-4 h-4" /> Marcar Clean{lost.length ? ` (${lost.length} con faltante)` : ''}</Btn>}>
      {err && <div className="rounded-xl p-3 text-[13px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}><b>No se pudo marcar Clean:</b> {err}<br /><span style={{ fontSize: 11 }}>Debug · ciclo {cyc.id} · estado del ciclo {cyc.state || '—'}</span></div>}
      <p className="text-[12px] px-1" style={{ color: C.slate }}>Cuenta lo que sale. Viene precargado con lo que entró; cambia solo lo que difiera. Si retiraste una pieza por daño o mancha, márcala como retirada.</p>
      {Object.keys(base).map(it => {
        const lostHere = (counts[it] ?? 0) < base[it] - (discarded[it] || 0)
        return (
          <div key={it} className="rounded-xl p-3 flex items-center justify-between" style={{ background: 'white', border: `1.5px solid ${lostHere ? C.red : C.border}` }}>
            <div>
              <p className="text-[13px] font-medium" style={{ color: C.ink }}>{it}</p>
              <p className="text-[11px]" style={{ color: lostHere ? C.red : C.muted }}>Entró {base[it]}{lostHere ? ' · faltante (se crea incidente)' : ''}</p>
              <button onClick={() => setDiscarded(d => ({ ...d, [it]: (d[it] || 0) + 1 }))} className="text-[11px] font-medium mt-1" style={{ color: C.slate }}>
                {discarded[it] ? `Retiradas: ${discarded[it]} (tocar para sumar)` : '＋ retirada por daño/mancha'}
              </button>
            </div>
            <Stepper value={counts[it] ?? 0} onChange={n => setCounts(c => ({ ...c, [it]: n }))} />
          </div>
        )
      })}
      <label className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: C.slate }}><input type="checkbox" checked={rewash} onChange={e => setRewash(e.target.checked)} /> Hubo que re-lavar</label>
      <Field label="Nota (opcional)"><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={inputStyle} /></Field>
      <PhotoPicker tag={`ready_${bag.code || bag.id}`} urls={photos} onChange={setPhotos} />
    </Sheet>
  )
}

// ─── Reportar un problema (incidente de lavandería) ──────────────────────────
function IncidentForm({ bag, items, unit, onClose, onDone, onError }: { bag: BoardBag; items: string[]; unit: number | null; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const types = ['Faltante', 'Dañado', 'Sucio / Manchado', 'Sobrante', 'Defecto', 'Otro']
  const [type, setType] = useState('Faltante')
  const [item, setItem] = useState('')
  const [qty, setQty] = useState(1)
  const [u, setU] = useState(unit || 0)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const needsItem = ['Faltante', 'Dañado', 'Sucio / Manchado', 'Sobrante'].includes(type)
  const go = async () => {
    setBusy(true)
    try {
      await apiPost('reportBagIncident', { bagId: bag.id, cycleId: bag.lastCycleId, type, item: needsItem ? item : '', qty: needsItem ? qty : 0, unit: u || 0, comment, photos, stage: 'Inspeccion' })
      onDone('Incidente registrado ✓')
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet title={`Reportar problema · ${bag.code || bag.name}`} onClose={onClose}
      footer={<Btn color={C.red} disabled={busy || (needsItem && !item)} onClick={go}>Registrar incidente</Btn>}>
      <Field label="Tipo">
        <div className="flex flex-wrap gap-2">
          {types.map(t => <button key={t} onClick={() => setType(t)} className="px-3 py-2 rounded-xl text-[12px] font-medium" style={{ background: type === t ? C.red : 'white', color: type === t ? 'white' : C.slate, border: `1.5px solid ${type === t ? C.red : C.border}` }}>{t}</button>)}
        </div>
      </Field>
      {needsItem && (
        <>
          <Field label="Ítem">
            <select value={item} onChange={e => setItem(e.target.value)} style={inputStyle}>
              <option value="">Elegir…</option>
              {items.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Cantidad"><Stepper value={qty} onChange={setQty} min={1} /></Field>
        </>
      )}
      {bag.qty > 1 && <Field label="¿Qué maleta? (opcional)"><Stepper value={u} onChange={setU} max={bag.qty} /></Field>}
      <Field label="Comentario"><textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} style={inputStyle} /></Field>
      <PhotoPicker tag={`inc_${bag.code || bag.id}`} urls={photos} onChange={setPhotos} />
    </Sheet>
  )
}
