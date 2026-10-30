import { useState } from 'react'
import { supabase } from '../supabase'
import { Btn, C, inputStyle } from './ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    if (error) setErr(error.message)
    setBusy(false)
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.bg }}>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-3" style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <h1 className="text-[22px] font-black" style={{ color: C.ink }}>ShineUp Laundry</h1>
        <p className="text-[13px]" style={{ color: C.slate }}>Entra con tu cuenta de ShineUp.</p>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" autoCapitalize="none" style={inputStyle} />
        <input value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" type="password" style={inputStyle} onKeyDown={e => e.key === 'Enter' && go()} />
        {err && <p className="text-[12px] font-semibold" style={{ color: C.red }}>{err}</p>}
        <Btn onClick={go} disabled={busy || !email || !pass}>Entrar</Btn>
      </div>
    </div>
  )
}
