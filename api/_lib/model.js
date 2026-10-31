import { T, FB, FC, FI, FCL, STATES, DIRTY_STATES, STATE_ALIASES, BAG_NON_ITEM_NUMERIC, TARS_DEFAULTS, CATEGORY_LAUNDRY, INCIDENT_TYPES } from './schema.js'
import { listAll, getByIds } from './airtable.js'

// ── utilidades ───────────────────────────────────────────────────────────────
export const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
export const first = (v) => (Array.isArray(v) ? v[0] : v)
export const parseJSON = (s, fallback) => { try { return s ? JSON.parse(s) : fallback } catch { return fallback } }
export const nowISO = () => new Date().toISOString()
const hoursBetween = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 3600000 : null)
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

export function normState(v) {
  if (!v) return null
  const s = STATE_ALIASES[v] || v
  return STATES.includes(s) ? s : null
}

// ── configuración (TARS) ─────────────────────────────────────────────────────
export async function loadConfig() {
  try {
    const recs = await listAll(T.standards, { filter: `{Name}='TARS_CONFIG'`, fields: ['Name', 'Value'] })
    const parsed = parseJSON(recs?.[0]?.fields?.Value, {})
    const cfg = { ...TARS_DEFAULTS }
    for (const k of Object.keys(TARS_DEFAULTS)) {
      const n = Number(parsed?.[k])
      if (Number.isFinite(n) && parsed[k] !== null && parsed[k] !== '') cfg[k] = n
    }
    return { cfg, fromTars: Object.keys(TARS_DEFAULTS).filter(k => parsed?.[k] !== undefined) }
  } catch {
    return { cfg: { ...TARS_DEFAULTS }, fromTars: [] }
  }
}

// ── mapas de nombres ─────────────────────────────────────────────────────────
export async function loadNameMaps() {
  const [props, staff] = await Promise.all([
    listAll(T.properties, { fields: ['Name'] }).catch(() => []),
    listAll(T.staff, { fields: ['Name', 'Initials'] }).catch(() => []),
  ])
  const propMap = {}; for (const p of props) propMap[p.id] = p.fields?.Name || '?'
  const staffMap = {}; for (const s of staff) staffMap[s.id] = s.fields?.Name || s.fields?.Initials || '?'
  return { propMap, staffMap }
}

