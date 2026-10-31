import { T, FB, FC, FI, STATES, CATEGORY_LAUNDRY, INCIDENT_TYPES, INCIDENT_STAGES } from './schema.js'
import { listAll, getRecord, createRecord, updateRecord, updateMany, getByIds } from './airtable.js'
import { HttpError, permissions } from './auth.js'
import {
  todayET, nowISO, first, parseJSON, buildBoard, normState, loadConfig, loadNameMaps, detectItems, normalizeBag, resolveCode,
  normalizeCycle, parseUnits, unitsText, codeParts, unitCode, normalizeIncident, semaforoOf, loadOpenLaundryIncidents,
} from './model.js'

const CONDITIONS = ['Bueno', 'Normal', 'Malo']

// ── helpers ──────────────────────────────────────────────────────────────────
async function loadBags() {
  const [maps, recs] = await Promise.all([loadNameMaps(), listAll(T.bags)])
  const items = detectItems(recs)
  const bags = recs.map(r => normalizeBag(r, items, maps.propMap))
  return { maps, items, bags }
}
function needBag(ctx, id) {
  const b = ctx.bags.find(x => x.id === id)
  if (!b) throw new HttpError(404, 'No encontré esa maleta (Bag)')
  return b
}
async function currentCycleRecord(bag) {
  if (!bag.lastCycleId) return null
  try { return await getRecord(T.cycles, bag.lastCycleId) } catch { return null }
}
function logAppend(prev, ev) {
  const arr = parseJSON(prev, [])
  arr.push(ev)
  return JSON.stringify(arr.slice(-60))
}
const staffName = (ctx, profile) => ctx.maps.staffMap[profile.staff_airtable_id] || profile.full_name || profile.email || '?'
const cleanPhotos = (p) => (Array.isArray(p) ? p.filter(x => typeof x === 'string' && /^https?:\/\//.test(x)).slice(0, 8) : [])
const cleanCounts = (obj, items) => {
  const out = {}
  for (const it of items) { const n = Number(obj?.[it]); if (Number.isFinite(n) && n >= 0) out[it] = Math.round(n) }
  return out
}

async function createLaundryIncident(ctx, a) {
  const label = a.bag.code || a.bag.name
  const fields = {
    [FI.name]: a.name || `${label} · ${a.type}${a.item ? ` · ${a.item}` : ''}${a.qty ? ` ×${a.qty}` : ''}`,
    [FI.status]: 'Reported',
    [FI.category]: CATEGORY_LAUNDRY,
    [FI.bag]: [a.bag.id],
  }
  if (a.cycleId) fields[FI.cycle] = [a.cycleId]
  if (a.propertyId) fields[FI.property] = [a.propertyId]
  if (a.cleaningId) fields[FI.cleaningId] = [a.cleaningId]
  if (a.staffId) fields[FI.reportedBy] = [a.staffId]
  if (a.item) fields[FI.item] = a.item
  const photos = cleanPhotos(a.photos)
  if (photos[0]) fields[FI.media] = photos[0]
  const extra = photos.slice(1).map((u, i) => `Foto ${i + 2}: ${u}`).join('\n')
  const comment = [a.stage ? `[${a.stage}]` : '', a.unit ? `Maleta #${a.unit}` : '', a.comment, extra].filter(Boolean).join('\n')
  if (comment) fields[FI.comment] = comment
  const created = await createRecord(T.incidents, fields)
  // la etapa en que se detectó queda grabada en la bitácora del ciclo
  if (a.cycleId) {
    try {
      const cyc = await getRecord(T.cycles, a.cycleId)
      await updateRecord(T.cycles, a.cycleId, { [FC.log]: logAppend(cyc.fields?.[FC.log], { at: nowISO(), by: a.byName || '', stage: `Incidente (${a.stage || 'sin etapa'})`, note: fields[FI.name], photos }) })
    } catch { /* la bitácora es secundaria */ }
  }
  return created
}

async function propertyOfCleaning(cleaningId) {
  if (!cleaningId) return null
  try { const r = await getRecord(T.cleanings, cleaningId); return first(r.fields?.Property) || null } catch { return null }
}

// ── lecturas ─────────────────────────────────────────────────────────────────
export async function actMe({ profile }) {
  return { profile: { id: profile.id, email: profile.email, role: profile.role, full_name: profile.full_name, staff_airtable_id: profile.staff_airtable_id, laundry_access: !!profile.laundry_access }, permissions: permissions(profile) }
}

export async function actConfig() {
  const { cfg, fromTars } = await loadConfig()
  return { config: cfg, fromTars, states: STATES, incidentTypes: INCIDENT_TYPES, incidentStages: INCIDENT_STAGES, conditions: CONDITIONS }
}

export async function actBag({ query }) {
  const ctx = await loadBags()
  let hit = null
  if (query.id) { const b = ctx.bags.find(x => x.id === query.id); hit = b ? { bag: b, unit: null } : null }
  else hit = resolveCode(query.code, ctx.bags)
  if (!hit) throw new HttpError(404, `No encontré la maleta ${query.code || query.id}`)
  const rec = await currentCycleRecord(hit.bag)
  const semaforo = await bagSemaforo(hit.bag.id, rec ? normalizeCycle(rec, ctx.maps.staffMap) : null).catch(() => 'verde')
  return { bag: hit.bag, unit: hit.unit, cycle: rec ? normalizeCycle(rec, ctx.maps.staffMap) : null, items: ctx.items, semaforo }
}

export async function actBagsByProperty({ query }) {
  const ctx = await loadBags()
  const pid = query.propertyId
  if (!pid) throw new HttpError(400, 'propertyId requerido')
  const mine = ctx.bags.filter(b => b.properties.some(p => p.id === pid))
  const out = []
  for (const b of mine) {
    const rec = await currentCycleRecord(b)
    const cycle = rec ? normalizeCycle(rec, ctx.maps.staffMap) : null
    out.push({ ...b, cycle, declaredForThisCleaning: !!(query.cleaningId && cycle && cycle.cleaningCloseId === query.cleaningId && cycle.state === 'Dirty') })
  }
  return { bags: out, items: ctx.items }
}

export async function actCycle({ query }) {
  const ctx = await loadBags()
  const rec = await getRecord(T.cycles, query.id)
  const cycle = normalizeCycle(rec, ctx.maps.staffMap)
  const bag = ctx.bags.find(b => b.id === cycle.bagId) || null
  const bagMap = Object.fromEntries(ctx.bags.map(b => [b.id, b.code || b.name]))
  let incidents = []
  try {
    const recs = await listAll(T.incidents, { filter: `{${FI.category}}='${CATEGORY_LAUNDRY}'`, max: 1000 })
    incidents = recs.filter(r => first(r.fields?.[FI.cycle]) === cycle.id).map(r => normalizeIncident(r, { ...ctx.maps, bagMap }))
  } catch { /* sin incidentes legibles */ }
  return { cycle, bag, incidents }
}

export async function actIncidents({ query }) {
  const ctx = await loadBags()
  const bagMap = Object.fromEntries(ctx.bags.map(b => [b.id, b.code || b.name]))
  const warnings = []
  let recs = []
  const status = query.status || 'open'
  const filter = status === 'open' ? `AND({${FI.category}}='${CATEGORY_LAUNDRY}',{${FI.status}}!='Closed')`
    : status === 'closed' ? `AND({${FI.category}}='${CATEGORY_LAUNDRY}',{${FI.status}}='Closed')`
    : `{${FI.category}}='${CATEGORY_LAUNDRY}'`
  try { recs = await listAll(T.incidents, { filter, sort: [{ field: FI.created, dir: 'desc' }], max: 1000 }) }
  catch (e) { warnings.push(`No pude leer incidentes: ${e.message}`) }
  const staff = Object.entries(ctx.maps.staffMap).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { incidents: recs.map(r => normalizeIncident(r, { ...ctx.maps, bagMap })), staff, warnings }
}

export async function actStaff() {
  const ctx = await loadBags()
  return { staff: Object.entries(ctx.maps.staffMap).map(([id, name]) => ({ id, name })).sort((x, y) => String(x.name).localeCompare(String(y.name))) }
}

export async function actLabels() {
  const ctx = await loadBags()
  // Cliente por maleta (solo lectura; si falla se usa el prefijo de «Name»)
  let clientOf = (b) => String(b.name || '').split('_')[0]
  try { clientOf = await resolveClients(ctx.bags) } catch { /* sin nombres de cliente */ }
  return { bags: ctx.bags.map(b => ({ id: b.id, client: clientOf(b) || '', code: b.code, name: b.name, qty: b.qty, properties: b.properties.map(p => p.name), codeLabel: b.codeLabel, codes: b.code ? Array.from({ length: Math.max(1, b.qty) }, (_, i) => unitCode(b, i + 1)) : [] })) }
}

// ── códigos: M-AH-GL-1 (M + 2 letras del cliente + 2 de la propiedad + nº de maleta) ──
// El número sigue corrido entre casas que comparten las mismas letras, así cada maleta física queda única.
// 2 caracteres: las 2 primeras letras de la primera palabra con 3+ letras (salta «N», «E», «St» de las direcciones);
// si no hay ninguna (p. ej. «387 E 16 th»), las 2 primeras letras/dígitos del texto («38»).
const initials2 = (txt) => {
  const clean = String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const word = clean.split(/[^A-Za-z]+/).filter(Boolean).find(w => w.length >= 3)
  if (word) return word.slice(0, 2).toUpperCase()
  return (clean.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) + 'XX').slice(0, 2).toUpperCase()
}
export function prefixFor(bag) {
  const parts = String(bag.name || '').split('_')
  const client = bag.client || parts[0] || bag.name // el cliente sale del lookup «Client» de la tabla; si no existe, del Name
  const prop = bag.properties?.[0]?.name || parts[1] || ''
  return `M-${initials2(client)}-${initials2(prop)}`
}

// ── escrituras (cleaner / Ops) ───────────────────────────────────────────────
export async function actDeclareReturn({ profile, body }) {
  if (!body.cleaningId) throw new HttpError(400, 'cleaningId requerido')
  const ctx = await loadBags()
  const bag = needBag(ctx, body.bagId)
  const staffId = profile.staff_airtable_id || null
  const prev = await currentCycleRecord(bag)
  let prevOut = null, prevUnits = []
  if (prev) {
    const st = normState(prev.fields?.[FC.state])
    if (first(prev.fields?.[FC.cleaningClose]) === body.cleaningId && st === 'Dirty') {
      return { ok: true, duplicate: true, cycle: normalizeCycle(prev, ctx.maps.staffMap) }
    }
    if (!first(prev.fields?.[FC.cleaningUse]) && (st === 'In Use' || st === 'Clean')) {
      await updateRecord(T.cycles, prev.id, { [FC.cleaningUse]: [body.cleaningId] })
    }
    const pc = normalizeCycle(prev, ctx.maps.staffMap)
    prevOut = pc.bagsOut
    prevUnits = pc.unitsOut
  }
  const short = (Array.isArray(body.short) ? body.short : [])
    .map(s => ({ item: String(s.item || ''), qty: Math.round(Number(s.qty) || 0), reason: String(s.reason || '').slice(0, 200), kind: ['left', 'clean', 'other'].includes(s.kind) ? s.kind : 'other' }))
    .filter(s => ctx.items.includes(s.item) && s.qty > 0)
  // maletas físicas: dirty (regresa sucia) | clean (regresa limpia) | stay (se queda en la casa)
  const allUnits = prevUnits.length ? prevUnits : Array.from({ length: Math.max(1, bag.qty) }, (_, i) => i + 1)
  const given = Array.isArray(body.units) ? body.units : []
  const units = allUnits.map(u => {
    const g = given.find(x => Number(x.unit) === u)
    const status = ['dirty', 'clean', 'stay'].includes(g?.status) ? g.status : 'dirty'
    return { unit: u, status, place: status === 'dirty' && ['bodega', 'lavanderia'].includes(g?.place) ? g.place : null }
  })
  const unitsBack = units.filter(u => u.status !== 'stay').length
  const condition = CONDITIONS.includes(body.condition) ? body.condition : 'Normal'
  const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 8) : []
  const note = String(body.note || '').slice(0, 1000)
  const photos = cleanPhotos(body.photos)
  const at = nowISO()
  const allDirty = units.every(u => u.status === 'dirty')
  const fields = {
    [FC.name]: `${bag.code || bag.name} · ${todayET()}`,
    [FC.bag]: [bag.id],
    [FC.cleaningClose]: [body.cleaningId],
    [FC.state]: 'Dirty',
    [FC.dirtyAt]: at,
    [FC.condition]: condition,
    [FC.sendAll]: short.length === 0 && allDirty,
    [FC.special]: condition === 'Malo',
    [FC.bagsBack]: unitsBack,
    [FC.unitsSeen]: units.map(u => `${u.unit}=${u.status}${u.place ? '@' + u.place : ''}`).join(','),
    [FC.log]: JSON.stringify([{ at, by: staffName(ctx, profile), stage: 'Declaración', note, photos }]),
  }
  if (prevOut != null) fields[FC.bagsOut] = prevOut
  else if (prevUnits.length) fields[FC.bagsOut] = prevUnits.length
  if (staffId) fields[FC.declaredBy] = [staffId]
  if (tags.length) fields[FC.tags] = tags
  if (short.length) fields[FC.short] = JSON.stringify(short)
  if (note) fields[FC.cleanerNote] = note
  const created = await createRecord(T.cycles, fields)
  await updateRecord(T.bags, bag.id, { [FB.state]: 'Dirty', [FB.lastCycle]: [created.id] })
  return { ok: true, duplicate: false, cycle: normalizeCycle(created, ctx.maps.staffMap) }
}

