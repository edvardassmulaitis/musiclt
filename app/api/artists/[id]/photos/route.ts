import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Extract photographer name + license from the caption "author" string.
 *  Formats seen so far:
 *    - "Brianhphoto · CC BY-SA 4.0"
 *    - "Brianhphoto - CC BY-SA 4.0"
 *    - "Jonas Petraitis" (no license)
 *  We split on the common separators and treat everything after as the
 *  license. Input should already be trimmed. */
function splitAuthorLicense(raw: string): { name: string; license: string | null } {
  if (!raw) return { name: '', license: null }
  const m = raw.match(/^(.+?)\s*[·•|]\s*(.+)$/) || raw.match(/^(.+?)\s+-\s+(.+)$/)
  if (m) return { name: m[1].trim(), license: m[2].trim() }
  return { name: raw.trim(), license: null }
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')     // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'fotografas'
}

/** Return the id of an existing photographer row that matches, or create
 *  one and return its new id. Dedup order:
 *    1. Case-insensitive name match
 *    2. Wikimedia username canonical URL (falls back to external_url eq)
 *    3. Insert new row
 *  Keeping the URL-based match means the same Wikimedia user always lands
 *  on the same photographer row even if attributions vary (trailing
 *  whitespace, "(photographer)", etc.). */
async function resolvePhotographerId(name: string, sourceUrl: string | null): Promise<number | null> {
  const n = name.trim()
  if (!n) return null

  // 1) Case-insensitive name match
  const { data: byName } = await supabase
    .from('photographers')
    .select('id')
    .ilike('name', n)
    .limit(1)
  if (byName && byName[0]) return (byName[0] as any).id as number

  // 2) Infer canonical source + external URL
  let source: string | null = null
  let externalUrl: string | null = null
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname
      if (host.includes('wikimedia.org') || host.includes('wikipedia.org')) {
        source = 'wikimedia'
        externalUrl = `https://commons.wikimedia.org/wiki/User:${encodeURIComponent(n)}`
      } else if (host.includes('flickr')) {
        source = 'flickr'
      } else {
        source = 'direct'
      }
    } catch {}
  }

  // 3) Match existing by external_url (strong signal for Wikimedia + others
  //    that carry a canonical profile link). If the URL is already taken,
  //    reuse that row regardless of how the name was spelled this time.
  if (externalUrl) {
    const { data: byUrl } = await supabase
      .from('photographers')
      .select('id')
      .eq('external_url', externalUrl)
      .limit(1)
    if (byUrl && byUrl[0]) return (byUrl[0] as any).id as number
  }

  // 4) Ensure slug uniqueness — collisions are rare but possible
  const base = slugifyName(n)
  let slug = base
  for (let i = 2; i < 20; i++) {
    const { data: clash } = await supabase
      .from('photographers')
      .select('id')
      .eq('slug', slug)
      .limit(1)
    if (!clash || clash.length === 0) break
    slug = `${base}-${i}`
  }

  const { data: inserted, error } = await supabase
    .from('photographers')
    .insert({ name: n, slug, source, external_url: externalUrl })
    .select('id')
    .single()
  if (error) {
    console.error('[photos] photographer insert failed:', error.message)
    return null
  }
  return inserted?.id ?? null
}

/** Legacy caption encoding — preserved so existing readers that parse the
 *  JSON blob keep working. Going forward, photographer_id / license /
 *  source_url are the canonical storage. */
function encodeCaption(p: any): string | null {
  const a = p.author || ''
  const s = p.sourceUrl || ''
  if (!a && !s) return p.caption || null
  return JSON.stringify({ a, s })
}

// PUT /api/artists/[id]/photos — replace all photos for artist.
//
// For each incoming photo we:
//   1. Split the author string into { name, license }.
//   2. Resolve (or create) a photographer row for the name.
//   3. Store photographer_id + license + source_url on the artist_photos row.
//   4. Keep the legacy JSON caption populated for backward compatibility.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const artistId = parseInt(id)
  if (isNaN(artistId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { photos } = await req.json()
  if (!Array.isArray(photos)) return NextResponse.json({ error: 'photos must be array' }, { status: 400 })

  const validPhotos = photos.filter((p: any) => p?.url && typeof p.url === 'string' && !p.url.startsWith('data:'))

  const { error: delError } = await supabase.from('artist_photos').delete().eq('artist_id', artistId)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  if (validPhotos.length > 0) {
    // Resolve photographer ids sequentially — small N (< ~50) and we want
    // strict ordering on inserts/slugs to avoid race conditions.
    const rows: any[] = []
    for (let i = 0; i < validPhotos.length; i++) {
      const p = validPhotos[i]
      const { name, license } = splitAuthorLicense(p.author || '')
      const sourceUrl = typeof p.sourceUrl === 'string' ? p.sourceUrl : null
      const photographerId = name ? await resolvePhotographerId(name, sourceUrl) : null
      // Accept `takenAt` / `taken_at` / `date` — stored as DATE, so normalize
      // anything that looks like an ISO-ish string into yyyy-mm-dd.
      const rawDate = p.takenAt || p.taken_at || p.date || null
      let takenAt: string | null = null
      if (typeof rawDate === 'string' && rawDate.trim()) {
        const d = new Date(rawDate.trim())
        if (isFinite(d.getTime())) {
          takenAt = d.toISOString().slice(0, 10)
        }
      }
      rows.push({
        artist_id: artistId,
        url: p.url,
        caption: encodeCaption(p),
        photographer_id: photographerId,
        license,
        source_url: sourceUrl,
        taken_at: takenAt,
        sort_order: i,
      })
    }

    const { error: insError } = await supabase.from('artist_photos').insert(rows)
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: validPhotos.length })
}
