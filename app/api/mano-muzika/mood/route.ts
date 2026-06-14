// app/api/mano-muzika/mood/route.ts
// POST   { track_id, label?, make_active? }  → pridėti nuotaikos dainą
// DELETE { track_id }                        → pašalinti
// PATCH  { track_id, active:true }           → nustatyti aktyvią (arba { active:null } išvalyti)
// PUT    { ordered_ids: number[] }           → perrikiuoti (mood_songs.id sekoje)
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '../_auth'
import { addMoodSong, removeMoodSong, setActiveMoodSong, reorderMoodSongs } from '@/lib/mano-muzika'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const trackId = Number(body.track_id)
  if (!Number.isFinite(trackId)) return NextResponse.json({ error: 'Truksta dainos' }, { status: 400 })
  try { return NextResponse.json(await addMoodSong(userId, trackId, body.label, !!body.make_active)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const trackId = Number(body.track_id)
  if (!Number.isFinite(trackId)) return NextResponse.json({ error: 'Truksta dainos' }, { status: 400 })
  try { return NextResponse.json(await removeMoodSong(userId, trackId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const trackId = body.active === null ? null : Number(body.track_id)
  if (trackId !== null && !Number.isFinite(trackId)) return NextResponse.json({ error: 'Truksta dainos' }, { status: 400 })
  try { return NextResponse.json(await setActiveMoodSong(userId, trackId)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(Number).filter(Number.isFinite) : null
  if (!ids) return NextResponse.json({ error: 'Blogi duomenys' }, { status: 400 })
  try { return NextResponse.json(await reorderMoodSongs(userId, ids)) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
