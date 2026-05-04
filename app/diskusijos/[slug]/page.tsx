import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import Link from 'next/link'

interface Props {
  params: Promise<{ slug: string }>
}

async function getDiscussion(slug: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('discussions')
    .select('*')
    .eq('slug', slug)
    .eq('is_deleted', false)
    .single()
  return data
}

type TopContributor = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  count: number
}

/** Iš VISŲ komentarų šitos diskusijos surenkam author_id'us, suaggregojam,
 *  paimam top 5 ir resolve'inam į profilio info. */
async function getTopContributors(discussionId: number): Promise<TopContributor[]> {
  const supabase = createAdminClient()
  // Fetch all author_ids paginated (1000-row PostgREST cap)
  const counts = new Map<string, number>()
  let offset = 0
  const limit = 1000
  for (let page = 0; page < 50; page++) {
    const { data } = await supabase
      .from('comments')
      .select('author_id')
      .eq('discussion_id', discussionId)
      .eq('is_deleted', false)
      .not('author_id', 'is', null)
      .range(offset, offset + limit - 1)
    if (!data || data.length === 0) break
    for (const r of data as Array<{ author_id: string | null }>) {
      if (r.author_id) counts.set(r.author_id, (counts.get(r.author_id) || 0) + 1)
    }
    if (data.length < limit) break
    offset += limit
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (top.length === 0) return []
  const ids = top.map(([id]) => id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,username,full_name,avatar_url')
    .in('id', ids)
  const profMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]))
  return top.map(([id, count]) => {
    const p = profMap.get(id) || {}
    return {
      id, count,
      username: p.username || null,
      full_name: p.full_name || null,
      avatar_url: p.avatar_url || null,
    }
  })
}

type MentionedTrack = {
  id: number
  legacy_id: number | null
  slug: string
  title: string
  cover_url: string | null
  artist_name: string | null
  artist_slug: string | null
  mention_count: number
}

/** Parsina visus comments šitam thread'ui dviem paraleliais kanalais:
 *  1) modern komentarai per `music_attachments` JSONB (MusicSearchPicker'iu prikabintos dainos)
 *  2) legacy komentarai per `/lt/daina/{slug}/{id}/` URL'us body tekste
 *  Suaggregojam pagal track id (prefer'inam modern track.id; legacy ID'us
 *  resolve'inam per tracks.legacy_id lookup'ą). Top 12 mentioned. */
async function getMentionedTracks(discussionId: number): Promise<MentionedTrack[]> {
  const supabase = createAdminClient()

  // ── Modern: music_attachments JSONB rinkimas ──
  // Atskiri ID'ai per attachment (modern šaltinis turi {id, type, slug, title, ...}).
  const modernIdCounts = new Map<number, { count: number; preview: any }>()
  // ── Legacy: legacy_id iš URL'ų ──
  const legacyIdCounts = new Map<number, number>()

  let offset = 0
  const limit = 1000
  for (let page = 0; page < 50; page++) {
    const { data } = await supabase
      .from('comments')
      .select('body, music_attachments')
      .eq('discussion_id', discussionId)
      .eq('is_deleted', false)
      .or('body.ilike.%/lt/daina/%,music_attachments.not.is.null')
      .range(offset, offset + limit - 1)
    if (!data || data.length === 0) break
    for (const r of data as Array<{ body: string | null; music_attachments: any }>) {
      // 1) Modern attachments
      const atts = Array.isArray(r.music_attachments) ? r.music_attachments : null
      if (atts) {
        const seenInComment = new Set<number>()
        for (const a of atts) {
          if (a?.type === 'daina' && typeof a.id === 'number') {
            if (seenInComment.has(a.id)) continue
            seenInComment.add(a.id)
            const cur = modernIdCounts.get(a.id)
            if (cur) cur.count += 1
            else modernIdCounts.set(a.id, { count: 1, preview: a })
          }
        }
      }
      // 2) Legacy URL-extracted IDs
      const body = r.body || ''
      if (body.includes('/lt/daina/')) {
        const re = /\/lt\/daina\/[^/\s]+\/(\d+)\//g
        let m: RegExpExecArray | null
        const seen = new Set<number>()
        while ((m = re.exec(body)) !== null) {
          const id = parseInt(m[1], 10)
          if (!Number.isFinite(id) || seen.has(id)) continue
          seen.add(id)
          legacyIdCounts.set(id, (legacyIdCounts.get(id) || 0) + 1)
        }
      }
    }
    if (data.length < limit) break
    offset += limit
  }

  // Lookup'inam track rows abiem rinkiniam (track.id ir track.legacy_id)
  const modernIds = [...modernIdCounts.keys()]
  const legacyIds = [...legacyIdCounts.keys()]

  const lookups = await Promise.all([
    modernIds.length
      ? supabase.from('tracks').select('id,legacy_id,slug,title,cover_url,artists!tracks_artist_id_fkey(name,slug)').in('id', modernIds)
      : Promise.resolve({ data: [] }),
    legacyIds.length
      ? supabase.from('tracks').select('id,legacy_id,slug,title,cover_url,artists!tracks_artist_id_fkey(name,slug)').in('legacy_id', legacyIds)
      : Promise.resolve({ data: [] }),
  ])

  // Suaggregojam: track.id = canonical key
  const merged = new Map<number, MentionedTrack>()
  const addOrBump = (t: any, addCount: number) => {
    if (!t) return
    const key = t.id as number
    const ex = merged.get(key)
    if (ex) {
      ex.mention_count += addCount
    } else {
      merged.set(key, {
        id: t.id,
        legacy_id: t.legacy_id ?? null,
        slug: t.slug,
        title: t.title,
        cover_url: t.cover_url ?? null,
        artist_name: t.artists?.name || null,
        artist_slug: t.artists?.slug || null,
        mention_count: addCount,
      })
    }
  }
  for (const t of (lookups[0].data || []) as any[]) {
    const c = modernIdCounts.get(t.id)?.count || 0
    if (c) addOrBump(t, c)
  }
  for (const t of (lookups[1].data || []) as any[]) {
    const c = t.legacy_id != null ? (legacyIdCounts.get(t.legacy_id) || 0) : 0
    if (c) addOrBump(t, c)
  }

  return [...merged.values()].sort((a, b) => b.mention_count - a.mention_count).slice(0, 12)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const d = await getDiscussion(slug)
  if (!d) return { title: 'Diskusija nerasta' }
  return {
    title: `${d.title} | Diskusijos | music.lt`,
    description: (d.body || d.title || '').slice(0, 160),
  }
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
}

