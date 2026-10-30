// Códigos: M-AH-GL-1 (el guardado es el de la 1.ª maleta del juego; con 2 maletas son -1 y -2).
// Códigos viejos (C-014) siguen funcionando como C-014-1, C-014-2.
const NEW_CODE = /^(M-[A-Z]{2}-[A-Z]{2})-(\d{1,2})$/
export const codeParts = (code?: string | null) => {
  const m = String(code || '').toUpperCase().match(NEW_CODE)
  return m ? { prefix: m[1], start: Number(m[2]) } : null
}

export function resolveLocal<T extends { code: string | null; qty: number }>(raw: string, bags: T[]): { bag: T; unit: number | null } | null {
  const code = raw.trim().toUpperCase()
  const np = codeParts(code)
  if (np) {
    for (const b of bags) {
      const bp = codeParts(b.code)
      if (bp && bp.prefix === np.prefix && np.start >= bp.start && np.start < bp.start + (b.qty || 1)) return { bag: b, unit: np.start - bp.start + 1 }
    }
  }
  const exact = bags.find(b => (b.code || '').toUpperCase() === code)
  if (exact) return { bag: exact, unit: null }
  const m = code.match(/^(.*)-(\d{1,2})$/)
  if (m) {
    const b = bags.find(x => (x.code || '').toUpperCase() === m[1] && !codeParts(x.code))
    if (b) return { bag: b, unit: Number(m[2]) }
  }
  return null
}