// ── Bags ─────────────────────────────────────────────────────────────────────
export function detectItems(records) {
  const forced = (process.env.LAUNDRY_ITEM_FIELDS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (forced.length) return forced
  const exclude = new Set([...BAG_NON_ITEM_NUMERIC, ...(process.env.LAUNDRY_ITEM_EXCLUDE || '').split(',').map(s => s.trim()).filter(Boolean)])
  const set = new Set()
  for (const r of records) for (const [k, v] of Object.entries(r.fields || {})) if (typeof v === 'number' && !exclude.has(k)) set.add(k)
  return [...set]
}

export function normalizeBag(rec, items, propMap = {}) {
  const f = rec.fields || {}
  const standard = {}
  for (const it of items) if (typeof f[it] === 'number' && f[it] > 0) standard[it] = f[it]
  const propertyIds = Array.isArray(f[FB.property]) ? f[FB.property] : []
  const bag = {
    id: rec.id,
    code: f[FB.code] || null,
    codeLabel: null,
    client: [].concat(f[FB.client] ?? []).filter(x => typeof x === 'string' && x.trim())[0] || null,
    name: f[FB.name] || '(sin nombre)',
    qty: Number(f[FB.qty]) > 0 ? Number(f[FB.qty]) : 1,
    properties: propertyIds.map(id => ({ id, name: propMap[id] || '?' })),
    state: normState(f[FB.state]),
    standard,
    lastCycleId: first(f[FB.lastCycle]) || null,
  }
  bag.codeLabel = codeLabel(bag)
  return bag
}

// Códigos nuevos: M-AH-GL-1 (M + 2 letras cliente + 2 letras propiedad + nº de maleta). El código guardado en `Codigo`
// es el de la PRIMERA maleta del juego; si hay 2 maletas son -1 y -2. Si dos casas comparten letras, el número sigue
// corrido (la segunda casa empieza en -2, -3…), así cada maleta física tiene un código único.
// Códigos viejos (C-014) se siguen entendiendo: C-014-1, C-014-2.
const NEW_CODE = /^(M-[A-Z0-9]{2}-[A-Z0-9]{2})-(\d{1,2})$/
export function codeParts(code) {
  const m = String(code || '').toUpperCase().match(NEW_CODE)
  return m ? { prefix: m[1], start: Number(m[2]) } : null
}
export function unitCode(bag, n) {
  const p = codeParts(bag.code)
  return p ? `${p.prefix}-${p.start + n - 1}` : bag.code ? `${bag.code}-${n}` : null
}
export function codeLabel(bag) {
  const p = codeParts(bag.code)
  if (!p) return bag.code || null
  return bag.qty > 1 ? `${p.prefix}-${p.start}…${p.start + bag.qty - 1}` : bag.code
}

export function resolveCode(raw, bags) {
  const code = String(raw || '').trim().toUpperCase()
  if (!code) return null
  const np = codeParts(code)
  if (np) {
    for (const b of bags) {
      const bp = codeParts(b.code)
      if (bp && bp.prefix === np.prefix && np.start >= bp.start && np.start < bp.start + (b.qty || 1)) return { bag: b, unit: np.start - bp.start + 1 }
    }
  }
  const exact = bags.find(b => b.code && b.code.toUpperCase() === code)
  if (exact) return { bag: exact, unit: null }
  const m = code.match(/^(.*)-(\d{1,2})$/)
  if (m) {
    const b = bags.find(x => x.code && x.code.toUpperCase() === m[1] && !codeParts(x.code))
    if (b) return { bag: b, unit: Number(m[2]) }
  }
  return null
}

// ── Ciclos ───────────────────────────────────────────────────────────────────
// Unidades (maletas físicas). unitsSeen guarda: «out:1,2» (carga de turno) o «1=dirty,2=stay» (devolución),
// y opcionalmente «;rcv:1,2» = unidades que lavandería ya recibió/confirmó.
export function parseUnits(txt) {
  const [main, ...rest] = String(txt || '').trim().split(';')
  const t = main.trim()
  const rcvPart = rest.find(x => x.trim().startsWith('rcv:'))
  const rcv = rcvPart ? rcvPart.trim().slice(4).split(',').map(Number).filter(n => n > 0) : []
  if (t.startsWith('out:')) return { out: t.slice(4).split(',').map(Number).filter(n => n > 0), back: [], rcv }
  // «1=dirty», «1=stay» o «1=dirty@bodega» (dónde la deja el cleaner: bodega | lavanderia)
  const back = t.split(',').map(p => p.split('=')).filter(p => p.length === 2 && Number(p[0]) > 0).map(([u, s]) => { const [status, place] = String(s).split('@'); return { unit: Number(u), status, place: place || null } })
  return { out: [], back, rcv }
}
export function unitsText({ out = [], back = [], rcv = [] }) {
  const main = out.length && !back.length ? `out:${out.join(',')}` : back.map(u => `${u.unit}=${u.status}${u.place ? '@' + u.place : ''}`).join(',')
  return rcv.length ? `${main};rcv:${[...new Set(rcv)].sort((a, b) => a - b).join(',')}` : main
}

export function normalizeCycle(rec, staffMap = {}) {
  const f = rec.fields || {}
  const who = (v) => (Array.isArray(v) && v[0] ? staffMap[v[0]] || '?' : null)
  const short = parseJSON(f[FC.short], [])
  return {
    id: rec.id,
    name: f[FC.name] || '',
    bagId: first(f[FC.bag]) || null,
    cleaningCloseId: first(f[FC.cleaningClose]) || null,
    cleaningUseId: first(f[FC.cleaningUse]) || null,
    state: normState(f[FC.state]),
    dirtyAt: f[FC.dirtyAt] || null,
    declaredBy: who(f[FC.declaredBy]),
    condition: f[FC.condition] || 'Normal',
    tags: Array.isArray(f[FC.tags]) ? f[FC.tags] : [],
    short: Array.isArray(short) ? short : [],
    sendAll: !(Array.isArray(short) && short.length > 0),
    cleanerNote: f[FC.cleanerNote] || '',
    unitsSeen: f[FC.unitsSeen] || '',
    unitsOut: parseUnits(f[FC.unitsSeen]).out,
    unitsBack: parseUnits(f[FC.unitsSeen]).back,
    unitsRcv: parseUnits(f[FC.unitsSeen]).rcv,
    stayedUnits: parseUnits(f[FC.unitsSeen]).back.filter(u => u.status === 'stay').length,
    bagsOut: typeof f[FC.bagsOut] === 'number' ? f[FC.bagsOut] : null,
    bagsBack: typeof f[FC.bagsBack] === 'number' ? f[FC.bagsBack] : null,
    inspectedAt: f[FC.inspectedAt] || null,
    inspectedBy: who(f[FC.inspectedBy]),
    counted: parseJSON(f[FC.counted], null),
    endorsement: f[FC.endorsement] || null,
    special: !!f[FC.special],
    washStart: f[FC.washStart] || null,
    washEnd: f[FC.washEnd] || null,
    washedBy: who(f[FC.washedBy]),
    washPlace: f[FC.washPlace] || null,
    rewash: !!f[FC.rewash],
    readyAt: f[FC.readyAt] || null,
    finalContent: parseJSON(f[FC.finalContent], null),
    packedBy: who(f[FC.packedBy]),
    loadedAt: f[FC.loadedAt] || null,
    openedAt: f[FC.openedAt] || null,
    log: parseJSON(f[FC.log], []),
  }
}

// ── Incidentes ───────────────────────────────────────────────────────────────
// «C-014 · Faltante · Sheets-Q ×2» → { type, item, qty }
export function parseIncidentName(name) {
  const parts = String(name || '').split(' · ')
  const type = INCIDENT_TYPES.includes(parts[1]) ? parts[1] : null
  const rest = parts[2] || ''
  const m = rest.match(/ ×(\d+)$/)
  return { type, item: rest.replace(/ ×\d+$/, '') || null, qty: m ? Number(m[1]) : null }
}

export function normalizeIncident(rec, maps = {}) {
  const f = rec.fields || {}
  const { propMap = {}, staffMap = {}, bagMap = {} } = maps
  const propId = first(f[FI.property])
  const bagId = first(f[FI.bag])
  const parsed = parseIncidentName(f[FI.name])
  return {
    id: rec.id,
    name: f[FI.name] || 'Sin nombre',
    status: f[FI.status] || 'Reported',
    created: f[FI.created] || null,
    comment: f[FI.comment] || '',
    closeComment: f[FI.closeComment] || '',
    media: f[FI.media] || null,
    category: f[FI.category] || null,
    type: parsed.type,
    stage: null,
    item: f[FI.item] || parsed.item,
    qty: parsed.qty,
    unit: null,
    action: null,
    cost: null,
    propertyId: propId || null,
    propertyName: propId ? propMap[propId] || '?' : null,
    bagId: bagId || null,
    bagName: bagId ? bagMap[bagId] || '?' : null,
    cycleId: first(f[FI.cycle]) || null,
    reportedBy: Array.isArray(f[FI.reportedBy]) ? staffMap[f[FI.reportedBy][0]] || '' : '',
    owner: Array.isArray(f[FI.owner]) ? staffMap[f[FI.owner][0]] || '' : '',
    ownerId: first(f[FI.owner]) || null,
  }
}

// Semáforo simple: rojo = el ciclo llegó en condición «Malo»; amarillo = hay incidentes abiertos; verde = nada.
export function semaforoOf(openIncidents, cycle) {
  if (cycle?.condition === 'Malo') return 'rojo'
  if (openIncidents.length > 0) return 'amarillo'
  return 'verde'
}

export async function loadOpenLaundryIncidents() {
  const warnings = []
  try {
    const recs = await listAll(T.incidents, { filter: `AND({${FI.category}}='${CATEGORY_LAUNDRY}',{${FI.status}}!='Closed')` })
    return { recs, warnings }
  } catch (e) {
    warnings.push(`No pude leer incidentes de lavandería (¿existe el campo "${FI.category}" en Incidents?): ${e.message}`)
    return { recs: [], warnings }
  }
}

// ── Próximas limpiezas por propiedad ─────────────────────────────────────────
export async function nextCleaningByProperty(today) {
  const map = {}
  const cutoff = today
  const recs = await listAll(T.cleanings, {
    fields: [FCL.date, FCL.property, FCL.status, FCL.propertyText],
    sort: [{ field: FCL.date, dir: 'desc' }],
    max: 1500,
    until: (page) => {
      const last = page[page.length - 1]
      const d = String(last?.fields?.[FCL.date] || '').slice(0, 10)
      return !!d && d < cutoff
    },
  })
  for (const r of recs) {
    const f = r.fields || {}
    const d = String(f[FCL.date] || '').slice(0, 10)
    const status = String(f[FCL.status] || '')
    if (!d || d < today || status === 'Done' || /cancel/i.test(status)) continue
    for (const pid of Array.isArray(f[FCL.property]) ? f[FCL.property] : []) {
      if (!map[pid] || d < map[pid].date) map[pid] = { id: r.id, date: d, status }
    }
  }
  return map
}

// ── Tablero ──────────────────────────────────────────────────────────────────
const RANK = { ok: 0, amber: 1, red: 2 }

// ── Inventario por pieza: dónde está cada cosa ──────────────────────────────
// Columnas: par (lo que debería tener la casa) · casa · maleta · lavandería · falta (se calcula, nadie lo cuenta).
// Se deduce del ciclo más reciente; "Faltante" = par − lo que se sabe dónde está.
export function inventoryOf(bag, cycle) {
  const par = bag.standard || {}
  const items = Object.keys(par)
  if (!items.length) return { rows: [], totals: { par: 0, home: 0, bag: 0, laundry: 0, missing: 0 }, known: false }
  const state = cycle?.state || bag.state || null
  const sum = (kind) => { const m = {}; for (const s of cycle?.short || []) if (s.kind === kind) m[s.item] = (m[s.item] || 0) + (s.qty || 0); return m }
  const left = sum('left'), other = sum('other'), clean = sum('clean')
  const rows = items.map(item => {
    const p = par[item] || 0
    const l = Math.min(p, left[item] || 0)
    let home = 0, inBag = 0, laundry = 0, missing = 0
    if (!cycle || !state) { home = p; return { item, par: p, home, bag: 0, laundry: 0, missing: 0 } }
    if (state === 'Dirty') {
      home = l; missing = Math.min(p - l, other[item] || 0)
      inBag = Math.max(0, p - home - missing)
    } else if (state === 'Inspected' || state === 'Washing') {
      const c = cycle.counted?.counts?.[item]
      laundry = c != null ? c : Math.max(0, p - l - (other[item] || 0))
      home = l; missing = Math.max(0, p - laundry - home)
    } else if (state === 'Clean') {
      const c = cycle.finalContent?.counts?.[item]
      inBag = c != null ? c : p - l
      home = l; missing = Math.max(0, p - inBag - home)
    } else { // In Use: la maleta ya está en la casa
      const c = cycle.finalContent?.counts?.[item]
      home = (c != null ? c : p - l) + l; missing = Math.max(0, p - home)
    }
    void clean
    return { item, par: p, home, bag: inBag, laundry, missing }
  })
  const totals = rows.reduce((t, r) => ({ par: t.par + r.par, home: t.home + r.home, bag: t.bag + r.bag, laundry: t.laundry + r.laundry, missing: t.missing + r.missing }), { par: 0, home: 0, bag: 0, laundry: 0, missing: 0 })
  return { rows, totals, known: !!cycle }
}

// ── Dónde está cada maleta física ───────────────────────────────────────────
// where: casa (se quedó) · transito (declarada sucia, lavandería aún no la confirma) · cleaner (cargada/sin declarar)
//        lavanderia (recibida o limpia en lavandería) · uso (en la casa, en uso)
export function unitsOf(bag, cycle, cfg, now = Date.now()) {
  const days = (iso) => (iso ? Math.max(0, Math.round(((now - Date.parse(iso)) / 86400000) * 10) / 10) : null)
  const warn = cfg?.laundryDirtyWarnDays ?? 2, max = cfg?.laundryDirtyMaxDays ?? 3
  const lvl = (d) => (d == null ? 'ok' : d >= max ? 'red' : d >= warn ? 'amber' : 'ok')
  const st = cycle?.state || bag.state || null
  const out = cycle?.unitsOut || [], back = cycle?.unitsBack || [], rcv = cycle?.unitsRcv || []
  const res = []
  for (let n = 1; n <= (bag.qty || 1); n++) {
    const code = unitCode(bag, n)
    const b = back.find(u => u.unit === n)
    let where = 'lavanderia', label = 'En lavandería', since = null
    if (!cycle) { where = 'lavanderia'; label = 'En lavandería' }
    else if (st === 'In Use') {
      if (!out.length || out.includes(n)) { where = 'uso'; label = 'En uso (con el cleaner)'; since = cycle.loadedAt || cycle.openedAt }
    } else if (['Dirty', 'Inspected', 'Washing'].includes(st)) {
      if (b?.status === 'stay') { where = 'casa'; label = 'Se quedó en la casa'; since = cycle.dirtyAt }
      else if (b) {
        const received = st !== 'Dirty' || rcv.includes(n)
        if (!received) { where = 'transito'; label = b.place === 'bodega' ? 'En bodega ShineUp (sin confirmar en lavandería)' : b.place === 'lavanderia' ? 'Entregada en lavandería (por confirmar)' : 'En tránsito (sin confirmar)'; since = cycle.dirtyAt }
        else { where = 'lavanderia'; label = st === 'Washing' ? 'Lavando' : st === 'Inspected' ? 'En lavandería (inspeccionada)' : 'Recibida en lavandería'; since = null }
      } else if (out.includes(n)) { where = 'cleaner'; label = 'Sin declarar (con el cleaner)'; since = cycle.loadedAt || cycle.dirtyAt }
    } else if (st === 'Clean') {
      if (b?.status === 'stay') { where = 'casa'; label = 'Se quedó en la casa'; since = cycle.dirtyAt }
      else { where = 'lavanderia'; label = 'En lavandería (limpia)' }
    }
    const d = days(since)
    res.push({ n, code, where, label, days: d, level: where === 'lavanderia' || where === 'uso' ? 'ok' : lvl(d) })
  }
  return res
}

export async function buildBoard() {
  const t0 = Date.now()
  const today = todayET()
  const [{ cfg, fromTars }, maps, bagRecs] = await Promise.all([loadConfig(), loadNameMaps(), listAll(T.bags)])
  const items = detectItems(bagRecs)
  const bags = bagRecs.map(r => normalizeBag(r, items, maps.propMap))
  const cycleRecs = await getByIds(T.cycles, bags.map(b => b.lastCycleId))
  const cycleById = {}; for (const c of cycleRecs) cycleById[c.id] = normalizeCycle(c, maps.staffMap)
  const extraWarnings = []
  const [{ recs: incRecs, warnings: incWarnings }, nextMap] = await Promise.all([
    loadOpenLaundryIncidents(),
    nextCleaningByProperty(today).catch(e => { extraWarnings.push(`No pude leer los cleanings próximos: ${e.message}`); return {} }),
  ])
  const warnings = [...incWarnings, ...extraWarnings]
  const bagNameById = {}; for (const b of bags) bagNameById[b.id] = b.code || b.name
  const incidents = incRecs.map(r => normalizeIncident(r, { ...maps, bagMap: bagNameById }))
  const incByBag = {}; for (const i of incidents) if (i.bagId) (incByBag[i.bagId] ||= []).push(i)

  const now = Date.now()
  const out = bags.map(b => {
    const cycle = b.lastCycleId ? cycleById[b.lastCycleId] || null : null
    const state = b.state || cycle?.state || null
    const open = incByBag[b.id] || []
    let daysDirty = null
    if (cycle?.dirtyAt && state && DIRTY_STATES.includes(state)) daysDirty = round1((now - Date.parse(cycle.dirtyAt)) / 86400000)
    let dirtyLevel = 'ok'
    if (daysDirty != null) dirtyLevel = daysDirty >= cfg.laundryDirtyMaxDays ? 'red' : daysDirty >= cfg.laundryDirtyWarnDays ? 'amber' : 'ok'
    let next = null
    for (const p of b.properties) {
      const n = nextMap[p.id]
      if (n && (!next || n.date < next.date)) next = { ...n, propertyId: p.id, propertyName: p.name }
    }
    const daysToNext = next ? dayDiff(today, next.date) : null
    let risk = 'ok'
    if (state && DIRTY_STATES.includes(state) && daysToNext != null) {
      risk = daysToNext <= cfg.laundryRiskRedDays ? 'red' : daysToNext <= cfg.laundryRiskAmberDays ? 'amber' : 'ok'
    }
    return {
      ...b, state, cycle, daysDirty, dirtyLevel, nextCleaning: next, daysToNext, risk,
      alert: RANK[risk] >= RANK[dirtyLevel] ? risk : dirtyLevel,
      semaforo: semaforoOf(open, cycle), openIncidents: open.length,
      inventory: inventoryOf(b, cycle),
      units: unitsOf(b, cycle, cfg),
    }
  })

  out.sort((a, b) =>
    RANK[b.alert] - RANK[a.alert] ||
    (a.daysToNext ?? 999) - (b.daysToNext ?? 999) ||
    (b.daysDirty ?? -1) - (a.daysDirty ?? -1) ||
    String(a.code || a.name).localeCompare(String(b.code || b.name)))

  const counts = Object.fromEntries(STATES.map(s => [s, 0])); counts['Sin estado'] = 0
  for (const b of out) counts[b.state || 'Sin estado']++
  const summary = {
    counts,
    atRisk: out.filter(b => b.risk !== 'ok').length,
    atRisk48h: out.filter(b => DIRTY_STATES.includes(b.state) && b.daysToNext != null && b.daysToNext <= 2).length,
    dirtyOverLimit: out.filter(b => b.dirtyLevel === 'red').length,
    openIncidents: incidents.length,
    withoutCode: out.filter(b => !b.code).length,
    unitsAtHome: out.reduce((n, b) => n + b.units.filter(u => u.where === 'casa').length, 0),
    unitsInTransit: out.reduce((n, b) => n + b.units.filter(u => u.where === 'transito').length, 0),
    totalBags: out.reduce((n, b) => n + (b.qty || 1), 0),
    withoutCodeBags: out.filter(b => !b.code).reduce((n, b) => n + (b.qty || 1), 0),
    missingPieces: out.reduce((n, b) => n + (b.inventory?.totals.missing || 0), 0),
    bagsWithMissing: out.filter(b => (b.inventory?.totals.missing || 0) > 0).length,
  }
  return {
    today, config: cfg, bags: out, summary,
    debug: { items, fromTars, bagCount: bags.length, cyclesLoaded: cycleRecs.length, incidentsOpen: incidents.length, upcomingProps: Object.keys(nextMap).length, warnings, ms: Date.now() - t0 },
  }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null)
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const p90 = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)] }

