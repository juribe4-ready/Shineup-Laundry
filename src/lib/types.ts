export type State = 'Dirty' | 'Inspected' | 'Washing' | 'Clean' | 'In Use'
export type Level = 'ok' | 'amber' | 'red'
export type Semaforo = 'verde' | 'amarillo' | 'rojo'
export type Counts = Record<string, number>

export interface ShortItem { item: string; qty: number; reason: string; kind?: 'left' | 'clean' | 'other' }
export interface LogEvent { at: string; by: string; stage: string; note: string; photos: string[] }

export interface Cycle {
  id: string; name: string; bagId: string | null; cleaningCloseId: string | null; cleaningUseId: string | null
  state: State | null; dirtyAt: string | null; declaredBy: string | null
  condition: 'Bueno' | 'Normal' | 'Malo'; tags: string[]; short: ShortItem[]; sendAll: boolean
  cleanerNote: string; unitsSeen: string
  inspectedAt: string | null; inspectedBy: string | null
  unitsOut: number[]; unitsBack: { unit: number; status: 'dirty' | 'clean' | 'stay' }[]; stayedUnits: number
  bagsOut: number | null; bagsBack: number | null
  counted: { expected: Counts; counts: Counts; damaged: Counts; stained: Counts } | null
  endorsement: string | null; special: boolean
  washStart: string | null; washEnd: string | null; washedBy: string | null
  washPlace: 'Propia' | 'Externa' | null; rewash: boolean
  readyAt: string | null; finalContent: { counts: Counts; discarded: Counts; expected: Counts; added?: Counts } | null
  packedBy: string | null; loadedAt: string | null; openedAt: string | null
  log: LogEvent[]
}

export interface Bag {
  id: string; code: string | null; name: string; qty: number
  properties: { id: string; name: string }[]
  state: State | null; standard: Counts; lastCycleId: string | null
}

export interface InvRow { item: string; par: number; home: number; bag: number; laundry: number; missing: number }
export interface Inventory { rows: InvRow[]; totals: { par: number; home: number; bag: number; laundry: number; missing: number }; known: boolean }

export interface BoardBag extends Bag {
  inventory: Inventory
  cycle: Cycle | null
  daysDirty: number | null; dirtyLevel: Level
  nextCleaning: { id: string; date: string; propertyId: string; propertyName: string } | null
  daysToNext: number | null; risk: Level; alert: Level
  semaforo: Semaforo; openIncidents: number
}

export interface LaundryConfig {
  laundryDirtyWarnDays: number; laundryDirtyMaxDays: number
  laundryRiskAmberDays: number; laundryRiskRedDays: number
}

export interface Board {
  today: string; config: LaundryConfig; bags: BoardBag[]
  summary: { counts: Record<string, number>; atRisk: number; atRisk48h: number; dirtyOverLimit: number; openIncidents: number; withoutCode: number; missingPieces: number; bagsWithMissing: number }
  debug: { items: string[]; fromTars: string[]; bagCount: number; cyclesLoaded: number; incidentsOpen: number; upcomingProps: number; warnings: string[]; ms: number }
}

export interface Incident {
  id: string; name: string; status: 'Reported' | 'In Progress' | 'Closed'; created: string | null
  comment: string; closeComment: string; media: string | null; category: string | null
  type: string | null; stage: string | null; item: string | null; qty: number | null; unit: number | null
  action: string | null; cost: number | null
  propertyId: string | null; propertyName: string | null; bagId: string | null; bagName: string | null
  cycleId: string | null; reportedBy: string; owner: string; ownerId: string | null
}

export interface Me {
  profile: { id: string; email: string; role: string; full_name: string | null; staff_airtable_id: string | null; laundry_access: boolean }
  permissions: { admin: boolean; laundry: boolean; field: boolean }
}

export interface Kpis {
  from: string; to: string; cycles: number
  cycleTime: { avgH: number | null; medianH: number | null; p90H: number | null; n: number }
  inspectionDelayAvgH: number | null; washDurationAvgH: number | null
  onTime: { pct: number | null; onTime: number; total: number }
  specialPct: number | null; shortPct: number | null; rewashPct: number | null
  external: { pct: number | null; cycles: number }
  washers: { name: string; cycles: number; avgWashH: number | null }[]
  incidents: { total: number; open: number; per100: number | null; byType: { name: string; n: number }[]; byItem: { name: string; n: number }[]; byStage: { name: string; n: number }[]; cost: number }
  bags: { out: number; back: number; cyclesWithGap: number }
  replaced: { name: string; n: number }[]
  worstBags: { name: string; cycles: number; special: number; incidents: number }[]
  daily: { date: string; n: number }[]
  debug: { warnings: string[]; ms: number; cycleRecords: number; incidentRecords: number }
}

export interface ConfigInfo {
  config: LaundryConfig; fromTars: string[]; states: string[]
  incidentTypes: string[]; incidentStages: string[]; conditions: string[]
}