function bodyIsMeaningful(d: any): boolean {
  if (!d.body) return false
  const b = String(d.body).trim()
  if (!b) return false
  const t = String(d.title || '').trim()
  if (b === t) return false
  return true
}

function Initials({ name, size = 32 }: { name: string | null; size?: number }) {
  const ch = (name || '?').trim().charAt(0).toUpperCase() || '?'
  // Hash → hue, deterministic per username
  let h = 0
  for (let i = 0; i < (name || '').length; i++) { h = ((h << 5) - h) + (name || '').charCodeAt(i); h |= 0 }
  const hue = Math.abs(h) % 360
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: `hsl(${hue}, 38%, 26%)`, fontSize: Math.floor(size * 0.42) }}
    >
      {ch}
    </div>
  )
}

export default async function DiscussionPage({ params }: Props) {
  const { slug } = await params
  const discussion = await getDiscussion(slug)
  if (!discussion) notFound()

  const supabase = createAdminClient()
  await supabase
    .from('discussions')
    .update({ view_count: (discussion.view_count || 0) + 1 })
    .eq('id', discussion.id)

  // Sidebar duomenys lygiagrečiai
  const [topContributors, mentionedTracks] = await Promise.all([
    getTopContributors(discussion.id),
    getMentionedTracks(discussion.id),
  ])

  return (
    <div style={{ background: '#080d14', minHeight: '100vh' }}>
      <div className="mx-auto px-5 py-8" style={{ maxWidth: 1200 }}>
        <div className="mb-5 text-sm">
          <Link href="/diskusijos" className="text-gray-500 hover:text-white transition-colors">
            ← Diskusijos
          </Link>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
          {/* MAIN */}
          <div className="min-w-0">
            {Array.isArray(discussion.tags) && discussion.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {discussion.tags.map((tag: string) => (
                  <Link
                    key={tag}
                    href={`/diskusijos?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors hover:bg-indigo-500/30"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            <h1 className="mb-2 text-3xl font-black leading-tight text-white">
              {discussion.is_locked && <span className="mr-2 text-gray-600">🔒</span>}
              {discussion.is_pinned && <span className="mr-2 text-orange-400">📌</span>}
              {discussion.title}
            </h1>

            <div className="mb-6 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-400">{discussion.author_name || 'Vartotojas'}</span>
              <span className="text-gray-700">·</span>
              <span>{fmtDate(discussion.created_at)}</span>
            </div>

            {bodyIsMeaningful(discussion) && (
              <div
                className="mb-8 whitespace-pre-wrap text-sm leading-relaxed text-gray-300"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.5rem' }}
              >
                {discussion.body}
              </div>
            )}

            <EntityCommentsBlock
              entityType="discussion"
              entityId={discussion.id}
              title={`${(discussion.comment_count ?? 0).toLocaleString()} atsakymų`}
            />
          </div>

          {/* SIDEBAR */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 flex flex-col gap-3">
              {/* TOP NARIAI */}
              {topContributors.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">
                    Aktyviausi nariai
                  </div>
                  <ul className="space-y-2">
                    {topContributors.map((c, i) => {
                      const name = c.full_name || c.username || 'Vartotojas'
                      return (
                        <li key={c.id} className="flex items-center gap-2.5">
                          <span className="w-3 text-[10px] font-bold text-gray-600">{i + 1}.</span>
                          {c.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <Initials name={name} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-gray-200">{name}</div>
                            <div className="text-[10px] text-gray-500">{c.count.toLocaleString()} atsakym{c.count % 10 === 1 && c.count !== 11 ? 'as' : 'ai'}</div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* PAMINĖTOS DAINOS — pseudo-player'is, klausomas per click → track puslapis */}
              {mentionedTracks.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">
                      Paminėtos dainos
                    </div>
                    <div className="text-[10px] text-gray-600">{mentionedTracks.length}</div>
                  </div>
                  <ul className="space-y-2">
                    {mentionedTracks.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/dainos/${t.slug}-${t.id}`}
                          className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-white/5"
                        >
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/5">
                            {t.cover_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-gray-600">♪</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-gray-200">{t.title}</div>
                            <div className="truncate text-[10px] text-gray-500">{t.artist_name || ''}</div>
                          </div>
                          <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">×{t.mention_count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Panašios diskusijos placeholder'is — ateities feature */}
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-4 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-600">
                  Panašios diskusijos
                </div>
                <div className="mt-2 text-[11px] italic text-gray-600">netrukus</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
