import { supabase } from '../supabase'
import { debugLog } from './debug'

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

async function request<T>(method: 'GET' | 'POST', type: string, params?: Record<string, string>, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const qs = new URLSearchParams({ type, ...(params || {}) }).toString()
  const t0 = Date.now()
  let status = 0
  try {
    const r = await fetch(`${BASE}/api/laundry?${qs}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    status = r.status
    const json = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(json?.error || `Error ${r.status}`)
    debugLog({ kind: 'api', label: `${method} ${type}`, status, ms: Date.now() - t0 })
    return json as T
  } catch (e: any) {
    debugLog({ kind: 'api', label: `${method} ${type}`, status, ms: Date.now() - t0, error: e?.message || String(e) })
    throw e
  }
}

export const apiGet = <T>(type: string, params?: Record<string, string>) => request<T>('GET', type, params)
export const apiPost = <T>(type: string, body: unknown) => request<T>('POST', type, undefined, body)
