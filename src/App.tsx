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

  const visible = tabs.filter(t => t.show)
  const current = visible.find(t => t.k === tab) || visible[0]
  const dateTxt = (() => { const t = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/New_York' }); return t.charAt(0).toUpperCase() + t.slice(1) })()
  const SIDE = 'linear-gradient(180deg,#E9944F 0%,#DB8240 55%,#C26F32 100%)'

  return (
    <div className="min-h-screen pb-20 md:pb-0" style={{ background: C.bg }}>
      {toast.node}

      {/* Barra lateral (escritorio) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[232px] flex-col no-print z-30" style={{ background: SIDE }}>
        <div className="px-5 pt-6 pb-5">
          <p className="text-[26px] font-extrabold tracking-tight leading-none text-white">Shine<span style={{ color: '#431407' }}>UP</span></p>
          <p className="text-[14px] font-bold mt-1.5" style={{ color: '#431407' }}>Laundry</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {visible.map(t => {
            const on = tab === t.k
            return (
              <button key={t.k} onClick={() => setTab(t.k)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-left transition-colors"
                style={{ background: on ? 'rgba(255,255,255,0.20)' : 'transparent', color: on ? '#FFFFFF' : '#FFEDD5' }}>
                {t.icon}{t.label}
              </button>
            )
          })}
        </nav>
        <div className="px-4 py-4 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium truncate text-white">{me.profile.full_name || me.profile.email}</p>
            <p className="text-[10px] truncate" style={{ color: '#FED7AA' }}>{me.profile.role}</p>
          </div>
          <button onClick={() => supabase.auth.signOut()} title="Salir" style={{ color: '#FFEDD5' }}><LogOut className="w-4 h-4" /></button>
        </div>
      </aside>

      {/* Barra superior (celular) */}
      <header className="md:hidden sticky top-0 z-30 px-4 h-12 flex items-center justify-between no-print" style={{ background: 'white', borderBottom: `1px solid ${C.border}` }}>
        <span className="text-[18px] font-extrabold tracking-tight" style={{ color: C.ink }}>Shine<span style={{ color: '#EA580C' }}>UP</span> <span className="text-[10px] font-semibold uppercase align-middle" style={{ color: C.muted, letterSpacing: '0.2em' }}>Laundry</span></span>
        <button onClick={() => supabase.auth.signOut()} style={{ color: C.slate }}><LogOut className="w-[18px] h-[18px]" /></button>
      </header>

      <div className="md:pl-[232px]">
        <main className="p-4 md:px-8 md:py-8 max-w-3xl md:max-w-4xl mx-auto">
          <div className="hidden md:block mb-6 no-print">
            <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>{current.label}</h1>
            <p className="text-[13px] mt-0.5" style={{ color: C.muted }}>{dateTxt}</p>
          </div>
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
      </div>

      {/* Barra inferior (celular) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid no-print" style={{ background: 'white', borderTop: `1px solid ${C.border}`, gridTemplateColumns: `repeat(${visible.length}, 1fr)` }}>
        {visible.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className="py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-medium" style={{ color: tab === t.k ? C.tealDark : C.muted }}>{t.icon}{t.label}</button>
        ))}
      </nav>
      {me.permissions.admin && <DebugPanel />}
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
