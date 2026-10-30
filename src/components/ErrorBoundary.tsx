import { Component, ReactNode } from 'react'

// Evita la pantalla en blanco: si algo falla al pintar, muestra el error (y el panel 🐞 sigue disponible).
export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F8FAFC', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ maxWidth: 420, background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
          <p style={{ fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>Algo falló al mostrar esta pantalla</p>
          <p style={{ fontSize: 12, color: '#EF4444', wordBreak: 'break-word', marginBottom: 12 }}>{String(this.state.err.message || this.state.err)}</p>
          <button onClick={() => location.reload()} style={{ background: '#0097A7', color: 'white', border: 0, borderRadius: 10, padding: '10px 14px', fontWeight: 600, width: '100%' }}>Recargar</button>
        </div>
      </div>
    )
  }
}
