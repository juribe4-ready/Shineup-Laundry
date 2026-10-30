// Autenticación con el mismo Supabase que Ops/Admin + función central de permisos.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jpdajjiaukzilrxwcgtx.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lVelTDSvaDDwvSGRLINQ8A_9eSKcZVP'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// Valida el access_token del usuario y carga su profile (con su propio token → respeta RLS)
export async function authenticate(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) throw new HttpError(401, 'Falta el token de sesión')
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers })
  if (!ur.ok) throw new HttpError(401, 'Sesión inválida o vencida')
  const user = await ur.json()
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=*`, { headers })
  if (!pr.ok) throw new HttpError(403, 'No se pudo leer tu perfil')
  const rows = await pr.json()
  const profile = rows?.[0]
  if (!profile || profile.active === false) throw new HttpError(403, 'Cuenta sin acceso')
  return { user, profile }
}

// ── Permisos centralizados ──────────────────────────────────────────────────
// • "laundry": quienes operan la lavandería → laundry_access = true, o admin/manager
// • "field": cleaners en Ops (escanear, declarar devolución, reportar problema)
// • "admin": admin/manager (etiquetas, configuración)
const FIELD_ACTIONS = new Set(['bag', 'bagsByProperty', 'declareReturn', 'markInUse', 'loadShift', 'reportBagIncident', 'me'])
const LAUNDRY_ACTIONS = new Set(['board', 'cycle', 'inspect', 'receive', 'startWash', 'finishWash', 'undoLoad', 'incidents', 'updateIncident', 'kpis', 'config', 'staff'])
const ADMIN_ACTIONS = new Set(['labels', 'assignCodes'])

export function permissions(profile) {
  const role = profile?.role
  const isAdmin = role === 'admin' || role === 'manager'
  return {
    admin: isAdmin,
    laundry: isAdmin || profile?.laundry_access === true,
    field: isAdmin || role === 'cleaner' || profile?.laundry_access === true,
  }
}

export function can(profile, action) {
  const p = permissions(profile)
  if (ADMIN_ACTIONS.has(action)) return p.admin
  if (LAUNDRY_ACTIONS.has(action)) return p.laundry
  if (FIELD_ACTIONS.has(action)) return p.field
  return false
}
