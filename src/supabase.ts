import { createClient } from '@supabase/supabase-js'

// Mismo proyecto de Supabase que Ops y Admin (login compartido).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jpdajjiaukzilrxwcgtx.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_lVelTDSvaDDwvSGRLINQ8A_9eSKcZVP'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
})

// Cliente solo para subir fotos (igual que Ops: usa la anon key clásica del bucket "media").
const STORAGE_KEY = import.meta.env.VITE_SUPABASE_STORAGE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZGFqamlhdWt6aWxyeHdjZ3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODM5ODIsImV4cCI6MjA4OTQ1OTk4Mn0.IRMW4Z4azVy6xKqGYb39tD91onTKhdnYnDTvO3ouYtE'
export const storageClient = createClient(SUPABASE_URL, STORAGE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