export async function actMarkInUse({ profile, body }) {
  const ctx = await loadBags()
  const bag = needBag(ctx, body.bagId)
  const rec = await currentCycleRecord(bag)
  const at = nowISO()
  const by = staffName(ctx, profile)
  if (!rec) {
    const created = await createRecord(T.cycles, {
      [FC.name]: `${bag.code || bag.name} · ${todayET()} (inicio)`,
      [FC.bag]: [bag.id], [FC.state]: 'In Use', [FC.openedAt]: at,
      ...(body.cleaningId ? { [FC.cleaningUse]: [body.cleaningId] } : {}),
      [FC.log]: JSON.stringify([{ at, by, stage: 'In Use', note: 'Primer ciclo (sin historial previo)', photos: [] }]),
    })
    await updateRecord(T.bags, bag.id, { [FB.state]: 'In Use', [FB.lastCycle]: [created.id] })
    return { ok: true, warning: null, cycle: normalizeCycle(created, ctx.maps.staffMap) }
  }
  const prevState = normState(rec.fields?.[FC.state])
  if (prevState === 'In Use' && (!body.cleaningId || first(rec.fields?.[FC.cleaningUse]) === body.cleaningId)) {
    return { ok: true, duplicate: true, warning: null, cycle: normalizeCycle(rec, ctx.maps.staffMap) }
  }
  const warning = (prevState === 'Clean' || prevState === 'In Use') ? null : `La maleta estaba en estado "${prevState || 'sin estado'}" y no "Clean". Avisa a lavandería.`
  const patch = {
    [FC.state]: 'In Use', [FC.openedAt]: at,
    [FC.log]: logAppend(rec.fields?.[FC.log], { at, by, stage: 'In Use', note: warning || '', photos: [] }),
  }
  if (body.cleaningId) patch[FC.cleaningUse] = [body.cleaningId]
  const upd = await updateRecord(T.cycles, rec.id, patch)
  await updateRecord(T.bags, bag.id, { [FB.state]: 'In Use' })
  return { ok: true, warning, cycle: normalizeCycle(upd, ctx.maps.staffMap) }
}

