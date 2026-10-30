import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { apiGet, apiPost } from '../lib/api'
import { Btn, C, Spinner } from './ui'

interface LB { id: string; code: string | null; name: string; qty: number; properties: string[] }
interface Plan { id: string; name: string; code: string }

export default function LabelsPage({ onMsg }: { onMsg: (m: string, err?: boolean) => void }) {
  const [bags, setBags] = useState<LB[] | null>(null)
  const [plan, setPlan] = useState<Plan[] | null>(null)
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const load = () => apiGet<{ bags: LB[] }>('labels').then(d => setBags(d.bags)).catch(e => onMsg(e.message, true))
  useEffect(() => { load() }, []) // eslint-disable-line

  const labels = (bags || []).filter(b => b.code).flatMap(b => Array.from({ length: Math.max(1, b.qty) }, (_, i) => ({ code: `${b.code}-${i + 1}`, bag: b, n: i + 1 })))
  useEffect(() => {
    let dead = false
    ;(async () => {
      const out: Record<string, string> = {}
      for (const l of labels) out[l.code] = await QRCode.toDataURL(l.code, { margin: 1, width: 220 })
      if (!dead) setQrs(out)
    })()
    return () => { dead = true }
  }, [bags]) // eslint-disable-line

  const preview = async () => { try { const r = await apiPost<{ plan: Plan[] }>('assignCodes', {}); setPlan(r.plan) } catch (e: any) { onMsg(e.message, true) } }
  const apply = async () => { try { await apiPost('assignCodes', { apply: true }); setPlan(null); await load(); onMsg('Códigos asignados ✓') } catch (e: any) { onMsg(e.message, true) } }

  if (!bags) return <div className="flex justify-center py-8"><Spinner /></div>
  const missing = bags.filter(b => !b.code).length
  return (
    <div className="space-y-3">
      <div className="no-print space-y-2">
        {missing > 0 && !plan && <Btn color={C.amber} onClick={preview}>{missing} maletas sin código: ver propuesta</Btn>}
        {plan && (
          <div className="rounded-xl p-3" style={{ background: 'white', border: `1px solid ${C.border}` }}>
            {plan.map(p => <p key={p.id} className="text-[12px]"><b>{p.code}</b> ← {p.name}</p>)}
            <div className="mt-2 space-y-2"><Btn color={C.green} onClick={apply}>Confirmar y guardar en Airtable</Btn><Btn ghost color={C.slate} onClick={() => setPlan(null)}>Cancelar</Btn></div>
          </div>
        )}
        <Btn color={C.ink} onClick={() => window.print()}>Imprimir etiquetas</Btn>
      </div>
      <div className="grid grid-cols-2 gap-2 print:grid-cols-3">
        {labels.map(l => (
          <div key={l.code} className="label-card rounded-xl p-2 text-center" style={{ background: 'white', border: `1px dashed ${C.muted}` }}>
            {qrs[l.code] && <img src={qrs[l.code]} alt={l.code} className="mx-auto" style={{ width: 110, height: 110 }} />}
            <p className="text-[15px] font-semibold" style={{ color: C.ink }}>{l.code}</p>
            <p className="text-[9px]" style={{ color: C.slate }}>{l.bag.name}{l.bag.qty > 1 ? ` · ${l.n}/${l.bag.qty}` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
