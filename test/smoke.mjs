// Prueba de humo del backend con Airtable y Supabase simulados (no toca datos reales).
// Uso: node test/smoke.mjs
process.env.AIRTABLE_TOKEN = 'test'
const db = {
  'Laundry Bags': [
    { id: 'recBagA', fields: { Name: 'Aamna_Bag', Property: ['recP1', 'recP2'], Status: 'Clean', 'Codigo': 'C-001', 'Cantidad de maletas': 2, 'Sheets-Q': 4, 'Sheets-K': 2, 'Bath Towels': 12, 'Hand Towels': 5 } },
    { id: 'recBagB', fields: { Name: 'Ahmed_Bag', Property: ['recP3'], 'Codigo': 'C-002', 'Sheets-Q': 2, 'Bath Towels': 6 } },
    { id: 'recBagC', fields: { Name: 'SinCodigo_Bag', Property: ['recP4'], 'Bath Towels': 3 } },
  ],
  'Ciclo de Maleta': [],
  Incidents: [{ id: 'recOld', fields: { Name: 'Silla rota', Status: 'Reported', Property: ['recP1'] } }],
  tbl1iETmcFP460oWN: [{ id: 'recP1', fields: { Name: '999 N High St' } }, { id: 'recP2', fields: { Name: '1025 Luna' } }, { id: 'recP3', fields: { Name: 'Ahmed 1' } }, { id: 'recP4', fields: { Name: 'Alden' } }],
  tblgHwN1wX6u3ZtNY: [{ id: 'recS1', fields: { Name: 'Juan Uribe', Initials: 'JU' } }, { id: 'recS2', fields: { Name: 'Paola', Initials: 'PA' } }],
  tblabOdNknnjrYUU1: [],
  Standards: [{ id: 'recCfg', fields: { Name: 'TARS_CONFIG', Value: JSON.stringify({ laundryDirtyMaxDays: 3, laundryRiskRedDays: 1 }) } }],
}
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const plus = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
db.tblabOdNknnjrYUU1.push(
  { id: 'recCL1', fields: { Date: plus(1), Property: ['recP1'], Status: 'Programmed', 'Property Text': '999 N High St' } },
  { id: 'recCL2', fields: { Date: plus(5), Property: ['recP3'], Status: 'Programmed' } },
  { id: 'recCL0', fields: { Date: plus(-3), Property: ['recP1'], Status: 'Done' } })