export async function actLoadShift({ profile, body }) {
  const ctx = await loadBags()
  const at = nowISO()
  const by = staffName(ctx, profile)
  const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map(c => String(c).trim().toUpperCase()).filter(Boolean))]
  const loaded = [], unknown = []
  const perBag = new Map() // bagId → { bag, units:Set }
  for (const code of codes) {
    const hit = resolveCode(code, ctx.bags)
    if (!hit) { unknown.push(code); continue }
    const e = perBag.get(hit.bag.id) || { bag: hit.bag, units: new Set() }
    if (hit.unit) e.units.add(hit.unit)
    else for (let u = 1; u <= Math.max(1, hit.bag.qty); u++) e.units.add(u) // código sin sufijo = todas las maletas del conjunto
    perBag.set(hit.bag.id, e)
  }
  for (const { bag, units } of perBag.values()) {
    const list = [...units].sort((a, b) => a - b)
    const rec = await currentCycleRecord(bag)
    const st = normState(rec?.fields?.[FC.state]) || bag.state
    let warning = null
    if (!rec) {
      const created = await createRecord(T.cycles, {
        [FC.name]: `${bag.code || bag.name} · ${todayET()} (inicio)`,
        [FC.bag]: [bag.id], [FC.state]: 'In Use', [FC.loadedAt]: at, [FC.openedAt]: at,
        [FC.bagsOut]: list.length, [FC.unitsSeen]: `out:${list.join(',')}`,
        [FC.log]: JSON.stringify([{ at, by, stage: 'Carga de turno', note: 'Primer ciclo (sin historial previo)', photos: [] }]),
      })
      await updateRecord(T.bags, bag.id, { [FB.state]: 'In Use', [FB.lastCycle]: [created.id] })
    } else if (st === 'Clean' || st === 'In Use') {
      // si ya estaba In Use (misma jornada) se suman las maletas escaneadas
      const prevOut = st === 'In Use' ? parseUnits(rec.fields?.[FC.unitsSeen]).out : []
      const merged = [...new Set([...prevOut, ...list])].sort((a, b) => a - b)
      await updateRecord(T.cycles, rec.id, {
        [FC.state]: 'In Use', [FC.loadedAt]: rec.fields?.[FC.loadedAt] || at, [FC.openedAt]: rec.fields?.[FC.openedAt] || at,
        [FC.bagsOut]: merged.length, [FC.unitsSeen]: `out:${merged.join(',')}`,
        [FC.log]: logAppend(rec.fields?.[FC.log], { at, by, stage: 'Carga de turno', note: `Maletas: ${merged.join(',')}`, photos: [] }),
      })
      // Verificación: si dos cargas de la misma casa llegaron a la vez, una pudo pisar a la otra → releer y volver a fusionar.
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 350 + i * 300))
        let again = null
        try { again = await getRecord(T.cycles, rec.id) } catch { break }
        const seen = parseUnits(again.fields?.[FC.unitsSeen]).out
        const missing = list.filter(u => !seen.includes(u))
        const lost = merged.filter(u => !seen.includes(u))
        if (!missing.length && !lost.length) break
        const m2 = [...new Set([...seen, ...merged])].sort((a, b) => a - b)
        await updateRecord(T.cycles, rec.id, { [FC.bagsOut]: m2.length, [FC.unitsSeen]: `out:${m2.join(',')}` })
      }
      await updateRecord(T.bags, bag.id, { [FB.state]: 'In Use' })
    } else {
      warning = `Estado "${st || 'sin estado'}": todavía no está Clean (lavandería no la ha terminado)`
      await updateRecord(T.cycles, rec.id, {
        [FC.log]: logAppend(rec.fields?.[FC.log], { at, by, stage: 'Carga de turno', note: warning, photos: [] }),
      })
    }
    loaded.push({ bagId: bag.id, code: bag.code, name: bag.name, state: warning ? st : 'In Use', units: list, warning })
  }
  return { ok: true, loaded, unknown }
}


