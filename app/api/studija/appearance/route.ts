// POST /api/studija/appearance — viešos anketos išvaizda (tema, akcentas, sekcijos).
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'

const SECTIONS = ['social','events','gallery','similar']

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId)) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })
  const patch: Record<string, any> = {}
  if (body?.profile_theme === 'dark' || body?.profile_theme === 'light') patch.profile_theme = body.profile_theme
  if (typeof body?.accent_color === 'string') patch.accent_color = /^#[0-9a-fA-F]{6}$/.test(body.accent_color) ? body.accent_color : null
  if (body?.accent_color === null) patch.accent_color = null
  if (Array.isArray(body?.hidden_sections)) patch.hidden_sections = body.hidden_sections.filter((s: any) => SECTIONS.includes(s))
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nieko nekeičiama' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('artists').update(patch).eq('id', artistId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true })
}
