import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { apiGet, apiPost } from '../lib/api'
import { Btn, C, inputStyle, Spinner } from './ui'

interface LB { id: string; code: string | null; name: string; qty: number; properties: string[] }
interface Plan { id: string; name: string; old: string | null; code: string; property: string; qty: number }

// Tamaños en mm (ancho × alto). Tarjeta = tamaño de tarjeta de presentación.
const SIZES = {
  card: { label: 'Tarjeta 89 × 51 mm', w: 89, h: 51, code: 14, name: 10, small: 7.5 },
  tag: { label: 'Tag 64 × 38 mm', w: 64, h: 38, code: 10, name: 8.5, small: 6.5 },
  mini: { label: 'Tag chico 51 × 32 mm', w: 51, h: 32, code: 8, name: 7, small: 5.5 },
} as const
type SizeKey = keyof typeof SIZES

export default function LabelsPage({ onMsg }: { onMsg: (m: string, err?: boolean) => void }) {
  const [bags, setBags] = useState<LB[] | null>(null)
  const [plan, setPlan] = useState<{ rows: Plan[]; regenerate: boolean } | null>(null)
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [size, setSize] = useState<SizeKey>('card')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => apiGet<{ bags: LB[] }>('labels').then(d => setBags(d.bags)).catch(e => onMsg(e.message, true))
  useEffect(() => { load() }, []) // eslint-disable-line

  const labels = useMemo(() => (bags || [])
    .filter(b => b.code)
    .filter(b => !q.trim() || `${b.code} ${b.name} ${b.properties.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    .flatMap(b => Array.from({ length: Math.max(1, b.qty) }, (_, i) => ({ code: `${b.code}-${i + 1}`, bag: b, n: i + 1 }))), [bags, q])

  useEffect(() => {
    let dead = false
    ;(async () => {
      const out: Record<string, string> = {}
      for (const l of labels) out[l.code] = await QRCode.toDataURL(l.code, { margin: 0, width: 480, errorCorrectionLevel: 'M' })
      if (!dead) setQrs(out)
    })()
    return () => { dead = true }
  }, [labels])

  const preview = async (regenerate: boolean) => {
    setBusy(true)
    try { const r = await apiPost<{ plan: Plan[] }>('assignCodes', { regenerate }); setPlan({ rows: r.plan, regenerate }) } catch (e: any) { onMsg(e.message, true) } finally { setBusy(false) }
  }
  const apply = async () => {
    if (!plan) return
    setBusy(true)
    try { await apiPost('assignCodes', { apply: true, regenerate: plan.regenerate }); setPlan(null); await load(); onMsg('Códigos guardados en Airtable ✓') } catch (e: any) { onMsg(e.message, true) } finally { setBusy(false) }
  }

  if (!bags) return <div className="flex justify-center py-8"><Spinner /></div>
  const missing = bags.filter(b => !b.code).length
  const withCode = bags.length - missing
  const S = SIZES[size]
  const pad = 2.5, qrSide = S.h - pad * 2

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[14px] font-semibold" style={{ color: C.ink }}>Códigos</p>
          <p className="text-[12px]" style={{ color: C.slate }}>{withCode} casas con código · {missing} sin código · formato <b>M014-AHGL</b> (M + número + 2 letras del cliente + 2 de la propiedad). Cada maleta física agrega -1, -2…</p>
          {!plan && (
            <div className="space-y-2">
              {missing > 0 && <Btn color={C.amber} disabled={busy} onClick={() => preview(false)}>Asignar a las {missing} que faltan (ver propuesta)</Btn>}
              <Btn ghost color={C.slate} disabled={busy} onClick={() => preview(true)}>Regenerar TODOS con el formato nuevo (ver propuesta)</Btn>
            </div>
          )}
          {plan && (
            <div className="space-y-2">
              <p className="text-[12px] font-semibold" style={{ color: plan.regenerate ? C.red : C.ink }}>
                {plan.regenerate ? `Vas a reemplazar el código de ${plan.rows.length} casas. Si ya imprimiste etiquetas con los códigos viejos, dejarán de funcionar.` : `Se asignarán ${plan.rows.length} códigos.`}
              </p>
              <div className="max-h-64 overflow-auto rounded-lg p-2 text-[12px]" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                {plan.rows.map(p => <p key={p.id}><b className="font-mono">{p.code}</b> ← {p.property || p.name}{p.old ? <span style={{ color: C.muted }}> (antes {p.old})</span> : null}{p.qty > 1 ? ` · ${p.qty} maletas` : ''}</p>)}
              </div>
              <Btn color={C.green} disabled={busy} onClick={apply}>{busy ? 'Guardando…' : 'Confirmar y guardar en Airtable'}</Btn>
              <Btn ghost color={C.slate} disabled={busy} onClick={() => setPlan(null)}>Cancelar</Btn>
            </div>
          )}
        </div>

        <div className="rounded-xl p-4 space-y-2" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[14px] font-semibold" style={{ color: C.ink }}>Imprimir etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SIZES) as SizeKey[]).map(k => (
              <button key={k} onClick={() => setSize(k)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ background: size === k ? C.ink : 'white', color: size === k ? 'white' : C.slate, border: `1px solid ${size === k ? C.ink : C.border}` }}>{SIZES[k].label}</button>
            ))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por código, cliente o casa (para imprimir solo algunas)" style={inputStyle} />
          <p className="text-[12px]" style={{ color: C.slate }}>{labels.length} etiquetas ({new Set(labels.map(l => l.bag.id)).size} casas). En el diálogo de impresión: escala 100 % y sin márgenes extra.</p>
          <Btn color={C.ink} disabled={labels.length === 0} onClick={() => window.print()}>Imprimir {labels.length} etiquetas</Btn>
        </div>
        {labels.length === 0 && <p className="text-center text-[13px] py-4" style={{ color: C.muted }}>{withCode === 0 ? 'Todavía no hay códigos. Usa «Asignar» arriba y luego aquí aparecen las etiquetas.' : 'Ninguna etiqueta coincide con el filtro.'}</p>}
      </div>

      <div id="print-area" style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm' }}>
        {labels.map(l => {
          const house = l.bag.properties[0] || l.bag.name
          return (
            <div key={l.code} className="qr-label" style={{ width: `${S.w}mm`, height: `${S.h}mm`, padding: `${pad}mm`, display: 'flex', alignItems: 'center', gap: '2.5mm', background: 'white', border: '0.25mm dashed #B6BEC9', borderRadius: '2mm', boxSizing: 'border-box', overflow: 'hidden' }}>
              {qrs[l.code] ? <img src={qrs[l.code]} alt={l.code} style={{ width: `${qrSide}mm`, height: `${qrSide}mm`, flexShrink: 0 }} /> : <div style={{ width: `${qrSide}mm`, height: `${qrSide}mm`, flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1mm', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontWeight: 800, fontSize: `${S.code}pt`, lineHeight: 1.05, color: '#0F172A', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{l.bag.code}<span style={{ fontSize: '62%', fontWeight: 700, color: '#64748B' }}>-{l.n}</span></div>
                <div style={{ fontWeight: 600, fontSize: `${S.name}pt`, lineHeight: 1.15, color: '#0F172A', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{house}</div>
                <div style={{ fontSize: `${S.small}pt`, color: '#475569' }}>Maleta {l.n}{l.bag.qty > 1 ? ` de ${l.bag.qty}` : ''} · Shine<b style={{ color: '#E8A200' }}>UP</b></div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