// Refrendo del cleaner (durante la limpieza): cuenta lo que trae la maleta contra lo que dice lavandería.
// Cada diferencia o pieza sucia se registra como incidente (etapa «En propiedad») y queda en la bitácora del ciclo.
export async function actRefrendo({ profile, body }) {
  const ctx = await loadBags()
  const bag = needBag(ctx, body.bagId)
  const rec = await currentCycleRecord(bag)
  const cyc = rec ? normalizeCycle(rec, ctx.maps.staffMap) : null
  const fc = cyc?.finalContent?.counts
  const expected = fc && Object.keys(fc).length ? fc : (bag.standard || {})
  const found = cleanCounts(body.counts, ctx.items)
  const dirty = Object.entries(cleanCounts(body.dirty, ctx.items)).filter(([, n]) => n > 0)
  const staffId = profile.staff_airtable_id || null
  const propertyId = await propertyOfCleaning(body.cleaningId)
  const comment = String(body.note || '').slice(0, 800)
  const base = { bag, cycleId: cyc?.id || null, propertyId, cleaningId: body.cleaningId, staffId, stage: 'En propiedad', photos: body.photos, byName: staffName(ctx, profile) }
  const made = []
  const lines = []
  for (const it of Object.keys(found)) {
    const exp = expected[it] || 0, diff = found[it] - exp
    if (diff < 0) { made.push(await createLaundryIncident(ctx, { ...base, type: 'Faltante', item: it, qty: -diff, comment: `No vino completo: dice ${exp}, encontré ${found[it]}. ${comment}`.trim() })); lines.push(`${it} −${-diff}`) }
    else if (diff > 0) { made.push(await createLaundryIncident(ctx, { ...base, type: 'Sobrante', item: it, qty: diff, comment: `Vino de más: dice ${exp}, encontré ${found[it]}. ${comment}`.trim() })); lines.push(`${it} +${diff}`) }
  }
  for (const [it, n] of dirty) { made.push(await createLaundryIncident(ctx, { ...base, type: 'Sucio / Manchado', item: it, qty: n, comment: `Vino sucio/manchado. ${comment}`.trim() })); lines.push(`${it} sucio ×${n}`) }
  if (rec) {
    try {
      await updateRecord(T.cycles, rec.id, { [FC.log]: logAppend(rec.fields?.[FC.log], { at: nowISO(), by: staffName(ctx, profile), stage: 'Refrendo cleaner', note: lines.length ? `Diferencias: ${lines.join(', ')}${comment ? ' | ' + comment : ''}` : `Todo coincide${comment ? ' | ' + comment : ''}`, photos: cleanPhotos(body.photos) }) })
    } catch { /* la bitácora es secundaria */ }
  }
  return { ok: true, incidentsCreated: made.length, matches: lines.length === 0 }
}

