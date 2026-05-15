import { NextRequest, NextResponse } from 'next/server'
import { getAlbums, createAlbum } from '@/lib/supabase-albums'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get('artist_id')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const search = searchParams.get('search') || ''

  // ── Dublikatų tikrinimas: ?check_titles=[...]&artist_id=123 ────────────────
  // Naudojam case-insensitive + punctuation-normalized match'ą client-side,
  // kad Wiki "Made in Heaven" sutaptų su music.lt "Made In Heaven" (didžiosios I).
  // Anksčiau .in('title', titles) Postgres'e yra exact match — todėl Wiki Import
  // tab'as rodydavo music.lt scrape'intus albums kaip naujus.
  const checkTitles = searchParams.get('check_titles')
  if (checkTitles && artistId) {
    try {
      const titles: string[] = JSON.parse(checkTitles)
      const supabase = createAdminClient()
      // Paimam visus atlikėjo albums (paprastai < 100), match'inam client-side
      const { data } = await supabase
        .from('albums')
        .select('id, title')
        .eq('artist_id', parseInt(artistId))
      // Article-strip leading "a"/"the"/"an" — music.lt'as dažnai praleidžia
      // priekyje (LT convention'as), Wiki išlaiko. Be šito "A Night at the Opera"
      // (Wiki) nesutampa su "Night At The Opera" (music.lt).
      const norm = (s: string) => s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(the|a|an)\s+/, '')
      const dbByNorm: Record<string, { id: number; original: string }> = {}
      for (const row of data || []) {
        const k = norm(row.title)
        if (!dbByNorm[k]) dbByNorm[k] = { id: row.id, original: row.title }
      }
      const found: Record<string, number> = {}
      for (const t of titles) {
        const k = norm(t)
        if (dbByNorm[k]) found[t.toLowerCase()] = dbByNorm[k].id
      }
      return NextResponse.json({ found })
    } catch {
      return NextResponse.json({ found: {} })
    }
  }

  try {
    const result = await getAlbums(artistId ? parseInt(artistId) : undefined, limit, offset, search)
    // Vercel CDN edge cache — homepage'as kviečia šitą kiekvienam load'ui;
    // be cache'o kiekvienas hits Supabase. s-maxage=60 + SWR=300:
    //   • 60s response'ą serve'ina iš edge per <50ms
    //   • toliau 300s rodo seną response'ą + tyliai re-fetch'ina background'e
    // Public, no auth — saugu cache'inti.
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await req.json()
    const id = await createAlbum(data)
    return NextResponse.json({ id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
