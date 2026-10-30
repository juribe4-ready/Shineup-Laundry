import { useEffect, useState } from 'react'
import { Bug } from 'lucide-react'
import { debugGet, debugSubscribe } from '../lib/debug'
import { C } from './ui'

// Panel de diagnóstico visible (sin consola): últimas llamadas, errores y datos detectados.
export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [, force] = useState(0)
  useEffect(() => debugSubscribe(() => force(n => n + 1)), [])
  const { entries, extra } = debugGet()
  const errors = entries.filter(e => e.error).length
  return (
    <>
      <button onClick={() => setOpen(o => !o)} className="fixed z-[80] no-print" style={{ right: 10, bottom: 78, width: 38, height: 38, borderRadius: 19, background: errors ? C.red : C.ink, color: 'white', opacity: 0.85 }}>
        <Bug className="w-4 h-4 mx-auto" />
      </button>
      {open && (
        <div className="fixed inset-x-2 z-[80] rounded-xl p-3 overflow-auto no-print" style={{ bottom: 122, maxHeight: '60vh', background: '#0F172A', color: '#E2E8F0', fontSize: 11, fontFamily: 'monospace' }}>
          <p className="font-bold mb-1">Diagnóstico</p>
          <pre className="whitespace-pre-wrap break-all mb-2">{JSON.stringify(extra, null, 1)}</pre>
          <p className="font-bold mb-1">Últimas llamadas</p>
          {[...entries].reverse().map((e, i) => (
            <div key={i} style={{ color: e.error ? '#FCA5A5' : '#A7F3D0' }}>
              {new Date(e.at).toLocaleTimeString()} {e.label} {e.status || ''} {e.ms != null ? `${e.ms}ms` : ''} {e.error || ''}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