export async function actReportBagIncident({ profile, body }) {
  const ctx = await loadBags()
  const bag = needBag(ctx, body.bagId)
  if (!INCIDENT_TYPES.includes(body.type)) throw new HttpError(400, 'Tipo de incidente inválido')
  const p = permissions(profile)
  const stage = INCIDENT_STAGES.includes(body.stage) ? body.stage : (p.laundry && !body.cleaningId ? 'Inspeccion' : 'En propiedad')
  const item = ctx.items.includes(body.item) ? body.item : null
  const rec = await createLaundryIncident(ctx, {
    bag, cycleId: body.cycleId || bag.lastCycleId, propertyId: body.propertyId || (await propertyOfCleaning(body.cleaningId)),
    cleaningId: body.cleaningId, staffId: profile.staff_airtable_id, type: body.type, stage, item,
    qty: Math.round(Number(body.qty) || 0) || null, unit: Math.round(Number(body.unit) || 0) || null,
    comment: String(body.comment || '').slice(0, 1000), photos: body.photos,
  })
  return { ok: true, id: rec.id }
}

// ── escrituras (lavandería) ──────────────────────────────────────────────────
const expectedOf = (bag, short) => {
  const exp = { ...bag.standard }
  for (const s of short || []) if (exp[s.item] != null) exp[s.item] = Math.max(0, exp[s.item] - s.qty)
  return exp
}

export async function actInspect({ profile, body }) {
  const ctx = await loadBags()
  const rec = await getRecord(T.cycles, body.cycleId)
  const cyc = normalizeCycle(rec, ctx.maps.staffMap)
  if (cyc.state !== 'Dirty') throw new HttpError(409, `Este ciclo está en "${cyc.state || 'sin estado'}"; solo se inspecciona una maleta Dirty`)
  const bag = needBag(ctx, cyc.bagId)
  const expected = expectedOf(bag, cyc.short)
  const counts = { ...expected, ...cleanCounts(body.counts, ctx.items) }
  const damaged = cleanCounts(body.damaged, ctx.items)
  const stained = cleanCounts(body.stained, ctx.items)
  const staffId = profile.staff_airtable_id || null
  const propertyId = await propertyOfCleaning(cyc.cleaningCloseId)
  const base = { byName: staffName(ctx, profile), bag, cycleId: cyc.id, propertyId, cleaningId: cyc.cleaningCloseId, staffId, stage: 'Inspeccion', photos: body.photos }
  const made = []
  const explained = []
  let diffs = 0
  for (const it of new Set([...Object.keys(expected), ...Object.keys(counts)])) {
    const d = (counts[it] || 0) - (expected[it] || 0)
    if (d < 0) {
      diffs++
      // Si el cleaner dejó una maleta completa en la casa, el faltante se explica solo (no se crea incidente) salvo que lavandería pida reportarlo
      if (cyc.stayedUnits > 0 && !body.reportMissing) explained.push({ item: it, qty: -d })
      else made.push(await createLaundryIncident(ctx, { ...base, type: 'Faltante', item: it, qty: -d, comment: 'Faltó al abrir la maleta' }))
    }
    if (d > 0) { diffs++; made.push(await createLaundryIncident(ctx, { ...base, type: 'Sobrante', item: it, qty: d, comment: 'Venía de más al abrir la maleta' })) }
  }
  for (const [it, n] of Object.entries(damaged)) if (n > 0) { diffs++; made.push(await createLaundryIncident(ctx, { ...base, type: 'Dañado', item: it, qty: n })) }
  for (const [it, n] of Object.entries(stained)) if (n > 0) { diffs++; made.push(await createLaundryIncident(ctx, { ...base, type: 'Sucio / Manchado', item: it, qty: n })) }
  const hasFlags = Object.values(damaged).some(n => n > 0) || Object.values(stained).some(n => n > 0)
  const at = nowISO()
  const patch = {
    [FC.state]: 'Inspected', [FC.inspectedAt]: at,
    [FC.counted]: JSON.stringify({ expected, counts, damaged, stained }),
    [FC.endorsement]: diffs === 0 ? 'Confirmó' : 'Corrigió',
    [FC.special]: cyc.special || hasFlags,
    [FC.log]: logAppend(rec.fields?.[FC.log], { at, by: staffName(ctx, profile), stage: 'Inspección', note: [String(body.note || '').slice(0, 1000), explained.length ? `Faltantes explicados por maleta(s) en la casa: ${explained.map(e => `${e.item} −${e.qty}`).join(', ')}` : ''].filter(Boolean).join(' | '), photos: cleanPhotos(body.photos) }),
  }
  if (cyc.unitsBack.length) patch[FC.unitsSeen] = unitsText({ back: cyc.unitsBack, rcv: returnedUnits(cyc) }) // se asume recibido todo lo que el cleaner devolvió
  if (staffId) patch[FC.inspectedBy] = [staffId]
  const upd = await updateRecord(T.cycles, cyc.id, patch)
  await updateRecord(T.bags, bag.id, { [FB.state]: 'Inspected' })
  return { ok: true, incidentsCreated: made.length, explained, endorsement: diffs === 0 ? 'Confirmó' : 'Corrigió', cycle: normalizeCycle(upd, ctx.maps.staffMap) }
}

