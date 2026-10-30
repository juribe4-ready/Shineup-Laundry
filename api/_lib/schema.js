// ─────────────────────────────────────────────────────────────────────────────
// Nombres de tablas y campos de Airtable que usa el módulo de lavandería.
// TODO lo que depende de cómo creaste las cosas en Airtable vive AQUÍ.
// Si un campo se llama distinto en tu base, cámbialo solo en este archivo.
// ─────────────────────────────────────────────────────────────────────────────

export const T = {
  bags: 'Laundry Bags',         // tabla existente renombrada (una fila = un conjunto de maletas)
  cycles: 'Ciclo de Maleta',    // tabla NUEVA
  incidents: 'Incidents',       // tabla existente (+ campos nuevos)
  cleanings: 'tblabOdNknnjrYUU1',
  staff: 'tblgHwN1wX6u3ZtNY',
  properties: 'tbl1iETmcFP460oWN',
  standards: 'Standards',       // aquí vive TARS_CONFIG
}

// Etapas (el valor exacto de las opciones del campo de estado)
export const STATES = ['Dirty', 'Inspected', 'Washing', 'Clean', 'In Use']
export const DIRTY_STATES = ['Dirty', 'Inspected', 'Washing'] // todavía no está lista

// ── Tabla Laundry (Bags) ──
export const FB = {
  name: 'Name',
  property: 'Property',
  state: 'Status',                 // se reutiliza el campo Status existente (opciones = STATES, en inglés)
  code: 'Codigo',                   // NUEVO (texto, ej. C-014)
  qty: 'Cantidad de maletas',      // NUEVO (número 1-4)
  lastCycle: 'Ultimo ciclo',       // NUEVO (link a Ciclo de Maleta; se escribe un solo ciclo)
}
// Campos numéricos de Laundry que NO son ítems de lavandería
export const BAG_NON_ITEM_NUMERIC = [FB.qty]
// Opciones de Status que significan lo mismo que una etapa (por si quedó alguna vieja)
export const STATE_ALIASES = { Sucia: 'Dirty', Inspeccionada: 'Inspected', 'En lavado': 'Washing', Lista: 'Clean', Limpia: 'Clean', 'En uso': 'In Use' }

// ── Tabla Ciclo de Maleta ──
export const FC = {
  name: 'Name',
  bag: 'Bag',
  cleaningClose: 'Cleaning de cierre',
  cleaningUse: 'Cleaning de uso',
  state: 'Estado',
  dirtyAt: 'Sucia el',
  declaredBy: 'Declarado por',
  condition: 'Condicion',
  tags: 'Etiquetas condicion',
  sendAll: 'Envia todo',
  short: 'Enviado de menos',           // JSON [{item, qty, reason}]
  cleanerNote: 'Nota cleaner',
  unitsSeen: 'Unidades vistas',        // texto "1,2"
  inspectedAt: 'Inspeccionada el',
  inspectedBy: 'Inspeccionado por',
  counted: 'Contenido contado',        // JSON {expected, counts, damaged, stained}
  endorsement: 'Refrendo',             // Confirmó | Corrigió
  special: 'Tratamiento especial',     // checkbox
  washStart: 'Inicio lavado',
  washEnd: 'Fin lavado',
  washedBy: 'Lavado por',
  washPlace: 'Lugar de lavado',        // Propia | Externa
  rewash: 'Re-lavado',
  readyAt: 'Lista el',
  finalContent: 'Contenido final',     // JSON {counts}
  packedBy: 'Empacado por',
  loadedAt: 'Cargado en turno el',
  openedAt: 'Abierta el',
  bagsOut: 'Maletas llevadas',         // número (maletas físicas escaneadas en la carga de turno)
  bagsBack: 'Maletas devueltas',       // número (maletas físicas que regresan a lavandería)
  log: 'Bitacora',                     // JSON [{at, by, stage, note, photos}]
}

// ── Tabla Incidents (diseño mínimo y genérico; el tipo viaja en el Name y la etapa en la bitácora del ciclo) ──
export const FI = {
  name: 'Name',
  status: 'Status',
  property: 'Property',
  reportedBy: 'Reported By',
  cleaningId: 'Cleaning ID',
  comment: 'Comment',
  media: 'MediaURL',
  closeComment: 'CloseComment',   // «qué se hizo»: obligatorio para cerrar
  created: 'Creation Date',
  // nuevos
  category: 'Categoria',
  bag: 'Activo',                  // link a Laundry Bags (con el EAM se sumará la tabla de activos)
  cycle: 'Ciclo',                 // link directo al ciclo de maleta
  item: 'Item',                   // texto: pieza afectada
  owner: 'Asignado a',            // lo asigna un manager después; el cleaner nunca lo llena
}
export const CATEGORY_LAUNDRY = 'Lavanderia'
// El tipo se escribe como 2.º segmento del Name: «C-014 · Faltante · Sheets-Q ×2»
export const INCIDENT_TYPES = ['Faltante', 'Dañado', 'Sucio / Manchado', 'Sobrante', 'Defecto', 'Otro']
export const INCIDENT_STAGES = ['En propiedad', 'Inspeccion', 'Lavado', 'Empaque'] // se graba en la bitácora del ciclo

// ── Cleanings ──
export const FCL = { date: 'Date', property: 'Property', status: 'Status', propertyText: 'Property Text' }

// ── Parámetros que se leen de TARS (Standards → TARS_CONFIG) ──
export const TARS_DEFAULTS = {
  laundryDirtyWarnDays: 2,   // amarillo: maleta sucia hace >= N días
  laundryDirtyMaxDays: 3,    // rojo: maleta sucia hace >= N días
  laundryRiskAmberDays: 2,   // amarillo: faltan <= N días para el próximo cleaning y no está lista
  laundryRiskRedDays: 1,     // rojo: faltan <= N días para el próximo cleaning y no está lista
}
