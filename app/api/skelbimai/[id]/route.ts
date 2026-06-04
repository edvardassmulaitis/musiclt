// app/api/skelbimai/[id]/route.ts
//
// PATCH  — atnaujinti savo skelbimą (status keitimas: reserved/closed/active,
//          pratęsimas). Tik savininkas arba admin.
// DELETE — ištrinti savo skelbimą (soft? — hard delete; saves cascade'ina).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'

const ALLOWED_STATUS: string[] = ['active', 'reserved', 'closed']

async function ownerGuard(id: string) {
  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const viewerId = await resolveAuthorId(sb, session)
  if (!viewerId) return { error: 'Reikia prisijungti', status: 401 as const }
  const role = (session?.user as any)?.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  const { data: row, error } = await sb.from('listings').select('id,author_id').eq('id', id).maybeSingle()
  if (error) return { error: error.message, status: 500 as const }
  if (!row) return { error: 'Skelbimas nerastas', status: 404 as const }
  if (row.author_id !== viewerId && !isAdmin) return { error: 'Neturite teisių', status: 403 as const }
  return { sb, viewerId, isAdmin }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const guard = await ownerGuard(id)
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { sb } = guard

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, any> = {}

  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: 'Neteisingas statusas' }, { status: 400 })
    }
    patch.status = body.status
  }
  // Pratęsimas — pastumiam expires_at 30 dienų į priekį.
  if (body.extend === true) {
    patch.expires_at = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    patch.status = 'active'
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nėra ką atnaujinti' }, { status: 400 })
  }

  const { error } = await sb.from('listings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const guard = await ownerGuard(id)
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { sb } = guard

  const { error } = await sb.from('listings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