export async function actStartWash({ profile, body }) {
  const ctx = await loadBags()
  const rec = await getRecord(T.cycles, body.cycleId)
  const cyc = normalizeCycle(rec, ctx.maps.staffMap)
  if (cyc.state !== 'Inspected' && !body.force) throw new HttpError(409, `Falta la inspección (estado actual: "${cyc.state || 'sin estado'}")`)
  const bag = needBag(ctx, cyc.bagId)
  const place = body.place === 'Externa' ? 'Externa' : 'Propia'
  const at = nowISO()
  const patch = {
    [FC.state]: 'Washing', [FC.washStart]: at, [FC.washPlace]: place,
    [FC.log]: logAppend(rec.fields?.[FC.log], { at, by: staffName(ctx, profile), stage: 'Inicio lavado', note: place, photos: [] }),
  }
  if (profile.staff_airtable_id) patch[FC.washedBy] = [profile.staff_airtable_id]
  const upd = await updateRecord(T.cycles, cyc.id, patch)
  await updateRecord(T.bags, bag.id, { [FB.state]: 'Washing' })
  return { ok: true, cycle: normalizeCycle(upd, ctx.maps.staffMap) }
}

export async function actFinishWash({ profile, body }) {
  const ctx = await loadBags()
  // Maleta sin ciclo vinculado (registro de prueba): solo se pasa la maleta a Clean
  if (!body.cycleId) {
    const b0 = needBag(ctx, body.bagId)
    if (b0.state !== 'Washing') throw new HttpError(409, `La maleta está en "${b0.state || 'sin estado'}", no Washing`)
    await updateRecord(T.bags, b0.id, { [FB.state]: 'Clean' })
    return { ok: true, incidentsCreated: 0, noCycle: true }
  }
  const rec = await getRecord(T.cycles, body.cycleId)
  const cyc = normalizeCycle(rec, ctx.maps.staffMap)
  const bag = needBag(ctx, cyc.bagId || body.bagId)
  // Ciclo sin estado (registro creado/editado a mano en Airtable) pero la maleta SÍ está en Washing: se deja terminar y el ciclo queda coherente.
  if (cyc.state !== 'Washing' && !(!cyc.state && bag.state === 'Washing')) throw new HttpError(409, `Este ciclo está en "${cyc.state || 'sin estado'}", no Washing`)
  const afterInspection = cyc.counted?.counts || cyc.counted?.expected || bag.standard
  const discarded = cleanCounts(body.discarded, ctx.items)
  const expectedFinal = {}
  for (const it of Object.keys(afterInspection)) expectedFinal[it] = Math.max(0, (afterInspection[it] || 0) - (discarded[it] || 0))
  const counts = { ...expectedFinal, ...cleanCounts(body.counts, ctx.items) }
  const added = Object.fromEntries(Object.entries(cleanCounts(body.added, ctx.items)).filter(([, n]) => n > 0)) // piezas nuevas que lavandería agrega
  const staffId = profile.staff_airtable_id || null
  const propertyId = await propertyOfCleaning(cyc.cleaningCloseId)
  const made = []
  for (const it of new Set([...Object.keys(expectedFinal), ...Object.keys(counts)])) {
    const d = (counts[it] || 0) - (expectedFinal[it] || 0)
    if (d < 0) made.push(await createLaundryIncident(ctx, { bag, cycleId: cyc.id, propertyId, cleaningId: cyc.cleaningCloseId, staffId, stage: 'Lavado', type: 'Faltante', item: it, qty: -d, comment: 'Se perdió durante el lavado (salió menos de lo que entró)', photos: body.photos }))
  }
  const at = nowISO()
  const patch = {
    [FC.state]: 'Clean', [FC.washEnd]: at, [FC.readyAt]: at,
    [FC.finalContent]: JSON.stringify({ counts: Object.fromEntries(Object.keys({ ...counts, ...added }).map(k => [k, (counts[k] || 0) + (added[k] || 0)])), discarded, expected: expectedFinal, added }),
    [FC.rewash]: !!body.rewash,
    [FC.log]: logAppend(rec.fields?.[FC.log], { at, by: staffName(ctx, profile), stage: 'Clean', note: [String(body.note || '').slice(0, 1000), Object.keys(added).length ? `Piezas nuevas agregadas: ${Object.entries(added).map(([k, n]) => `${k} +${n}`).join(', ')}` : ''].filter(Boolean).join(' | '), photos: cleanPhotos(body.photos) }),
  }
  if (staffId) patch[FC.packedBy] = [staffId]
  if (!cyc.bagId) patch[FC.bag] = [bag.id]
  const upd = await updateRecord(T.cycles, cyc.id, patch)
  await updateRecord(T.bags, bag.id, { [FB.state]: 'Clean' })
  // incidentes abiertos de este conjunto cuyo ítem se repuso: se sugiere cerrarlos con «Reemplazado» (no se cierran solos)
  let suggestClose = []
  if (Object.keys(added).length) {
    try {
      const { recs } = await loadOpenLaundryIncidents()
      suggestClose = recs.map(r => normalizeIncident(r)).filter(i => i.bagId === bag.id && added[i.item] && ['Faltante', 'Dañado', 'Sucio / Manchado'].includes(i.type)).map(i => ({ id: i.id, item: i.item, type: i.type, qty: i.qty }))
    } catch { /* sin sugerencias */ }
  }
  return { ok: true, incidentsCreated: made.length, suggestClose, cycle: normalizeCycle(upd, ctx.maps.staffMap) }
}

