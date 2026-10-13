import { supabase } from '@/lib/supabase'
import { positiveInteger } from '@/lib/security'
import type { Role } from '@/types'

/** Una credencial recién creada o restablecida (la contraseña solo se muestra una vez). */
export type Credential = {
  kind: Role
  name: string
  username: string
  password: string | null
  detail?: string | null
}

export type CredentialsResult = { created: Credential[]; skipped: { name: string; reason: string }[] }

export type StaffAccount = {
  profile_id: string
  full_name: string | null
  role: Role
  username: string
  is_active: boolean
  last_sign_in_at: string | null
  created_at: string
  offerings: number
  tutor_of: number
}

export type RosterRow = {
  kind: 'STUDENT' | 'GUARDIAN'
  person_id: number
  name: string
  dni: string | null
  student_name: string | null
  profile_id: string | null
  username: string | null
  is_active: boolean | null
  last_sign_in_at: string | null
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export const listStaffAccounts = () => rpc<StaffAccount[]>('admin_list_accounts')

export const classroomRoster = async (classroomId: number) =>
  (await rpc<RosterRow[]>('admin_classroom_roster', { p_classroom_id: positiveInteger(classroomId) }))
    .map((r) => ({ ...r, person_id: Number(r.person_id) }))

export const createClassroomAccounts = (classroomId: number, includeGuardians: boolean) =>
  rpc<CredentialsResult>('admin_classroom_accounts', { p_classroom_id: positiveInteger(classroomId), p_include_guardians: includeGuardians })

export async function createStaff(email: string, fullName: string, role: Role): Promise<CredentialsResult> {
  const row = await rpc<Credential>('admin_create_staff', { p_email: email, p_full_name: fullName, p_role: role })
  return { created: [row], skipped: [] }
}

export async function resetPassword(profileId: string): Promise<CredentialsResult> {
  const row = await rpc<Credential>('admin_reset_password', { p_profile_id: profileId })
  return { created: [row], skipped: [] }
}

export const setAccountActive = (profileId: string, active: boolean) =>
  rpc<void>('admin_set_active', { p_profile_id: profileId, p_active: active })

export const updateAccount = (profileId: string, fullName: string, email?: string) =>
  rpc<void>('admin_update_account', { p_profile_id: profileId, p_full_name: fullName, p_email: email || null })

/** Código provisional que usa un alumno sin DNI (igual que en la base). */
export const studentCode = (studentId: number) => `A${String(studentId).padStart(7, '0')}`