let n = 100
const calls = []
const tableOf = (path) => decodeURIComponent(path.split('?')[0].split('/')[0])
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url)
  const json = (o, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(o), json: async () => o })
  if (u.hostname.endsWith('supabase.co')) {
    const tok = (opts.headers?.Authorization || '').replace('Bearer ', '')
    if (u.pathname === '/auth/v1/user') return tok.startsWith('bad') ? json({ msg: 'bad' }, 401) : json({ id: tok })
    if (u.pathname === '/rest/v1/profiles') {
      const profiles = {
        admin: { id: 'admin', role: 'admin', active: true, staff_airtable_id: 'recS1', full_name: 'Juan', laundry_access: false },
        cleaner: { id: 'cleaner', role: 'cleaner', active: true, staff_airtable_id: 'recS2', full_name: 'Paola', laundry_access: false },
        lav: { id: 'lav', role: 'cleaner', active: true, staff_airtable_id: 'recS2', full_name: 'Paola', laundry_access: true },
        client: { id: 'client', role: 'client', active: true, staff_airtable_id: null, laundry_access: false },
      }
      return json([profiles[tok]].filter(Boolean))
    }
  }
  if (u.hostname === 'api.airtable.com') {
    const parts = u.pathname.replace('/v0/appBwnoxgyIXILe6M/', '').split('/')
    const table = decodeURIComponent(parts[0]); const id = parts[1]
    calls.push(`${opts.method || 'GET'} ${table}${id ? '/' + id : ''}`)
    const rows = db[table]
    if (!rows) return json({ error: { message: `Unknown table ${table}` } }, 404)
    if ((opts.method || 'GET') === 'GET' && id) { const r = rows.find(x => x.id === id); return r ? json(r) : json({ error: { message: 'NOT_FOUND' } }, 404) }
    if (opts.method === 'POST') {
      const b = JSON.parse(opts.body); const r = { id: `rec${n++}`, fields: { ...b.fields, 'Creation Date': new Date().toISOString() } }
      // simular campos inexistentes: Incidents sin 'Categoria' ni 'Bag' rechaza (descomentar para probar errores)
      rows.push(r); return json(r)
    }
    if (opts.method === 'PATCH' && !id) { for (const rec of JSON.parse(opts.body).records) Object.assign(rows.find(x => x.id === rec.id).fields, rec.fields); return json({ records: [] }) }
    if (opts.method === 'PATCH') { const r = rows.find(x => x.id === id); Object.assign(r.fields, JSON.parse(opts.body).fields); return json(r) }
    let out = rows
    const f = u.searchParams.get('filterByFormula') || ''
    if (f.startsWith('OR(RECORD_ID()')) { const ids = [...f.matchAll(/'(rec[^']+)'/g)].map(m => m[1]); out = rows.filter(r => ids.includes(r.id)) }
    else if (f.includes("{Name}='TARS_CONFIG'")) out = rows.filter(r => r.fields.Name === 'TARS_CONFIG')
    else if (f.includes("Categoria")) {
      out = rows.filter(r => r.fields['Categoria'] === 'Lavanderia')
      if (f.includes("!='Closed'")) out = out.filter(r => r.fields.Status !== 'Closed')
      else if (f.includes("='Closed')")) out = out.filter(r => r.fields.Status === 'Closed')
      const m = f.match(/FIND\('([^']+)'/); if (m) out = out.filter(r => (r.fields['Ciclo_'] || []).includes(m[1]))
    }
    if (table === 'tblabOdNknnjrYUU1') out = [...out].sort((a, b) => String(b.fields.Date).localeCompare(String(a.fields.Date)))
    return json({ records: out })
  }
  throw new Error('fetch inesperado ' + url)
}
const { default: handler } = await import('../api/laundry.js')
const call = async (method, type, token, body, extra = {}) => {
  let status = 0, out = null
  const res = { setHeader() {}, status(c) { status = c; return this }, json(o) { out = o; return this }, end() { return this } }
  await handler({ method, query: { type, ...extra }, headers: { authorization: `Bearer ${token}` }, body }, res)
  return { status, out }
}
const ok = (cond, msg) => { console.log(cond ? '  ✔' : '  ✘ FALLÓ:', msg); if (!cond) process.exitCode = 1 }

console.log('permisos'); 
ok((await call('GET', 'board', 'bad')).status === 401, 'token malo → 401')
ok((await call('GET', 'board', 'client')).status === 403, 'rol client → 403')
ok((await call('GET', 'board', 'cleaner')).status === 403, 'cleaner sin laundry_access no ve el tablero')
ok((await call('GET', 'labels', 'lav')).status === 403, 'laundry_access no ve etiquetas (admin)')

console.log('tablero inicial')
let b = (await call('GET', 'board', 'admin')).out
ok(b.bags.length === 3, '3 bags')
ok(b.debug.items.join() === 'Sheets-Q,Sheets-K,Bath Towels,Hand Towels', 'ítems detectados: ' + b.debug.items.join('|'))
ok(b.bags.find(x => x.code === 'C-001').state === 'Clean', 'Status Clean se lee como Clean')
ok(b.summary.withoutCode === 1, 'detecta 1 bag sin código')
ok(b.config.laundryDirtyMaxDays === 3 && b.config.laundryDirtyWarnDays === 2, 'config TARS + defaults')

console.log('cleaner declara devolución (con faltante declarado)')
let r = await call('POST', 'declareReturn', 'cleaner', { bagId: 'recBagA', cleaningId: 'recCL0', condition: 'Malo', tags: ['Manchas'], note: 'manchas en sábana', short: [{ item: 'Bath Towels', qty: 2, reason: 'dejé limpias' }], units: [{ unit: 1, status: 'dirty' }, { unit: 2, status: 'dirty' }], photos: ['https://x/y.jpg'] })
ok(r.status === 200 && r.out.cycle.state === 'Dirty' && r.out.cycle.special === true, 'ciclo Sucia con tratamiento especial')
ok(!r.out.cycle.sendAll && r.out.cycle.short[0].qty === 2, 'envío de menos registrado')
const cycA = r.out.cycle.id
r = await call('POST', 'declareReturn', 'cleaner', { bagId: 'recBagA', cleaningId: 'recCL0' })
ok(r.out.duplicate === true, 'reintento idempotente (no duplica ciclo)')
ok(db['Ciclo de Maleta'].length === 1, 'solo 1 ciclo en la tabla')

console.log('tablero con maleta sucia y cleaning mañana')
b = (await call('GET', 'board', 'lav')).out
const A = b.bags.find(x => x.code === 'C-001')
ok(A.state === 'Dirty' && A.risk === 'red' && A.daysToNext === 1, `riesgo rojo (faltan ${A.daysToNext} día)`)
ok(b.bags[0].code === 'C-001', 'la maleta urgente va primero')
console.log('   inventario Dirty:', JSON.stringify(A.inventory.totals))
const balanced = (inv) => inv.rows.every(r => r.home + r.bag + r.laundry + r.missing === r.par)
ok(A.inventory.totals.par === 23 && balanced(A.inventory), 'inventario Dirty: par 23 y cada pieza cuadra (casa+maleta+lavandería+falta = par)')

console.log('inspección (laundry)')
r = await call('POST', 'inspect', 'lav', { cycleId: cycA, counts: { 'Sheets-Q': 3, 'Sheets-K': 2, 'Bath Towels': 10, 'Hand Towels': 5 }, damaged: { 'Hand Towels': 1 } })
ok(r.status === 200 && r.out.endorsement === 'Corrigió', 'Corrigió')
const inc = db.Incidents.filter(i => i.fields['Categoria'] === 'Lavanderia')
ok(inc.length === 2, `2 incidentes automáticos (faltante Sheets-Q ×1, dañado Hand Towels ×1) → ${inc.map(i => i.fields.Name).join(' / ')}`)
ok(!inc.some(i => i.fields['Item'] === 'Bath Towels'), 'Bath Towels no es faltante (el cleaner declaró 2 de menos: 12−2=10)')
ok(inc.every(i => i.fields['Property']?.[0] === 'recP1'), 'incidente ligado a la propiedad del cleaning de cierre')
r = await call('POST', 'inspect', 'lav', { cycleId: cycA, counts: {} })
ok(r.status === 409, 'no se inspecciona dos veces')
b = (await call('GET', 'board', 'lav')).out
ok(b.bags.find(x => x.code === 'C-001').semaforo === 'rojo', 'semáforo rojo por prenda dañada')
{ const inv = b.bags.find(x => x.code === 'C-001').inventory
  console.log('   inventario Inspected:', JSON.stringify(inv.totals))
  ok(inv.totals.laundry === 20 && inv.rows.find(r => r.item === 'Sheets-Q').missing === 1 && balanced(inv), 'inventario Inspected: 20 en lavandería y falta 1 Sheets-Q') }

console.log('lavado')
r = await call('POST', 'startWash', 'lav', { cycleId: cycA, place: 'Externa' })
ok(r.out.cycle.state === 'Washing' && r.out.cycle.washPlace === 'Externa', 'En lavado / Externa')
r = await call('POST', 'finishWash', 'lav', { cycleId: cycA, counts: { 'Sheets-Q': 3, 'Sheets-K': 2, 'Bath Towels': 9, 'Hand Towels': 4 }, discarded: { 'Hand Towels': 1 } })
ok(r.out.cycle.state === 'Clean' && r.out.incidentsCreated === 1, 'Lista + 1 faltante por pérdida en lavado (Bath Towels −1); la toalla dañada retirada no cuenta como pérdida')
ok(db['Laundry Bags'][0].fields.Status === 'Clean', 'Status del Bag = Lista')

console.log('Ops: carga de turno y uso')
r = await call('POST', 'loadShift', 'cleaner', { codes: ['c-001-1', 'C-001-2', 'C-002', 'X-9'] })
ok(r.out.loaded.length === 2 && r.out.unknown[0] === 'X-9', 'carga de turno: 2 maletas, 1 desconocida')
ok(r.out.loaded.find(x => x.code === 'C-001').warning === null && r.out.loaded.find(x => x.code === 'C-001').units.join() === '1,2', 'C-001 Clean → In Use con 2 maletas escaneadas')
ok(db['Ciclo de Maleta'].find(c => c.id === cycA).fields['Maletas llevadas'] === 2 && db['Laundry Bags'][0].fields.Status === 'In Use', 'Maletas llevadas = 2 y Status del Bag = In Use')
ok(r.out.loaded.find(x => x.code === 'C-002').warning === null, 'C-002 sin historial: se crea ciclo In Use')
r = await call('POST', 'markInUse', 'cleaner', { bagId: 'recBagA', cleaningId: 'recCL1' })
ok(r.out.cycle.state === 'In Use' && r.out.warning === null, 'En uso sin advertencias')
r = await call('POST', 'markInUse', 'cleaner', { bagId: 'recBagB', cleaningId: 'recCL2' })
ok(r.out.cycle.state === 'In Use', 'bootstrap de bag sin historial')

console.log('incidentes')
let incs = (await call('GET', 'incidents', 'lav')).out.incidents
ok(incs.length === 3, '3 abiertos (se ignoran los de otras categorías)')
r = await call('POST', 'updateIncident', 'lav', { id: incs[0].id, status: 'Closed' })
ok(r.status === 400, 'no se cierra sin explicar qué se hizo')
r = await call('POST', 'updateIncident', 'lav', { id: incs[0].id, status: 'Closed', closeComment: 'Compré 1', ownerId: 'recS1' })
ok(r.status === 200, 'cierra explicando qué se hizo')
r = await call('POST', 'reportBagIncident', 'cleaner', { bagId: 'recBagA', type: 'Defecto', comment: 'cierre roto', unit: 2, cleaningId: 'recCL1' })
ok(r.status === 200 && db.Incidents.at(-1).fields['Comment'].startsWith('[En propiedad]'), 'cleaner reporta defecto de maleta (etapa en el comentario)')

console.log('devolución con una maleta que se queda en la casa + inspección + piezas nuevas')
r = await call('POST', 'declareReturn', 'cleaner', { bagId: 'recBagA', cleaningId: 'recCL1', units: [{ unit: 1, status: 'dirty' }, { unit: 2, status: 'stay' }], short: [{ item: 'Hand Towels', qty: 1, reason: 'sin usar', kind: 'clean' }] })
ok(r.out.cycle.state === 'Dirty' && r.out.cycle.bagsOut === 2 && r.out.cycle.bagsBack === 1 && r.out.cycle.stayedUnits === 1, 'llevadas 2 / devueltas 1 / 1 maleta en la casa')
const cycA2 = r.out.cycle.id
{
  let bd = (await call('GET', 'board', 'lav')).out
  let u = bd.bags.find(x => x.code === 'C-001').units
  ok(u.length === 2 && u[0].where === 'transito' && u[1].where === 'casa', `maleta física 1 en tránsito, 2 en la casa → ${u.map(x => x.where)}`)
  ok(bd.summary.unitsAtHome === 1 && bd.summary.unitsInTransit === 1, 'resumen: 1 en casas, 1 en tránsito')
  r = await call('POST', 'receive', 'lav', { cycleId: cycA2, unit: 2 })
  ok(r.status === 409, 'no se puede recibir una maleta que se quedó en la casa')
  r = await call('POST', 'receive', 'lav', { cycleId: cycA2, unit: 1 })
  bd = (await call('GET', 'board', 'lav')).out
  u = bd.bags.find(x => x.code === 'C-001').units
  ok(r.status === 200 && u[0].where === 'lavanderia' && u[1].where === 'casa', `recepción opcional: #1 recibida, #2 sigue en la casa → ${u.map(x => x.where)}`)
}
const before = db.Incidents.length
r = await call('POST', 'inspect', 'lav', { cycleId: cycA2, counts: { 'Sheets-Q': 2, 'Sheets-K': 1, 'Bath Towels': 6, 'Hand Towels': 4 } })
ok(r.status === 200 && r.out.explained.length > 0 && db.Incidents.length === before, 'faltantes explicados por la maleta en la casa: no se crean incidentes falsos')
await call('POST', 'startWash', 'lav', { cycleId: cycA2, place: 'Propia' })
r = await call('POST', 'finishWash', 'lav', { cycleId: cycA2, added: { 'Sheets-Q': 2 } })
ok(r.status === 200 && r.out.cycle.finalContent.added['Sheets-Q'] === 2 && Array.isArray(r.out.suggestClose), `piezas nuevas registradas; sugerencias de cierre: ${r.out.suggestClose.length}`)

console.log('Ops: bag por código / por propiedad')
r = await call('GET', 'bag', 'cleaner', null, { code: 'C-001-2' })
ok(r.out.bag.id === 'recBagA' && r.out.unit === 2, 'resuelve C-001-2 → bag + unidad 2')
r = await call('GET', 'bagsByProperty', 'cleaner', null, { propertyId: 'recP2', cleaningId: 'recCL1' })
ok(r.out.bags.length === 1, 'bags por propiedad (multi-propiedad)')

console.log('KPIs y etiquetas')
r = await call('GET', 'kpis', 'lav')
ok(r.status === 200 && r.out.cycles === 2 , `KPIs: ${r.out.cycles} ciclos, externos ${r.out.external.cycles}`)
db['Laundry Bags'].push({ id: 'recBagD', fields: { Name: 'SinCodigo_Bag', Property: ['recP4'], 'Cantidad de maletas': 2, 'Bath Towels': 3 } })
db['Laundry Bags'].push({ id: 'recBagE', fields: { Name: 'Aamna_Bag2', Property: ['recP2'], 'Cantidad de maletas': 1, 'Bath Towels': 3 } })
r = await call('POST', 'assignCodes', 'admin', {})
ok(r.out.plan.length === 3 && !r.out.applied, `casas sin código (simulación): ${r.out.plan.map(p => p.codes).join(' | ')}`)
r = await call('POST', 'assignCodes', 'admin', { regenerate: true })
ok(r.out.plan.length === 5 && r.out.plan.find(p => p.id === 'recBagA').codes === 'M-AA-HI-1 … M-AA-HI-2', `regenerar todos (vista previa): ${r.out.plan.map(p => p.codes).join(' | ')}`)
ok(db['Laundry Bags'][0].fields.Codigo === 'C-001', 'la vista previa no escribe')
r = await call('POST', 'assignCodes', 'admin', { regenerate: true, apply: true })
const cod = Object.fromEntries(db['Laundry Bags'].map(b => [b.id, b.fields.Codigo]))
ok(cod.recBagA === 'M-AA-HI-1' && cod.recBagC === 'M-SI-AL-1' && cod.recBagD === 'M-SI-AL-2', `aplicado en lote; casas con las mismas letras siguen el número: ${JSON.stringify(cod)}`)
r = await call('GET', 'bag', 'cleaner', null, { code: 'M-SI-AL-3' })
ok(r.out.bag.id === 'recBagD' && r.out.unit === 2, 'escanear M-SI-AL-3 → casa de 2 maletas (empieza en -2), maleta 2')
r = await call('GET', 'bag', 'cleaner', null, { code: 'M-SI-AL-1' })
ok(r.out.bag.id === 'recBagC' && r.out.unit === 1, 'escanear M-SI-AL-1 → otra casa con las mismas letras, maleta 1')
r = await call('GET', 'bag', 'cleaner', null, { code: 'M-AA-HI-2' })
ok(r.out.bag.id === 'recBagA' && r.out.unit === 2, 'escanear M-AA-HI-2 → maleta 2 de la casa Aamna')
r = await call('GET', 'labels', 'admin')
{ const d = r.out.bags.find(b => b.id === 'recBagD'); ok(d.codes.join() === 'M-SI-AL-2,M-SI-AL-3' && d.codeLabel === 'M-SI-AL-2…3', `etiquetas: una por maleta física con su código → ${d.codes}`) }
r = await call('POST', 'assignCodes', 'admin', {})
ok(r.out.plan.length === 0, 'ya no faltan códigos')
console.log('\nllamadas a Airtable:', calls.length)