export async function actUpdateIncident({ body }) {
  const rec = await getRecord(T.incidents, body.id)
  const f = rec.fields || {}
  if (f[FI.category] !== CATEGORY_LAUNDRY) throw new HttpError(400, 'Este incidente no es de lavandería')
  const patch = {}
  if (body.status) {
    if (!['Reported', 'In Progress', 'Closed'].includes(body.status)) throw new HttpError(400, 'Status inválido')
    patch[FI.status] = body.status
  }
  if (body.ownerId !== undefined) patch[FI.owner] = body.ownerId ? [body.ownerId] : []
  if (body.closeComment !== undefined) patch[FI.closeComment] = String(body.closeComment).slice(0, 1000)
  const finalClose = patch[FI.closeComment] !== undefined ? patch[FI.closeComment] : f[FI.closeComment]
  if (patch[FI.status] === 'Closed' && !String(finalClose || '').trim()) throw new HttpError(400, 'Para cerrar el incidente escribe qué se hizo para resolverlo')
  const upd = await updateRecord(T.incidents, rec.id, patch)
  return { ok: true, id: upd.id }
}

// «Client» en Laundry Bags es un lookup de un campo ligado: la API devuelve ids (recXXXX) y no nombres → se resuelven en la tabla Clients.
const REC_ID = /^rec[A-Za-z0-9]{14}$/
async function resolveClients(bags) {
  const ids = [...new Set(bags.map(b => b.client).filter(c => REC_ID.test(c || '')))]
  const names = {}
  if (ids.length) {
    try {
      for (const r of await getByIds('Clients', ids)) {
        const f = r.fields || {}
        names[r.id] = f.Name || f['Client Name'] || f.Client || Object.values(f).find(v => typeof v === 'string' && v.trim()) || null
      }
    } catch { /* sin nombres: se usa el Name de la maleta */ }
  }
  return (b) => (REC_ID.test(b.client || '') ? names[b.client] || null : b.client) || String(b.name || '').split('_')[0]
}


// Un prefijo único por casa (así cada casa empieza en -1 y el número no "corre" entre casas).
// 1) M + 2 letras del cliente + 2 de la propiedad. 2) Si dos casas comparten prefijo, TODAS las de ese grupo usan
// inicial + último carácter del nombre («Indianola 1» → I1, «Indianola 2» → I2, «47 Clark B» → CB). 3) Si aún choca: inicial + 1…9, luego A…Z.
export function assignPrefixes(items, takenIn = new Set()) {
  const alnum = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const base = (it) => `M-${initials2(it.client)}-${initials2(it.prop)}`
  const alt = (it) => {
    const letters = String(it.prop || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z]+/).filter(Boolean).find(w => w.length >= 3) || ''
    const first = (letters[0] || alnum(it.prop)[0] || 'X').toUpperCase()
    const tail = alnum(it.prop).slice(-1) || 'X'
    return `M-${initials2(it.client)}-${first}${tail}`
  }
  const taken = new Set(takenIn)
  const out = {}
  const groups = {}
  for (const it of items) (groups[base(it)] ||= []).push(it)
  for (const [b0, list] of Object.entries(groups)) {
    const clash = list.length > 1 || taken.has(b0)
    for (const it of list) {
      let cand = clash ? alt(it) : b0
      if (taken.has(cand)) {
        const stem = cand.slice(0, -1)
        const tries = [...'123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(ch => stem + ch)
        cand = tries.find(c => !taken.has(c)) || cand
      }
      taken.add(cand); out[it.id] = cand
    }
  }
  return out
}

