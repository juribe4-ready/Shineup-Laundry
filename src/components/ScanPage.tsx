import { useState } from 'react'
import { apiGet } from '../lib/api'
import type { BoardBag } from '../lib/types'
import Scanner from './Scanner'
import { Btn, C, inputStyle } from './ui'

export default function ScanPage({ bags, onFound, onMsg }: { bags: BoardBag[]; onFound: (b: BoardBag, unit: number | null) => void; onMsg: (m: string, err?: boolean) => void }) {
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const resolve = async (raw: string) => {
    const code = raw.trim().toUpperCase()
    if (!code || busy) return
    const m = code.match(/^(.*?)-(\d+)$/)
    const base = m ? m[1] : code
    const local = bags.find(b => (b.code || '').toUpperCase() === code) || bags.find(b => (b.code || '').toUpperCase() === base)
    if (local) { onFound(local, m && local.code?.toUpperCase() === base ? Number(m[2]) : null); return }
    setBusy(true)
    try {
      const d = await apiGet<{ bag: { id: string }; unit: number | null }>('bag', { code })
      const b = bags.find(x => x.id === d.bag.id)
      if (b) onFound(b, d.unit); else onMsg('Maleta encontrada pero no está en el tablero', true)
    } catch (e: any) { onMsg(e.message, true) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <Scanner onCode={resolve} paused={busy} />
      <div className="flex gap-2">
        <input value={manual} onChange={e => setManual(e.target.value)} placeholder="o escribe el código (C-014)" style={inputStyle} onKeyDown={e => e.key === 'Enter' && resolve(manual)} />
        <div style={{ width: 100 }}><Btn color={C.ink} onClick={() => resolve(manual)}>Abrir</Btn></div>
      </div>
    </div>
  )
}
