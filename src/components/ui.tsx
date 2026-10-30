import { useEffect, useState, ReactNode } from 'react'
import { X, Minus, Plus, Camera, Loader2 } from 'lucide-react'
import { uploadPhoto } from '../lib/photos'
import type { Level, Semaforo, State } from '../lib/types'

export const C = {
  ink: '#0F172A', slate: '#475569', muted: '#94A3B8', border: '#E2E8F0', bg: '#F1F5F9', white: '#FFFFFF',
  teal: '#00BCD4', tealDark: '#0097A7', green: '#10B981', amber: '#F59E0B', red: '#EF4444', blue: '#3B82F6', violet: '#8B5CF6', orange: '#F97316',
}
export const STATE_COLOR: Record<string, string> = {
  Dirty: C.orange, Inspected: C.violet, Washing: C.blue, Clean: C.green, 'In Use': '#64748B', 'Sin estado': C.muted,
}
export const LEVEL_COLOR: Record<Level, string> = { ok: C.green, amber: C.amber, red: C.red }
export const SEMAFORO_COLOR: Record<Semaforo, string> = { verde: C.green, amarillo: C.amber, rojo: C.red }
export const STATE_ORDER: State[] = ['Dirty', 'Inspected', 'Washing', 'Clean', 'In Use']

export const fmtDate = (d?: string | null) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
export const fmtDateTime = (iso?: string | null) => iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtHours = (h: number | null | undefined) => h == null ? '—' : h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 className="spin" style={{ width: size, height: size, color: C.teal }} />
}

export function Pill({ text, color, solid = false }: { text: string; color: string; solid?: boolean }) {
  return (
    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={solid ? { background: color, color: 'white' } : { background: color + '1F', color }}>
      {text}
    </span>
  )
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

export function Btn({ children, onClick, color = C.teal, disabled, full = true, ghost = false, small = false }: {
  children: ReactNode; onClick?: () => void; color?: string; disabled?: boolean; full?: boolean; ghost?: boolean; small?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-2xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2 ${full ? 'w-full' : ''} ${small ? 'px-3 py-2 text-[12px]' : 'py-3.5 text-[14px] px-4'}`}
      style={ghost ? { background: 'white', color, border: `1.5px solid ${color}`, opacity: disabled ? 0.5 : 1 } : { background: disabled ? C.muted : color, color: 'white', opacity: disabled ? 0.7 : 1 }}>
      {children}
    </button>
  )
}

export function Card({ children, pad = true, style }: { children: ReactNode; pad?: boolean; style?: React.CSSProperties }) {
  return <div className="rounded-3xl shadow-sm" style={{ background: 'white', border: `1px solid ${C.border}`, padding: pad ? 16 : 0, ...style }}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-1">
      <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.muted }}>{children}</p>
      {right}
    </div>
  )
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="w-full sm:max-w-xl flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ background: C.bg, maxHeight: '94vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ background: 'white', borderBottom: `1px solid ${C.border}` }}>
          <p className="font-black text-[16px] truncate pr-3" style={{ color: C.ink }}>{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: C.bg }}><X className="w-4 h-4" style={{ color: C.slate }} /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4 space-y-3 flex-1">{children}</div>
        {footer && <div className="px-4 py-3 space-y-2" style={{ background: 'white', borderTop: `1px solid ${C.border}` }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 99, color = C.teal }: { value: number; onChange: (n: number) => void; min?: number; max?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <Minus className="w-4 h-4" style={{ color: C.slate }} />
      </button>
      <span className="w-8 text-center font-black text-[16px]" style={{ color }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <Plus className="w-4 h-4" style={{ color: C.slate }} />
      </button>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide block mb-1" style={{ color: C.muted }}>{label}</span>
      {children}
    </label>
  )
}
export const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 14, border: `1.5px solid ${C.border}`, background: 'white', fontSize: 14, outline: 'none', color: C.ink }

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])
  const node = toast ? (
    <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[90] px-5 py-3 rounded-2xl text-white text-[13px] font-bold shadow-xl no-print max-w-[90vw] text-center"
      style={{ background: toast.err ? C.red : C.ink }}>{toast.msg}</div>
  ) : null
  return { show: (msg: string, err = false) => setToast({ msg, err }), node }
}

// Selector de fotos con subida (comprimida). Si falla (sin señal) lo dice y permite reintentar.
export function PhotoPicker({ tag, urls, onChange, required }: { tag: string; urls: string[]; onChange: (u: string[]) => void; required?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setBusy(true); setError('')
    try {
      const out: string[] = []
      for (const f of files) out.push(await uploadPhoto(f, tag))
      onChange([...urls, ...out])
    } catch (err: any) { setError(`No se pudo subir la foto (¿sin señal?): ${err?.message || err}. Intenta de nuevo.`) }
    finally { setBusy(false) }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {urls.map((u, i) => (
          <div key={u} className="relative w-16 h-16 rounded-2xl overflow-hidden" style={{ border: `2px solid ${C.teal}` }}>
            <img src={u} alt="" className="w-full h-full object-cover" />
            <button onClick={() => onChange(urls.filter((_, j) => j !== i))} className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white flex items-center justify-center rounded-bl-lg"><X className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
      <label className="w-full py-3 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[13px] font-bold cursor-pointer"
        style={{ borderColor: required && !urls.length ? C.red : C.slate, color: required && !urls.length ? C.red : C.slate, opacity: busy ? 0.6 : 1 }}>
        {busy ? <Spinner size={16} /> : <Camera className="w-4 h-4" />}
        {busy ? 'Subiendo…' : required && !urls.length ? 'Foto obligatoria' : 'Agregar foto'}
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={pick} disabled={busy} />
      </label>
      {error && <p className="text-[11px] font-semibold mt-1.5" style={{ color: C.red }}>{error}</p>}
    </div>
  )
}
