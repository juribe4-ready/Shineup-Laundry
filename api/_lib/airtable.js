// Cliente mínimo de Airtable (mismo base y token que Admin/Ops)
const BASE = process.env.AIRTABLE_BASE || 'appBwnoxgyIXILe6M'
const TOKEN = process.env.AIRTABLE_TOKEN
const API = 'https://api.airtable.com/v0'

export class AirtableError extends Error {
  constructor(message, status, detail) { super(message); this.status = status; this.detail = detail }
}

const enc = (t) => encodeURIComponent(t)

async function call(path, { method = 'GET', body } = {}) {
  if (!TOKEN) throw new AirtableError('Falta la variable de entorno AIRTABLE_TOKEN', 500)
  const r = await fetch(`${API}/${BASE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!r.ok) {
    const msg = data?.error?.message || data?.error?.type || (typeof data?.error === 'string' ? data.error : '') || text.slice(0, 200)
    let extra = ''
    // Diagnóstico visible: si Airtable dice «Unknown field name», se listan los campos que SÍ existen (los que traen datos) y los enviados.
    if (r.status === 422 && /Unknown field name/i.test(msg) && body?.fields) {
      try {
        const tbl = path.split('?')[0].split('/')[0]
        const rr = await fetch(`${API}/${BASE}/${tbl}?pageSize=100`, { headers: { Authorization: `Bearer ${TOKEN}` } })
        const dd = await rr.json()
        const keys = [...new Set((dd.records || []).flatMap(x => Object.keys(x.fields || {})))]
        const show = (k) => JSON.stringify(k)
        let own = ''
        const rid = path.split('?')[0].split('/')[1]
        if (rid) { try { const o = await (await fetch(`${API}/${BASE}/${tbl}/${rid}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json(); own = ` | Campos de este registro: ${Object.keys(o.fields || {}).map(show).join(', ')}` } catch { /* */ } }
        extra = own + ` | Enviados: ${Object.keys(body.fields).map(show).join(', ')} | Existentes en la tabla: ${keys.map(show).join(', ')}`
      } catch { /* sin diagnóstico */ }
    }
    throw new AirtableError(`Airtable ${r.status} en ${decodeURIComponent(path.split('?')[0])}: ${msg}${extra}`, r.status, data)
  }
  return data
}

export async function listAll(table, { fields, filter, sort, max = 5000, until } = {}) {
  const out = []
  let offset = null
  do {
    const p = new URLSearchParams()
    p.set('pageSize', '100')
    for (const f of fields || []) p.append('fields[]', f)
    if (filter) p.set('filterByFormula', filter)
    for (const [i, s] of (sort || []).entries()) { p.set(`sort[${i}][field]`, s.field); p.set(`sort[${i}][direction]`, s.dir || 'asc') }
    if (offset) p.set('offset', offset)
    const d = await call(`${enc(table)}?${p.toString()}`)
    const page = d.records || []
    out.push(...page)
    offset = d.offset || null
    if (until && until(page)) break
  } while (offset && out.length < max)
  return out
}

export const getRecord = (table, id) => call(`${enc(table)}/${id}`)
export const createRecord = (table, fields) => call(enc(table), { method: 'POST', body: { fields, typecast: true } })
export const updateRecord = (table, id, fields) => call(`${enc(table)}/${id}`, { method: 'PATCH', body: { fields, typecast: true } })

// Trae varios registros por id (en bloques) con OR(RECORD_ID()=...)
export async function getByIds(table, ids, fields) {
  const uniq = [...new Set((ids || []).filter(Boolean))]
  const out = []
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30)
    const filter = `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(',')})`
    out.push(...await listAll(table, { filter, fields }))
  }
  return out
}

// Actualiza muchos registros (de a 10 por llamada, respetando el límite de 5 req/s de Airtable)
export async function updateMany(table, updates) {
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10)
    await call(enc(table), { method: 'PATCH', body: { records: chunk.map(u => ({ id: u.id, fields: u.fields })), typecast: true } })
    if (i + 10 < updates.length) await new Promise(r => setTimeout(r, 230))
  }
}