export async function buildKpis({ from, to }) {
  const t0 = Date.now()
  const today = todayET()
  const toD = to || today
  const fromD = from || new Date(Date.now() - 29 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const dayBefore = new Date(Date.parse(fromD + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10)
  const [maps, bagRecs] = await Promise.all([loadNameMaps(), listAll(T.bags)])
  const items = detectItems(bagRecs)
  const bags = bagRecs.map(r => normalizeBag(r, items, maps.propMap))
  const bagName = {}; for (const b of bags) bagName[b.id] = b.code || b.name
  const warnings = []

  let cycleRecs = []
  try { cycleRecs = await listAll(T.cycles, { filter: `IS_AFTER({${FC.dirtyAt}}, '${dayBefore}')`, max: 4000 }) }
  catch (e) { warnings.push(`No pude leer Ciclo de Maleta: ${e.message}`) }
  const etDay = (iso) => { const t = Date.parse(iso || ''); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) }
  const inRange = (iso) => { const d = etDay(iso); return !!d && d >= fromD && d <= toD }
  const cycles = cycleRecs.map(r => normalizeCycle(r, maps.staffMap)).filter(c => inRange(c.dirtyAt))

  let incRecs = []
  try { incRecs = await listAll(T.incidents, { filter: `{${FI.category}}='${CATEGORY_LAUNDRY}'`, max: 4000 }) }
  catch (e) { warnings.push(`No pude leer incidentes: ${e.message}`) }
  const incidents = incRecs.map(r => normalizeIncident(r, { ...maps, bagMap: bagName })).filter(i => inRange(i.created))

  const cycleH = [], inspectH = [], washH = []
  for (const c of cycles) {
    const a = hoursBetween(c.dirtyAt, c.readyAt); if (a != null && a >= 0) cycleH.push(a)
    const b = hoursBetween(c.dirtyAt, c.inspectedAt); if (b != null && b >= 0) inspectH.push(b)
    const w = hoursBetween(c.washStart, c.washEnd); if (w != null && w >= 0) washH.push(w)
  }
  const opened = cycles.filter(c => c.openedAt)
  const onTime = opened.filter(c => c.readyAt && Date.parse(c.readyAt) <= Date.parse(c.openedAt)).length
  const ext = cycles.filter(c => c.washPlace === 'Externa')
  const byWasher = {}
  for (const c of cycles) if (c.washedBy) { const k = c.washedBy; (byWasher[k] ||= { name: k, cycles: 0, hours: [] }).cycles++; const h = hoursBetween(c.washStart, c.washEnd); if (h != null && h >= 0) byWasher[k].hours.push(h) }

  const countBy = (arr, key) => { const m = {}; for (const x of arr) { const k = x[key] || '—'; m[k] = (m[k] || 0) + 1 } return Object.entries(m).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n) }
  const cyclesByBag = {}
  for (const c of cycles) { const k = bagName[c.bagId] || '?'; (cyclesByBag[k] ||= { name: k, cycles: 0, special: 0, incidents: 0 }).cycles++; if (c.special) cyclesByBag[k].special++ }
  for (const i of incidents) { const k = i.bagName || '?'; (cyclesByBag[k] ||= { name: k, cycles: 0, special: 0, incidents: 0 }).incidents++ }
  const daily = {}
  for (const c of cycles) if (c.readyAt) { const d = etDay(c.readyAt); daily[d] = (daily[d] || 0) + 1 }

  return {
    from: fromD, to: toD,
    cycles: cycles.length,
    cycleTime: { avgH: round1(avg(cycleH)), medianH: round1(median(cycleH)), p90H: round1(p90(cycleH)), n: cycleH.length },
    inspectionDelayAvgH: round1(avg(inspectH)),
    washDurationAvgH: round1(avg(washH)),
    onTime: { pct: pct(onTime, opened.length), onTime, total: opened.length },
    specialPct: pct(cycles.filter(c => c.special).length, cycles.length),
    shortPct: pct(cycles.filter(c => !c.sendAll).length, cycles.length),
    rewashPct: pct(cycles.filter(c => c.rewash).length, cycles.length),
    external: { pct: pct(ext.length, cycles.length), cycles: ext.length },
    washers: Object.values(byWasher).map(w => ({ name: w.name, cycles: w.cycles, avgWashH: round1(avg(w.hours)) })).sort((a, b) => b.cycles - a.cycles),
    incidents: {
      total: incidents.length,
      open: incidents.filter(i => i.status !== 'Closed').length,
      per100: cycles.length ? round1((incidents.length / cycles.length) * 100) : null,
      byType: countBy(incidents, 'type'), byItem: countBy(incidents, 'item'),
    },
    bags: { out: cycles.reduce((s, c) => s + (c.bagsOut || 0), 0), back: cycles.reduce((s, c) => s + (c.bagsBack || 0), 0), cyclesWithGap: cycles.filter(c => c.bagsOut != null && c.bagsBack != null && c.bagsBack < c.bagsOut).length },
    replaced: (() => { const t = {}; for (const c of cycles) for (const [k, n] of Object.entries(c.finalContent?.added || {})) t[k] = (t[k] || 0) + n; return Object.entries(t).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n) })(),
    worstBags: Object.values(cyclesByBag).sort((a, b) => (b.incidents + b.special) - (a.incidents + a.special)).slice(0, 8),
    daily: Object.entries(daily).sort().map(([date, n]) => ({ date, n })),
    debug: { warnings, ms: Date.now() - t0, cycleRecords: cycleRecs.length, incidentRecords: incRecs.length },
  }
}
