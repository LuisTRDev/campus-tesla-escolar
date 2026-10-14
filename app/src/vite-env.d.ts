/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_LOGIN_DOMAIN?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /** 'true' activa las subidas a Supabase Storage; cualquier otro valor (o vacío) = modo enlaces. */
  readonly VITE_FILE_UPLOADS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
