// app/api/home/community/route.ts
//
// GET /api/home/community → { items: CommunityItem[] }
//
// items[0] = Dienos daina (šiandien lyderis + kiti kandidatai)
// items[1..] = blog + diskusijos, 1 PER TIPĄ taisyklė:
//   tik 1 topas / 1 review / 1 creation / 1 translation / 1 discussion / ...
//
// Filtravimas:
//   - diskusijos: tik su activity paskutiniais 2 metais
//   - forum_posts: latest comment be parent_post_legacy_id filtro

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 180

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

function todayLT(): string {
  return new Date()
    .toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('.').reverse().join('-')
}
function ytThumb(url?: string | null): string | null {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}
function first<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// ── Kūryba/vertimas → tikros eilėraščio eilutės ────────────────────────────
// `summary` jau būna su sutrauktais newlines (eilutės susilieja į prozą), todėl
// poezijos eilutes ištraukiam iš pilno `content` (Tiptap HTML arba legacy plain
// text). Block tag'ai/<br> → \n; tag'ai nuvalomi; min. entity decode. Grąžinam
// iki `maxLines` eilučių, kiekvieną iki ~48 simb. (UI vis tiek truncate'ina).
function poemLinesFromContent(content: string | null | undefined, maxLines = 8): string[] {
  if (!content) return []
  let s = String(content)
  // Block-level pabaigos / <br> → eilutės lūžis
  s = s.replace(/<\s*br\s*\/?>/gi, '\n')
       .replace(/<\/\s*(p|div|h[1-6]|li|blockquote)\s*>/gi, '\n')
  // Likę tag'ai → pašalint
  s = s.replace(/<[^>]+>/g, '')
  // Minimalus HTML entity decode
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;|&apos;/gi, "'")
  const lines = s.split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(l => l.length > 48 ? l.slice(0, 48).trimEnd() + '…' : l)
  return lines.slice(0, maxLines)
}

