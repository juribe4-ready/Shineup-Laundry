import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Lector de QR dentro de la app: usa BarcodeDetector si el navegador lo trae; si no, jsQR.
// El QR guarda un código de texto simple (ej. C-014-2): funciona sin internet.
export default function Scanner({ onCode, paused = false }: { onCode: (code: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  const onCodeRef = useRef(onCode)
  const [error, setError] = useState('')
  pausedRef.current = paused
  onCodeRef.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    let last = { code: '', at: 0 }
    const Detector = (window as any).BarcodeDetector
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

    const emit = (code: string) => {
      const now = Date.now()
      if (code === last.code && now - last.at < 2500) return
      last = { code, at: now }
      if (navigator.vibrate) navigator.vibrate(60)
      onCodeRef.current(code.trim())
    }

    const tick = async () => {
      if (stopped) return
      const v = videoRef.current
      if (v && v.readyState >= 2 && !pausedRef.current) {
        try {
          if (detector) {
            const found = await detector.detect(v)
            if (found[0]?.rawValue) emit(found[0].rawValue)
          } else if (canvasRef.current) {
            const c = canvasRef.current
            const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w) || 360
            c.width = w; c.height = h
            const ctx = c.getContext('2d', { willReadFrequently: true })!
            ctx.drawImage(v, 0, 0, w, h)
            const img = ctx.getImageData(0, 0, w, h)
            const res = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
            if (res?.data) emit(res.data)
          }
        } catch { /* frame ilegible */ }
      }
      timer = window.setTimeout(tick, 220)
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        const v = videoRef.current!
        v.srcObject = stream
        v.setAttribute('playsinline', 'true')
        await v.play()
        tick()
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError' ? 'Permite el acceso a la cámara para escanear (o escribe el código a mano).' : `No se pudo abrir la cámara: ${e?.message || e}`)
      }
    })()

    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#000', aspectRatio: '4 / 3' }}>
      <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div style={{ width: '58%', aspectRatio: '1', border: '3px solid rgba(255,255,255,0.85)', borderRadius: 24, boxShadow: '0 0 0 999px rgba(0,0,0,0.25)' }} />
      </div>
      {error && <div className="absolute inset-x-0 bottom-0 p-3 text-[12px] font-semibold text-white text-center" style={{ background: 'rgba(239,68,68,0.92)' }}>{error}</div>}
    </div>
  )
}
