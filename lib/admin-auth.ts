// ─────────────────────────────────────────────────────────────────────────
// Bendri admin auth helperiai API route'ams (server runtime).
//
// Pakeičia ~30 nukopijuotų inline `requireAdmin()` route'uose. Rolių logika
// gyvena lib/admin-sections.ts (vienas tiesos šaltinis). Middleware jau
// priverčia minRole pagal kelią — šie helperiai yra defense-in-depth route lygyje.
//
// Naudojimas:
//   import { requireAdmin, requireFullAdmin } from '@/lib/admin-auth'
//   const session = await requireAdmin()           // editor ir aukščiau
//   if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
//
//   const session = await requireFullAdmin()        // tik admin / super_admin
// ─────────────────────────────────────────────────────────────────────────

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasMinRole, type MinRole, type Role } from '@/lib/admin-sections'

export type AdminSession = Awaited<ReturnType<typeof getServerSession>>

/** Grąžina sesiją jei rolė ≥ `min`, kitaip null. */
export async function requireRole(min: MinRole): Promise<AdminSession | null> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as Role
  if (!session?.user || !hasMinRole(role, min)) return null
  return session
}

/** Regular admin (editor) ir aukščiau — turinys, moderavimas, augimas. */
export function requireAdmin(): Promise<AdminSession | null> {
  return requireRole('editor')
}

/** Pilna admin rolė (admin / super_admin) — migracija, sistema, vartotojai. */
export function requireFullAdmin(): Promise<AdminSession | null> {
  return requireRole('admin')
}