export async function GET() {
  const sb = createAdminClient()
  const today = todayLT()
  const disc2y  = new Date(Date.now() - 2 * 365 * 86400000).toISOString()

  try {
    // SVARBU: kintamieji TIKSLIAI atitinka Promise.all eilutę (0-4).
    // Bet kokia keitimas čia turi atitikti destruktūrizacijos eilutę viršuje!
    // Paslėpti nariai (hide_from_homepage) išmetami PER UŽKLAUSĄ (!inner + not.is.true),
    // todėl atskiro profiles query nebėra ir limit'o negali užtvindyti vienas produktyvus paslėptas narys.
    const [nomRes, votesRes, pastWinnerRes, blogRes, discRes, discoveryRes] = await Promise.all([
      // 0 — Šiandieninės nominacijos (DD lyderis + kandidatai)
      sb.from('daily_song_nominations')
        .select('id, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .eq('date', today)
        .is('removed_at', null)
        .limit(20),

      // 1 — Balsai šiandien
      sb.from('daily_song_votes').select('nomination_id, weight').eq('date', today),

      // 2 — Vakarykštis laimėtojas (fallback)
      sb.from('daily_song_winners')
        .select('id, date, tracks!track_id(title, slug, cover_url, video_url, artists!artist_id(name, slug, cover_image_url))')
        .lt('date', today).order('date', { ascending: false }).limit(1).maybeSingle(),

      // 3 — Blog įrašai (naujausi NEPASLĖPTŲ narių; pakanka, kad užpildytų po 1 kiekvieno tipo).
      //   !inner join + hide_from_homepage=not.is.true → paslėpti nariai išmetami DB lygyje.
      //   Be 60d floor: imam naujausią KIEKVIENO tipo įrašą, net jei tipas retas (pvz. topas).
      sb.from('blog_posts')
        .select('id, slug, title, post_type, editorial_type, summary, content, cover_image_url, like_count, comment_count, published_at, list_items, target_track_id, target_album_id, target_artist_id, target_event_id, blogs:blog_id!inner(slug, profiles:user_id!inner(id, username, full_name, avatar_url, hide_from_homepage))')
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .not('blogs.profiles.hide_from_homepage', 'is', true)
        // Topas rodomas TIK patvirtintas (/admin/topai-vidiniai); kiti tipai be apribojimo.
        .or('post_type.neq.topas,topas_approved_at.not.is.null')
        .order('published_at', { ascending: false })
        .limit(200),

      // 4 — Diskusijos: activity 2y+, sort by last_comment_at
      sb.from('discussions')
        .select('id, slug, title, author_name, author_avatar, comment_count, created_at, last_comment_at, legacy_id, artist:artists!discussions_artist_id_fkey(name, cover_image_url)')
        .eq('is_deleted', false)
        .or('legacy_kind.is.null,legacy_kind.eq.discussion')
        .gte('comment_count', 1)
        .gte('last_comment_at', disc2y)
        .order('last_comment_at', { ascending: false, nullsFirst: false })
        .limit(20),

      // 5 — Muzikos atradimas (naujausias su embed'u).
      //   discoveries.author_id NETURI FK į profiles → autorių traukiam atskirai žemiau.
      sb.from('discoveries')
        .select('id, artist_name, artist_id, track_name, track_id, embed_type, embed_id, created_at, author_id, comment_id, tracks:track_id(cover_url), artists:artist_id(cover_image_url)')
        .not('embed_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    // ── Dienos daina ──────────────────────────────────────────────────────────
    const voteTotals: Record<number, number> = {}
    for (const v of (votesRes.data || []) as any[]) {
      voteTotals[v.nomination_id] = (voteTotals[v.nomination_id] || 0) + v.weight
    }
    const noms = [...((nomRes.data || []) as any[])]
      .sort((a, b) => (voteTotals[b.id] || 0) - (voteTotals[a.id] || 0))

    const makeDDCover = (nom: any) => {
      const track = nom.tracks
      const artist = first<any>(track?.artists)
      return ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null
    }
    const makeDDName = (nom: any) => first<any>(nom.tracks?.artists)?.name || null

    let ddItem: any = null
    if (noms.length) {
      const top = noms[0]
      const track = top.tracks
      const artist = first<any>(track?.artists)
      ddItem = {
        id: `dd_today_${top.id}`,
        type: 'dd', subtype: 'today_leader',
        title: track?.title || 'Dienos daina', href: '/dienos-daina',
        cover: makeDDCover(top),
        author_name: artist?.name || null, author_slug: artist?.slug || null, author_avatar: null,
        created_at: today,
        vote_count: voteTotals[top.id] || 0, vote_total: noms.length,
        // Kiti kandidatai (iki 5 — atvaizduojama kaip topo eilutės)
        candidates: noms.slice(1, 6).map((n, i) => ({
          rank: i + 2,
          title: n.tracks?.title || '?',
          artist: makeDDName(n),
          cover: makeDDCover(n),
          votes: voteTotals[n.id] || 0,
        })),
      }
    } else if (pastWinnerRes.data) {
      const w = pastWinnerRes.data as any
      const track = w.tracks
      const artist = first<any>(track?.artists)
      // Laimėtojo dienos kiti kandidatai (pagal tos dienos balsus)
      let pastCandidates: any[] = []
      try {
        const [pnRes, pvRes] = await Promise.all([
          sb.from('daily_song_nominations')
            .select('id, tracks!track_id(title, video_url, cover_url, artists!artist_id(name, cover_image_url))')
            .eq('date', w.date).is('removed_at', null).limit(20),
          sb.from('daily_song_votes').select('nomination_id, weight').eq('date', w.date),
        ])
        const pvt: Record<number, number> = {}
        for (const v of (pvRes.data || []) as any[]) pvt[v.nomination_id] = (pvt[v.nomination_id] || 0) + v.weight
        const winTitle = track?.title || null
        pastCandidates = [...((pnRes.data || []) as any[])]
          .sort((a, b) => (pvt[b.id] || 0) - (pvt[a.id] || 0))
          .filter(n => (n.tracks?.title || '') !== winTitle)
          .slice(0, 5)
          .map((n, i) => ({
            rank: i + 2,
            title: n.tracks?.title || '?',
            artist: first<any>(n.tracks?.artists)?.name || null,
            cover: ytThumb(n.tracks?.video_url) || n.tracks?.cover_url || first<any>(n.tracks?.artists)?.cover_image_url || null,
            votes: pvt[n.id] || 0,
          }))
      } catch {}
      ddItem = {
        id: `dd_past_${w.id}`,
        type: 'dd', subtype: 'yesterday_winner',
        title: track?.title || 'Dienos daina', href: '/dienos-daina',
        cover: ytThumb(track?.video_url) || track?.cover_url || artist?.cover_image_url || null,
        author_name: artist?.name || null, author_slug: artist?.slug || null, author_avatar: null,
        created_at: w.date, vote_count: null, vote_total: null, candidates: pastCandidates,
      }
    }

    // ── Blog — thumbnail resolve ──────────────────────────────────────────────
    const blogRows = (blogRes.data || []) as any[]
    const needThumb = blogRows.filter(b => !b.cover_image_url).map(b => b.id)
    const thumbByPost = new Map<number, string>()

    if (needThumb.length) {
      const tgtTracks = new Set<number>(), tgtAlbums = new Set<number>(), tgtArtists = new Set<number>()
      const topasTracks = new Set<number>(), topasArtists = new Set<number>()
      for (const b of blogRows) {
        if (b.cover_image_url) continue
        if (b.target_track_id) tgtTracks.add(b.target_track_id)
        if (b.target_album_id) tgtAlbums.add(b.target_album_id)
        if (b.target_artist_id) tgtArtists.add(b.target_artist_id)
        if (b.post_type === 'topas' && Array.isArray(b.list_items)) {
          for (const e of b.list_items.slice(0, 3)) {
            if (e.image_url) break
            if (e.entity_id) {
              if (e.type === 'artist') topasArtists.add(e.entity_id)
              else if (e.type === 'track') topasTracks.add(e.entity_id)
            }
          }
        }
      }
      try {
        const [tj, aj, arj, tgtT, tgtA, tgtAr, tpT, tpAr] = await Promise.all([
          sb.from('blog_post_tracks').select('post_id, tracks:track_id(video_url, cover_url, artist:artist_id(cover_image_url))').in('post_id', needThumb),
          sb.from('blog_post_albums').select('post_id, albums:album_id(cover_image_url)').in('post_id', needThumb),
          sb.from('blog_post_artists').select('post_id, artists:artist_id(cover_image_url)').in('post_id', needThumb),
          tgtTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...tgtTracks]) : Promise.resolve({ data: [] }),
          tgtAlbums.size ? sb.from('albums').select('id, cover_image_url').in('id', [...tgtAlbums]) : Promise.resolve({ data: [] }),
          tgtArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...tgtArtists]) : Promise.resolve({ data: [] }),
          topasTracks.size ? sb.from('tracks').select('id, cover_url, video_url, artist:artist_id(cover_image_url)').in('id', [...topasTracks]) : Promise.resolve({ data: [] }),
          topasArtists.size ? sb.from('artists').select('id, cover_image_url').in('id', [...topasArtists]) : Promise.resolve({ data: [] }),
        ])
        const trackImgOf = (t: any) => ytThumb(t.video_url) || t.cover_url || first<any>(t.artist)?.cover_image_url || null
        for (const row of (tj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const t = first<any>(row.tracks); if (!t) continue
          const img = trackImgOf(t); if (img) thumbByPost.set(row.post_id, img)
        }
        for (const row of (aj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const a = first<any>(row.albums); if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
        }
        for (const row of (arj.data || []) as any[]) {
          if (thumbByPost.has(row.post_id)) continue
          const a = first<any>(row.artists); if (a?.cover_image_url) thumbByPost.set(row.post_id, a.cover_image_url)
        }
        const tgtTrackImg = new Map<number, string | null>()
        for (const t of (tgtT.data || []) as any[]) tgtTrackImg.set(t.id, trackImgOf(t))
        const tgtAlbumImg = new Map<number, string>((tgtA.data || []).map((a: any) => [a.id, a.cover_image_url]))
        const tgtArtistImg = new Map<number, string>((tgtAr.data || []).map((a: any) => [a.id, a.cover_image_url]))
        const topTrackImg = new Map<number, string | null>()
        for (const t of (tpT.data || []) as any[]) topTrackImg.set(t.id, trackImgOf(t))
        const topArtistImg = new Map<number, string>((tpAr.data || []).map((a: any) => [a.id, a.cover_image_url]))

        for (const b of blogRows) {
          if (thumbByPost.has(b.id) || b.cover_image_url) continue
          const img =
            (b.target_track_id && tgtTrackImg.get(b.target_track_id)) ||
            (b.target_album_id && tgtAlbumImg.get(b.target_album_id)) ||
            (b.target_artist_id && tgtArtistImg.get(b.target_artist_id)) || null
          if (img) { thumbByPost.set(b.id, img); continue }
          if (b.post_type === 'topas' && Array.isArray(b.list_items)) {
            for (const e of b.list_items.slice(0, 3)) {
              if (e.image_url) { thumbByPost.set(b.id, e.image_url); break }
              const eImg = (e.entity_id && e.type === 'artist' && topArtistImg.get(e.entity_id)) ||
                           (e.entity_id && e.type === 'track' && topTrackImg.get(e.entity_id)) || null
              if (eImg) { thumbByPost.set(b.id, eImg); break }
            }
          }
        }
      } catch {}
    }

    // ── Blog items — 1-per-type (paslėpti nariai jau išmesti per užklausą) ───
    const typeSeen = new Set<string>()
    const blogItems: any[] = []
    for (const b of blogRows) {
      if (!b.title) continue
      // blogs:blog_id(profiles:user_id(...)) → vienas objektas (ne masyvas)
      const profRaw = b.blogs?.profiles
      const author = Array.isArray(profRaw) ? (profRaw[0] ?? null) : (profRaw ?? null)

      // HOMEPAGE = tik su muzika susiję tipai (kaip /atrasti prominentūs).
      // Praleidžiam „Bendruomenės įrašą" (article be muzikinio editorial_type) ir renginius —
      // jie lieka tik /atrasti, nepromotinami homepage.
      if (b.post_type === 'event') continue
      if (b.post_type === 'article' && !['recenzija', 'koncertai'].includes(b.editorial_type || '')) continue

      // 1-per-type taisyklė (plokščias tipas, suderintas su /admin/irasai).
      // review IR article/recenzija → VIENAS „Muzikos apžvalga" bucket (rodom naujausią iš abiejų).
      const tkey =
        b.post_type === 'review' ? 'muzikos_apzvalga'
        : b.post_type === 'article'
          ? (b.editorial_type === 'recenzija' ? 'muzikos_apzvalga' : 'koncertai')
          : b.post_type
      if (typeSeen.has(tkey)) continue
      typeSeen.add(tkey)

      const cover = b.cover_image_url || thumbByPost.get(b.id) || null
      const blogSlug = b.blogs?.slug || (author as any)?.username || null

      // Topas entries (top 3)
      let entries: any[] | null = null
      if (b.post_type === 'topas' && Array.isArray(b.list_items) && b.list_items.length) {
        entries = (b.list_items as any[])
          .sort((a, z) => (a.rank ?? a.position ?? 99) - (z.rank ?? z.position ?? 99))
          .slice(0, 5)
          .map((e, i) => ({
            rank: e.rank ?? e.position ?? i + 1,
            title: e.title || e.track_title || e.artist_name || '',
            artist: e.artist || e.artist_name || null,
            image: e.image_url || null,
          }))
      }

      // Aukštesnės kortelės — daugiau teksto. Koncertai/apžvalgos/kūryba gauna ilgesnį excerpt.
      const wantLong = b.editorial_type === 'koncertai' || b.editorial_type === 'recenzija'
        || b.post_type === 'review' || b.post_type === 'creation' || b.post_type === 'translation'
      const isCreative = b.post_type === 'creation' || b.post_type === 'translation'
      const maxLen = wantLong ? 360 : 240
      const excerpt = b.summary
        ? (b.summary.length > maxLen ? b.summary.slice(0, maxLen).trimEnd() + '…' : b.summary)
        : null
      // Kūryba/vertimas — tikros eilėraščio eilutės iš pilno content (su realiais
      // eilučių lūžiais), kad kortelė skaitytųsi kaip eilėraštis, ne sugrūsta proza.
      const poem_lines = isCreative ? poemLinesFromContent(b.content, 8) : null

      blogItems.push({
        id: `blog-${b.id}`, type: 'blog', subtype: b.post_type || null,
        editorial_type: b.editorial_type || null,
        title: b.title, href: blogSlug ? `/blogas/${blogSlug}/${b.slug || b.id}` : '/blogas',
        cover, excerpt, entries, poem_lines,
        // username pirmiau už full_name — bendruomenėje rodomi username'ai.
        author_name: author?.username || author?.full_name || null,
        author_slug: author?.username || null,
        author_avatar: author?.avatar_url || null,
        created_at: b.published_at,
        engagement: (b.like_count || 0) + (b.comment_count || 0),
      })
    }
    // Fiksuota tvarka: koncertai → topas → muzikos_apzvalga → creation → translation
    const BLOG_PRIORITY: Record<string, number> = {
      topas: 1, review: 2, creation: 4, translation: 5,
    }
    const blogPriority = (it: any) => {
      if (it.editorial_type === 'koncertai') return 0
      if (it.editorial_type === 'recenzija' || it.subtype === 'review') return 2
      return BLOG_PRIORITY[it.subtype || ''] ?? 3
    }
    blogItems.sort((a, b) => blogPriority(a) - blogPriority(b))

    // ── Diskusijos — 1 vnt, 2 naujausi komentarai ────────────────────────────
    const discRows = (discRes.data || []) as any[]
    const discIds = discRows.slice(0, 1).map(d => d.id) as number[]
    const commentsByDisc = new Map<number, { text: string; author: string | null; avatar: string | null; time: string }[]>()
    if (discIds.length) {
      try {
        const { data: cmts } = await sb
          .from('comments')
          .select('discussion_id, body, created_at, profiles:author_id(username, avatar_url)')
          .in('discussion_id', discIds)
          .eq('is_deleted', false)
          .not('body', 'is', null)
          .order('created_at', { ascending: false })
          .limit(30)
        for (const c of (cmts || []) as any[]) {
          const list = commentsByDisc.get(c.discussion_id) || []
          if (list.length >= 2) continue
          const text = (c.body || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          if (!text) continue
          const prof = first<any>(c.profiles)
          list.push({
            text: text.length > 140 ? text.slice(0, 140).trimEnd() + '…' : text,
            author: prof?.username || null,
            avatar: prof?.avatar_url || null,
            time: c.created_at,
          })
          commentsByDisc.set(c.discussion_id, list)
        }
      } catch {}
    }

    const discItems: any[] = []
    for (const d of discRows.slice(0, 1)) {
      const artist = first<any>(d.artist)
      const comments = commentsByDisc.get(d.id) || []
      discItems.push({
        id: `disc-${d.id}`, type: 'discussion',
        title: d.title || '', href: `/diskusijos/${d.slug || d.id}`,
        cover: artist?.cover_image_url || null,
        author_name: d.author_name || null, author_avatar: d.author_avatar || null,
        created_at: d.last_comment_at || d.created_at,
        comment_count: d.comment_count || 0,
        last_comment: comments[0] || null,
        last_comments: comments,
      })
    }

    // ── Atradimas (1 vnt) ────────────────────────────────────────────────────
    const dv = first<any>(discoveryRes.data) as any
    let atrItem: any = null
    if (dv) {
      const yt = dv.embed_type === 'youtube' && dv.embed_id ? `https://i.ytimg.com/vi/${dv.embed_id}/mqdefault.jpg` : null
      const cover = yt || first<any>(dv.tracks)?.cover_url || first<any>(dv.artists)?.cover_image_url || null
      let prof: any = null
      if (dv.author_id) {
        try {
          const { data: p } = await sb.from('profiles').select('username, avatar_url').eq('id', dv.author_id).maybeSingle()
          prof = p
        } catch {}
      }
      const title = dv.track_name ? `${dv.artist_name ? dv.artist_name + ' — ' : ''}${dv.track_name}` : (dv.artist_name || 'Atradimas')
      // Atradimo body tekstas iš komentaro (comment_id FK → comments.body)
      let atrExcerpt: string | null = null
      if (dv.comment_id) {
        try {
          const { data: cmt } = await sb.from('comments').select('body').eq('id', dv.comment_id).maybeSingle()
          if (cmt?.body) {
            const clean = (cmt.body as string).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
            atrExcerpt = clean.length > 300 ? clean.slice(0, 300).trimEnd() + '…' : clean
          }
        } catch {}
      }
      atrItem = {
        id: `atr-${dv.id}`, type: 'atradimas',
        title, href: `/muzikos-atradimai/${dv.id}`,
        cover, excerpt: atrExcerpt,
        author_name: prof?.username || null,
        author_avatar: prof?.avatar_url || null,
        created_at: dv.created_at,
      }
    }

    // ── Merge: fiksuota tvarka DD → Koncertų įsp. → Topas → Muz.apžvalga →
    //    Diskusija → Atradimas → Kūryba → Vertimas ─────────────────────────────
    // Blog items jau surūšiuoti pagal BLOG_PRIORITY (koncertai→topas→apžvalga→…).
    // Tarp blog'ų intarpuojame diskusiją (po apžvalgos=priority 2) ir atradimą
    // (po diskusijos).
    const merged: any[] = []
    let discInserted = false, atrInserted = false
    for (const b of blogItems) {
      const p = blogPriority(b)
      // Diskusija eina po blog priority 2 (muzikos apžvalga)
      if (!discInserted && p > 2 && discItems[0]) {
        merged.push(discItems[0]); discInserted = true
      }
      // Atradimas eina po diskusijos
      if (!atrInserted && p > 2 && discInserted && atrItem) {
        merged.push(atrItem); atrInserted = true
      }
      merged.push(b)
    }
    // Jei diskusija/atradimas dar neįterpti (nėra creation/translation blog'ų)
    if (!discInserted && discItems[0]) merged.push(discItems[0])
    if (!atrInserted && atrItem) merged.push(atrItem)

    const items = ddItem ? [ddItem, ...merged.slice(0, 9)] : merged.slice(0, 10)
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=360' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
