// app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateProfile, isUsernameTaken } from '@/lib/supabase-blog'
import { resolveProfile } from '@/lib/profile-resolve'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    // resolveProfile sutvarko ID drift'us po wipe'ų — vietoj null grąžina
    // tikrai egzistuojantį profilį (jei reikia, sukurtą).
    const profile = await resolveProfile(session)
    if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })
    return NextResponse.json(profile)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })

  const body = await req.json()
  const allowed = ['full_name', 'username', 'bio', 'website', 'avatar_url', 'cover_image_url', 'social_twitter', 'social_spotify', 'social_youtube', 'social_tiktok', 'is_public']
  const updates: Record<string, any> = {}
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k]

  // Validate username
  if (updates.username) {
    const clean = updates.username.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30)
    if (clean.length < 3) return NextResponse.json({ error: 'Username per trumpas (min 3)' }, { status: 400 })
    if (await isUsernameTaken(clean, profile.id)) return NextResponse.json({ error: 'Šis username jau užimtas' }, { status: 400 })
    updates.username = clean
  }

  try {
    await updateProfile(profile.id, updates)
    return NextResponse.json({ ok: true, profile_id: profile.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
