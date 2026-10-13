import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const LOGIN_DOMAIN: string = import.meta.env.VITE_LOGIN_DOMAIN || 'campus.tesla.edu.pe'

export const BUCKET_MATERIALS = 'campus-materials'
export const BUCKET_SUBMISSIONS = 'campus-submissions'
