import { useCallback, useEffect, useState } from 'react'
import { LayoutList, ScanLine, AlertTriangle, BarChart3, QrCode, LogOut, Boxes } from 'lucide-react'
import { supabase } from './supabase'
import { apiGet } from './lib/api'
import { debugSetExtra } from './lib/debug'
import type { Board, BoardBag, ConfigInfo, Me } from './lib/types'
import InventoryPage from './components/InventoryPage'
import LoginPage from './components/LoginPage'
import BoardPage from './components/BoardPage'
import BagSheet from './components/BagSheet'
import IncidentsPage from './components/IncidentsPage'
import KpiPage from './components/KpiPage'
import LabelsPage from './components/LabelsPage'
import ScanPage from './components/ScanPage'
import DebugPanel from './components/DebugPanel'
import { Btn, C, Spinner, useToast } from './components/ui'

type Tab = 'cola' | 'scan' | 'inv' | 'inc' | 'kpi' | 'etq'

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s))
    return () => subscription.unsubscribe()
  }, [])
  if (authed === null) return <div className="min-h-screen flex items-center justify-center"><Spinner size={28} /></div>
  if (!authed) return <LoginPage />
  return <Main />
}

function Main() {
  const [me, setMe] = useState<Me | null>(null)
  const [meErr, setMeErr] = useState('')
  const [board, setBoard] = useState<Board | null>(null)
  const [cfg, setCfg] = useState<ConfigInfo | null>(null)
  const [tab, setTab] = useState<Tab>('cola')
  const [sel, setSel] = useState<{ bag: BoardBag; unit: number | null } | null>(null)
  const toast = useToast()

  useEffect(() => {
    apiGet<Me>('me').then(m => { setMe(m); debugSetExtra({ user: m.profile.email, role: m.profile.role, permissions: m.permissions }) }).catch(e => setMeErr(e.message))
  }, [])

  const loadBoard = useCallback(async () => {
    try {
      const b = await apiGet<Board>('board')
      setBoard(b)
      debugSetExtra({ items: b.debug.items, fromTars: b.debug.fromTars, bags: b.debug.bagCount, warnings: b.debug.warnings, config: b.config })
    } catch (e: any) { toast.show(e.message, true) }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!me?.permissions.laundry) return
    loadBoard()
    apiGet<ConfigInfo>('config').then(setCfg).catch(() => {})
    const t = setInterval(loadBoard, 60000)
    return () => clearInterval(t)
  }, [me, loadBoard])

  if (meErr) return <Gate text={`No pude verificar tu acceso: ${meErr}`} />
  if (!me) return <div className="min-h-screen flex items-center justify-center"><Spinner size={28} /></div>
  if (!me.permissions.laundry) return <Gate text="Tu usuario no tiene acceso a Laundry. Pídele a un administrador que lo active." />

  const tabs: { k: Tab; label: string; icon: JSX.Element; show: boolean }[] = [
    { k: 'cola', label: 'Inicio', icon: <LayoutList className="w-5 h-5" />, show: true },
    { k: 'scan', label: 'Escanear', icon: <ScanLine className="w-5 h-5" />, show: true },
    { k: 'inv', label: 'Inventario', icon: <Boxes className="w-5 h-5" />, show: true },
    { k: 'inc', label: 'Incidentes', icon: <AlertTriangle className="w-5 h-5" />, show: true },
    { k: 'kpi', label: 'KPIs', icon: <BarChart3 className="w-5 h-5" />, show: true },
    { k: 'etq', label: 'Etiquetas', icon: <QrCode className="w-5 h-5" />, show: me.permissions.admin },
  ]
  const items = cfg ? [] : []
  const bagItems = board?.debug.items || items

  return (
    <div className="min-h-screen pb-24" style={{ background: C.bg }}>
      {toast.node}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between no-print" style={{ background: 'white', borderBottom: `1px solid ${C.border}` }}>
        <h1 className="text-[17px] font-semibold" style={{ color: C.ink }}>ShineUp Laundry</h1>
        <button onClick={() => supabase.auth.signOut()} style={{ color: C.slate }}><LogOut className="w-5 h-5" /></button>
      </header>
      <main className="p-4 max-w-2xl mx-auto">
        {!board && tab !== 'etq' && tab !== 'kpi' && tab !== 'inc' ? <div className="flex justify-center py-10"><Spinner size={28} /></div> : (
          <>
            {tab === 'cola' && board && <BoardPage board={board} onOpen={b => setSel({ bag: b, unit: null })} />}
            {tab === 'scan' && board && <ScanPage bags={board.bags} onFound={(b, u) => setSel({ bag: b, unit: u })} onMsg={toast.show} />}
            {tab === 'inv' && board && <InventoryPage board={board} onOpen={b => setSel({ bag: b, unit: null })} />}
            {tab === 'inc' && <IncidentsPage me={me} cfg={cfg} onMsg={toast.show} />}
            {tab === 'kpi' && <KpiPage onMsg={toast.show} />}
            {tab === 'etq' && <LabelsPage onMsg={toast.show} />}
          </>
        )}
        {tab === 'cola' && board && <p className="text-center text-[10px] mt-4" style={{ color: C.muted }}>Actualizado {board.today} · {board.debug.ms} ms</p>}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 grid no-print" style={{ background: 'white', borderTop: `1px solid ${C.border}`, gridTemplateColumns: `repeat(${tabs.filter(t => t.show).length}, 1fr)` }}>
        {tabs.filter(t => t.show).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className="py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-medium" style={{ color: tab === t.k ? C.tealDark : C.muted }}>{t.icon}{t.label}</button>
        ))}
      </nav>
      <DebugPanel />
      {sel && (
        <BagSheet bag={sel.bag} items={bagItems} unit={sel.unit} canOperate={me.permissions.laundry}
          onClose={() => setSel(null)}
          onChanged={m => { setSel(null); toast.show(m); loadBoard() }}
          onError={m => toast.show(m, true)} />
      )}
    </div>
  )
}

function Gate({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.bg }}>
      <div className="max-w-sm rounded-xl p-6 text-center space-y-3" style={{ background: 'white' }}>
        <p className="text-[14px]" style={{ color: C.ink }}>{text}</p>
        <Btn ghost color={C.slate} onClick={() => supabase.auth.signOut()}>Cerrar sesión</Btn>
      </div>
    </div>
  )
}
