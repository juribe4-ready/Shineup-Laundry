import { storageClient } from '../supabase'
import { debugLog } from './debug'

// Reduce la foto (máx. 1600 px, JPEG 0.72) para que suba rápido incluso con poca señal.
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.72))
    return blob || file
  } catch { return file }
}

export async function uploadPhoto(file: File | Blob, tag: string): Promise<string> {
  const blob = file instanceof File ? await compressImage(file) : file
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const safe = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
  const path = `laundry/${ts}_${safe}_${Math.random().toString(36).slice(2, 7)}.jpg`
  const { error } = await storageClient.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) { debugLog({ kind: 'photo', label: 'subir foto', error: error.message }); throw new Error(error.message) }
  debugLog({ kind: 'photo', label: 'subir foto', status: 200 })
  return storageClient.storage.from('media').getPublicUrl(path).data.publicUrl
}
