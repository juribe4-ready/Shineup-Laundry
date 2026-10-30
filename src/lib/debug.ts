// Panel de depuración visible (no usamos la consola del navegador).
export interface DebugEntry { at: number; kind: 'api' | 'photo' | 'info'; label: string; status?: number; ms?: number; error?: string }
type Listener = () => void

const entries: DebugEntry[] = []
const listeners = new Set<Listener>()
let extra: Record<string, unknown> = {}

export const debugLog = (e: Omit<DebugEntry, 'at'>) => {
  entries.unshift({ ...e, at: Date.now() })
  if (entries.length > 80) entries.length = 80
  listeners.forEach(l => l())
}
export const debugSetExtra = (patch: Record<string, unknown>) => { extra = { ...extra, ...patch }; listeners.forEach(l => l()) }
export const debugGet = () => ({ entries: [...entries], extra })
export const debugSubscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }
