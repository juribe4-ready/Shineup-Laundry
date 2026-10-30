// Router único de la app de lavandería (una sola función serverless → cabe en el plan Hobby).
// GET  /api/laundry?type=board|bag|bagsByProperty|cycle|incidents|kpis|labels|config|me
// POST /api/laundry?type=declareReturn|markInUse|loadShift|reportBagIncident|inspect|receive|startWash|finishWash|updateIncident|assignCodes
import { authenticate, can, HttpError } from './_lib/auth.js'
import { buildBoard, buildKpis } from './_lib/model.js'
import * as A from './_lib/actions.js'

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return {}
}

const READS = {
  me: (ctx) => A.actMe(ctx),
  config: () => A.actConfig(),
  board: () => A.actBoard(),
  bag: (ctx) => A.actBag(ctx),
  bagsByProperty: (ctx) => A.actBagsByProperty(ctx),
  cycle: (ctx) => A.actCycle(ctx),
  incidents: (ctx) => A.actIncidents(ctx),
  kpis: (ctx) => buildKpis({ from: ctx.query.from, to: ctx.query.to }),
  labels: () => A.actLabels(),
  staff: () => A.actStaff(),
}
const WRITES = {
  declareReturn: A.actDeclareReturn,
  markInUse: A.actMarkInUse,
  loadShift: A.actLoadShift,
  reportBagIncident: A.actReportBagIncident,
  inspect: A.actInspect,
  receive: A.actReceive,
  startWash: A.actStartWash,
  finishWash: A.actFinishWash,
  updateIncident: A.actUpdateIncident,
  assignCodes: A.actAssignCodes,
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const t0 = Date.now()
  try {
    const type = req.query?.type
    if (!type) throw new HttpError(400, 'type requerido')
    const isWrite = req.method === 'POST'
    const table = isWrite ? WRITES : READS
    if (!table[type]) throw new HttpError(400, `Acción desconocida: ${type} (${req.method})`)
    const { profile } = await authenticate(req)
    if (!can(profile, type)) throw new HttpError(403, 'No tienes permiso para esta acción')
    const body = isWrite ? await parseBody(req) : {}
    const out = await (isWrite ? WRITES[type]({ profile, body }) : READS[type]({ profile, query: req.query || {} }))
    return res.status(200).json({ ...out, _ms: Date.now() - t0 })
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500
    console.error('[laundry]', req.query?.type, err.message)
    return res.status(status).json({ error: err.message, detail: err.detail || null })
  }
}
