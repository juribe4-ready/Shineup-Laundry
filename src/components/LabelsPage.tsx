import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { apiGet, apiPost } from '../lib/api'
import { Btn, C, inputStyle, Spinner } from './ui'

interface LB { id: string; code: string | null; codeLabel: string | null; codes: string[]; name: string; qty: number; properties: string[] }
interface Plan { id: string; name: string; old: string | null; code: string; codes: string; property: string; client: string; qty: number }

// Tamaños en mm (ancho × alto). Tag = 6.2 × 2.3 in (horizontal). Tarjeta = tarjeta de presentación.
// Plantilla fija: QR a la izquierda · zona del NOMBRE (ocupa todo el espacio libre) · pie con código + maleta.
const SIZES = {
  tag: { label: 'Tag 6.2 × 2.3 in', w: 157.5, h: 58.4, nameMax: 66, nameMin: 20, code: 19, badge: 13, footRow: true },
  card: { label: 'Tarjeta 89 × 51 mm', w: 89, h: 51, nameMax: 34, nameMin: 11, code: 10.5, badge: 8, footRow: false },
} as const
type SizeKey = keyof typeof SIZES

const PT = 0.3528 // mm por punto

// Nombre de la casa: el más grande que quepa en el espacio disponible (hasta 3 líneas).
function fitName(txt: string, availW: number, maxH: number, maxPt: number, minPt: number) {
  const words = txt.split(/\s+/).filter(Boolean)
  const wrapLines = (pt: number) => {
    const cw = 0.63 * pt * PT // ancho aprox. de un carácter (negrita), conservador
    let lines = 1, cur = 0
    for (const w of words) {
      const len = w.length * cw
      if (len > availW) return 99 // una palabra sola no cabe: bajar el tamaño
      if (cur === 0) cur = len
      else if (cur + cw + len <= availW) cur += cw + len
      else { lines++; cur = len }
    }
    return lines
  }
  for (let pt = maxPt; pt >= minPt; pt -= 1) {
    const lines = wrapLines(pt)
    if (lines <= 3 && lines * pt * 1.06 * PT <= maxH) return pt
  }
  return minPt
}

// Qué nombre imprimir: si «Name» en Airtable fue escrito a mano (no tiene el formato automático Cliente_Casa_Bag), se usa tal cual.
// Si no, se usan los nombres de las propiedades (todas, separadas por « / »).
const houseName = (b: { name: string; properties: string[] }) => (b.name && !b.name.includes('_') ? b.name : b.properties.join(' / ') || b.name)

export default function LabelsPage({ onMsg }: { onMsg: (m: string, err?: boolean) => void }) {
  const [bags, setBags] = useState<LB[] | null>(null)
  const [plan, setPlan] = useState<{ rows: Plan[]; regenerate: boolean } | null>(null)
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [size, setSize] = useState<SizeKey>('tag')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => apiGet<{ bags: LB[] }>('labels').then(d => setBags(d.bags)).catch(e => onMsg(e.message, true))
  useEffect(() => { load() }, []) // eslint-disable-line

  const labels = useMemo(() => (bags || [])
    .filter(b => b.code)
    .filter(b => !q.trim() || `${b.code} ${b.name} ${b.properties.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    .flatMap(b => Array.from({ length: Math.max(1, b.qty) }, (_, i) => ({ code: b.codes[i] || `${b.code}-${i + 1}`, bag: b, n: i + 1 }))), [bags, q])

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
  const pad = S.h > 55 ? 3 : 2.5, gap = 3, qrSide = S.h - pad * 2
  const textW = S.w - pad * 2 - qrSide - gap
  const footH = S.footRow ? Math.max(S.code, S.badge) * PT * 1.5 + 3 : (S.code + S.badge) * PT * 1.45 + 4 // alto fijo del pie

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'white', border: `1px solid ${C.border}` }}>
          <p className="text-[14px] font-semibold" style={{ color: C.ink }}>Códigos</p>
          <p className="text-[12px]" style={{ color: C.slate }}>{withCode} casas con código · {missing} sin código · formato <b>M-AH-GL-1</b> (M + 2 letras del cliente + 2 de la propiedad + nº de maleta: la 1.ª es -1, la 2.ª es -2).</p>
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
                {plan.rows.map(p => <p key={p.id}><b className="font-mono">{p.codes}</b> ← {p.client ? `${p.client} · ` : ''}{p.property || p.name}{p.old ? <span style={{ color: C.muted }}> (antes {p.old})</span> : null}{p.qty > 1 ? ` · ${p.qty} maletas` : ''}</p>)}
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
          const house = houseName(l.bag)
          const namePt = fitName(house, textW, S.h - pad * 2 - footH, S.nameMax, S.nameMin)
          return (
            <div key={l.code} className="qr-label" style={{ width: `${S.w}mm`, height: `${S.h}mm`, padding: `${pad}mm`, display: 'flex', alignItems: 'center', gap: `${gap}mm`, background: 'white', border: '0.25mm dashed #B6BEC9', borderRadius: '2mm', boxSizing: 'border-box', overflow: 'hidden' }}>
              {qrs[l.code] ? <img src={qrs[l.code]} alt={l.code} style={{ width: `${qrSide}mm`, height: `${qrSide}mm`, flexShrink: 0 }} /> : <div style={{ width: `${qrSide}mm`, height: `${qrSide}mm`, flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: `${namePt}pt`, lineHeight: 1.04, color: '#0F172A', letterSpacing: '-0.02em', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{house}</div>
                </div>
                <div style={{ height: `${footH}mm`, flexShrink: 0, display: 'flex', flexDirection: S.footRow ? 'row' : 'column', alignItems: S.footRow ? 'center' : 'flex-start', justifyContent: S.footRow ? 'space-between' : 'center', gap: '1.2mm', borderTop: '0.3mm solid #0F172A', paddingTop: '1mm' }}>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontWeight: 700, fontSize: `${S.code}pt`, lineHeight: 1, color: '#334155', whiteSpace: 'nowrap' }}>{l.code}</span>
                  <span style={{ display: 'inline-block', background: '#0F172A', color: 'white', fontWeight: 700, fontSize: `${S.badge}pt`, lineHeight: 1, padding: '1.4mm 3mm', borderRadius: '1.6mm', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>MALETA {l.n}{l.bag.qty > 1 ? ` DE ${l.bag.qty}` : ''}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