export async function actAssignCodes({ body }) {
  const ctx = await loadBags()
  const clientOf = await resolveClients(ctx.bags)
  const regenerate = !!body.regenerate
  // siguiente número libre por prefijo (reserva los rangos de las casas que conservan su código)
  const nextByPrefix = {}
  if (!regenerate) for (const b of ctx.bags) { const p = codeParts(b.code); if (p) nextByPrefix[p.prefix] = Math.max(nextByPrefix[p.prefix] || 1, p.start + (b.qty || 1)) }
  const targets = (regenerate ? [...ctx.bags] : ctx.bags.filter(b => !b.code)).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  // Prefijos ya ocupados por casas que conservan su código (solo cuando no se regenera todo)
  const taken = new Set()
  if (!regenerate) for (const b of ctx.bags) { const p = codeParts(b.code); if (p) taken.add(p.prefix) }
  const prefixes = assignPrefixes(targets.map(b => ({ id: b.id, client: clientOf(b), prop: b.properties?.[0]?.name || String(b.name || '').split('_')[1] || '', name: b.name })), taken)
  const plan = targets.map(b => {
    const clientName = clientOf(b)
    const prefix = prefixes[b.id]
    const start = nextByPrefix[prefix] || 1
    nextByPrefix[prefix] = start + (b.qty || 1)
    const code = `${prefix}-${start}`
    const last = start + (b.qty || 1) - 1
    return { id: b.id, name: b.name, old: b.code || null, code, codes: b.qty > 1 ? `${prefix}-${start} … ${prefix}-${last}` : code, property: b.properties[0]?.name || '', client: clientName, qty: b.qty }
  })
  if (!body.apply) return { ok: true, applied: false, regenerate, plan }
  await updateMany(T.bags, plan.map(p => ({ id: p.id, fields: { [FB.code]: p.code } })))
  return { ok: true, applied: true, regenerate, plan }
}

// ── recepción en lavandería (opcional): confirma que llegó la maleta física ──
const returnedUnits = (cyc) => cyc.unitsBack.filter(u => u.status !== 'stay').map(u => u.unit)
export async function actReceive({ profile, body }) {
  const ctx = await loadBags()
  const rec = await getRecord(T.cycles, body.cycleId)
  const cyc = normalizeCycle(rec, ctx.maps.staffMap)
  if (cyc.state !== 'Dirty') return { ok: true, already: true, cycle: cyc }
  const returned = returnedUnits(cyc)
  const unit = Number(body.unit) || null
  const target = body.all || !unit ? returned : [unit]
  if (unit && !returned.includes(unit)) throw new HttpError(409, `La maleta #${unit} no figura como devuelta por el cleaner (¿se quedó en la casa?)`)
  const rcv = [...new Set([...cyc.unitsRcv, ...target])]
  const at = nowISO()
  const patch = {
    [FC.unitsSeen]: unitsText({ back: cyc.unitsBack, rcv }),
    [FC.log]: logAppend(rec.fields?.[FC.log], { at, by: staffName(ctx, profile), stage: 'Recepción', note: `Recibida en lavandería: ${target.map(n => `#${n}`).join(', ')}`, photos: [] }),
  }
  const upd = await updateRecord(T.cycles, cyc.id, patch)
  return { ok: true, received: target, pending: returned.filter(n => !rcv.includes(n)), cycle: normalizeCycle(upd, ctx.maps.staffMap) }
}

// resumen rápido de semáforo por Bag (lo usa Ops al mostrar una maleta)
export async function bagSemaforo(bagId, cycle) {
  const { recs } = await loadOpenLaundryIncidents()
  const open = recs.map(r => normalizeIncident(r)).filter(i => i.bagId === bagId)
  return semaforoOf(open, cycle)
}



// Tablero con el nombre del cliente de cada maleta (solo lectura; si no se puede resolver queda vacío)
export async function actBoard() {
  const bd = await buildBoard()
  try {
    const clientOf = await resolveClients(bd.bags)
    for (const b of bd.bags) {
      const c = clientOf(b)
      b.clientName = c && c !== b.name && !REC_ID.test(c) ? c : ''
    }
  } catch { /* sin clientes */ }
  return bd
}

// Deshacer una carga de turno equivocada: solo si el ciclo está «En uso» y nadie ha declarado devolución.
export async function actUndoLoad({ profile, body }) {
  const ctx = await loadBags()
  const bag = needBag(ctx, body.bagId)
  const rec = await currentCycleRecord(bag)
  if (!rec) throw new HttpError(400, 'Esta maleta no tiene ciclo que deshacer')
  const st = normState(rec.fields?.[FC.state])
  if (st !== 'In Use') throw new HttpError(409, `No se puede deshacer: el ciclo está en "${st || 'sin estado'}" (solo aplica a «En uso»)`)
  if (parseUnits(rec.fields?.[FC.unitsSeen]).back.length) throw new HttpError(409, 'Ya hay devoluciones declaradas; no se puede deshacer la carga')
  const at = nowISO()
  await updateRecord(T.cycles, rec.id, {
    [FC.state]: 'Clean', [FC.loadedAt]: null, [FC.openedAt]: null, [FC.bagsOut]: null, [FC.unitsSeen]: '',
    [FC.log]: logAppend(rec.fields?.[FC.log], { at, by: staffName(ctx, profile), stage: 'Carga deshecha', note: 'Se deshizo la carga de turno (vuelve a Clean)', photos: [] }),
  })
  await updateRecord(T.bags, bag.id, { [FB.state]: 'Clean' })
  return { ok: true, bagId: bag.id }
}
