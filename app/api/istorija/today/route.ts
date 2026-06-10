// app/api/istorija/today/route.ts
//
// GET /api/istorija/today — kas ŠIANDIEN (tiksli MM-DD) aktualu istorijos kontekste:
//   - Atlikėjų gimtadieniai (artists.birth_month/birth_day == šiandien)
//   - Atlikėjų mirties metinės (artists.death_month/death_day == šiandien)
//   - Albumų sukaktys (albums.month/day == šiandien)
//
// 2026-05-29: birth_month/birth_day/death_month/death_day yra GENERATED STORED
// stulpeliai (+ indeksai) — eq filtras greitas, be full-scan'o. Viskas SUSIETA
// TIK su einamąja diena (ne platesniu periodu).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { unstable_cache } from 'next/cache'

export const revalidate = 3600 // 1 val.

type IstItem = {
  id: string
  type: 'birthday' | 'death_anniversary' | 'album_anniversary'
  title: string
  subtitle: string
  href: string
  emoji: string
  cover: string | null
  year: number | null
  age?: number | null
  groups?: { name: string; cover: string | null }[]   // gimtadieniams — grupės, kurioms atlikėjas priklauso/priklausė (+ mini nuotrauka)
  deceased?: boolean  // miręs atlikėjas — UI rodo grayscale nuotrauką
  artist?: string | null   // album_anniversary — atlikėjo vardas (atskirai nuo title)
  albumId?: number | null  // album_anniversary — AlbumInfoModal'ui
  pop?: number             // album_anniversary — populiarumo lygis 0-5 (YT peržiūros)
  likeCount?: number       // album_anniversary — patiktukai
}

async function fetchToday(): Promise<IstItem[]> {
  const sb = createAdminClient()
  // Lietuvos laiku (Europe/Vilnius) — kitaip ties UTC/LT vidurnakčiu „šiandiena"
  // pasikeičia ne pagal Lietuvos dieną.
  const ltParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date())
  const M = Number(ltParts.find(p => p.type === 'month')?.value || 1)
  const D = Number(ltParts.find(p => p.type === 'day')?.value || 1)
  const currentYear = Number(ltParts.find(p => p.type === 'year')?.value || new Date().getFullYear())
  const items: any[] = []

  // ── Albumų sukaktys ŠIANDIEN (tikslus month+day) ──
  try {
    const { data: albums } = await sb
      .from('albums')
      .select('id, slug, title, cover_image_url, year, type_studio, type_compilation, type_live, type_ep, artists!albums_artist_id_fkey(id, slug, name, score, cover_image_url)')
      .eq('month', M)
      .eq('day', D)
      .not('year', 'is', null)
      .lt('year', currentYear)
      .order('year', { ascending: true })
      .limit(80)
    for (const a of (albums || []) as any[]) {
      const yrsAgo = currentYear - a.year
      if (yrsAgo < 1) continue
      // TIK studijiniai albumai — atmetam rinkinius/koncertinius/EP. Albumai be
      // type flag'ų (dar nepriskirti) paliekami (type_studio !== false).
      // Edvardo prašymu 2026-06-02.
      if (a.type_compilation || a.type_live || a.type_ep || a.type_studio === false) continue
      const artistName = a.artists?.name || ''
      const artistSlug = a.artists?.slug || ''
      items.push({
        id: `alb-${a.id}`,
        type: 'album_anniversary',
        // Title = albumo pavadinimas; atlikėjas atskiroje eilutėje (kaip „Nauji
        // albumai" sekcijoje). „Prieš X m." nebenaudojam — amžius ant badge'o.
        title: a.title,
        artist: artistName || null,
        subtitle: '',
        href: artistSlug ? `/albumai/${artistSlug}-${(a.slug || a.id)}-${a.id}` : `/albumai/${a.slug || a.id}-${a.id}`,
        emoji: '💿',
        cover: a.cover_image_url || a.artists?.cover_image_url || null,
        year: a.year,
        age: yrsAgo,
        albumId: a.id,
        score: a.artists?.score || 0,
      })
    }
  } catch {}

  // ── Gimtadieniai ŠIANDIEN ──
  try {
    const { data: arts } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url, birth_date, death_date, score')
      .eq('birth_month', M)
      .eq('birth_day', D)
      .limit(40)
    for (const a of (arts || []) as any[]) {
      const by = a.birth_date ? new Date(a.birth_date).getFullYear() : null
      const age = by ? currentYear - by : null
      const isDeceased = !!a.death_date
      items.push({
        id: `bday-${a.id}`,
        type: 'birthday',
        title: a.name,
        // subtitle užpildoma žemiau grupėmis (kurioms priklausė); amžius (sukako)
        // dabar rodomas ant badge'o, ne tekste. Edvardo prašymu 2026-06-01.
        subtitle: '',
        href: `/atlikejai/${a.slug}`,
        emoji: isDeceased ? '🕯️' : '🎂',
        cover: a.cover_image_url || null,
        year: by,
        age,
        groups: [],
        deceased: isDeceased,
        _artistId: a.id,
        score: a.score || 0,
      })
    }
  } catch {}

  // ── Grupės, kurioms gimtadienio atlikėjas priklauso/priklausė ──
  // artist_members.member_id = asmuo, group_id = grupė (FK į artists). Vienas
  // batch query visiems gimtadienio žmonėms. is_current=true grupės pirmos.
  try {
    const bdayIds = items.filter((i: any) => i.type === 'birthday').map((i: any) => i._artistId).filter(Boolean)
    if (bdayIds.length) {
      const { data: mem } = await sb
        .from('artist_members')
        .select('member_id, is_current, grp:artists!group_id ( name, cover_image_url, score )')
        .in('member_id', bdayIds)
        .order('is_current', { ascending: false })
      const byMember: Record<number, { name: string; cover: string | null }[]> = {}
      const grpScoreByMember: Record<number, number> = {}
      for (const m of (mem || []) as any[]) {
        const g = Array.isArray(m.grp) ? m.grp[0] : m.grp
        const name = g?.name
        if (name) {
          if (!byMember[m.member_id]) byMember[m.member_id] = []
          if (!byMember[m.member_id].some(x => x.name === name)) {
            byMember[m.member_id].push({ name, cover: g?.cover_image_url || null })
          }
          const gs = Number(g?.score || 0)
          if (gs > (grpScoreByMember[m.member_id] || 0)) grpScoreByMember[m.member_id] = gs
        }
      }
      for (const it of items as any[]) {
        if (it.type !== 'birthday') continue
        const gs = byMember[it._artistId] || []
        it.groups = gs
        it.subtitle = gs.length ? gs.slice(0, 2).map(x => x.name).join(', ') + (gs.length > 2 ? ` +${gs.length - 2}` : '') : ''
        // Rikiavimo balas = SAVO score + populiariausios grupės score (NE max).
        // „Ne tik pagal grupių populiarumą" — atlikėjo asmeninė reikšmė irgi
        // įtakoja: pvz. Matt Bellamy (Muse 34 + savo 10 = 44) > Pete Gill
        // (Motörhead 35 + savo 0 = 35), nes jis pats — grupės frontman'as, o ne
        // tik būgnininkas populiarioje grupėje. Edvardo prašymu 2026-06-09.
        it.score = Number(it.score || 0) + (grpScoreByMember[it._artistId] || 0)
      }
    }
  } catch {}

  // ── Mirties metinės ŠIANDIEN ──
  try {
    const { data: arts } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url, death_date, score')
      .eq('death_month', M)
      .eq('death_day', D)
      .limit(40)
    for (const a of (arts || []) as any[]) {
      const dy = a.death_date ? new Date(a.death_date).getFullYear() : null
      const age = dy ? currentYear - dy : null
      items.push({
        id: `death-${a.id}`,
        type: 'death_anniversary',
        title: a.name,
        subtitle: age ? `${age} mirties metinės` : 'Mirties metinės',
        href: `/atlikejai/${a.slug}`,
        emoji: '🕯️',
        cover: a.cover_image_url || null,
        year: dy,
        age,
        deceased: true,
        score: a.score || 0,
      })
    }
  } catch {}

  // ── Albumų populiarumas (YT peržiūros → tier 0-5) + patiktukai ──
  // Toks pat skaičiavimas kaip /api/home/list, kad „Nauji albumai" ir istorijos
  // albumų modalas atrodytų vienodai (popbar + ♥). Bounded (≤40 albumų).
  try {
    const albIds = (items as any[]).filter(i => i.type === 'album_anniversary').map(i => i.albumId).filter(Boolean)
    if (albIds.length) {
      // Patiktukai per RPC.
      try {
        const { data: lc } = await sb.rpc('like_counts_by_entity', { p_entity_type: 'album', p_entity_ids: albIds })
        const m = new Map<number, number>()
        for (const r of (lc || []) as any[]) m.set(Number(r.entity_id), Number(r.like_count))
        for (const it of items as any[]) if (it.type === 'album_anniversary') it.likeCount = m.get(it.albumId) || 0
      } catch {}
      // Pop tier per didžiausias albumo dainos peržiūras.
      try {
        const { data: atRows } = await sb.from('album_tracks').select('album_id, tracks(video_views)').in('album_id', albIds)
        const viewByAlbum = new Map<number, number>()
        for (const r of (atRows || []) as any[]) {
          const v = Number(r.tracks?.video_views || 0)
          if (v > (viewByAlbum.get(r.album_id) || 0)) viewByAlbum.set(r.album_id, v)
        }
        const popTier = (v: number) => (v >= 5e6 ? 5 : v >= 1e6 ? 4 : v >= 2e5 ? 3 : v >= 3e4 ? 2 : v > 0 ? 1 : 0)
        for (const it of items as any[]) if (it.type === 'album_anniversary') {
          const v = viewByAlbum.get(it.albumId) || 0
          it._views = v
          it.pop = popTier(v)
        }
      } catch {}
    }
  } catch {}

  // Rikiavimas. Komponentas grupuoja pagal tipą, tad svarbi TIK eilė tipo viduje.
  const score = (x: any) => x.score || 0
  // SVARBU: rikiuoti ir riboti KIEKVIENĄ tipą ATSKIRAI. Anksčiau viskas buvo
  // sumaišoma į vieną sąrašą ir slice(0,40) — albumų rangas (YT peržiūros
  // milijonais) visada nustelbdavo gimtadienius/mirties metines (rangas = score,
  // maži skaičiai), tad visi 40 slot'ų atitekdavo albumams ir gimtadieniai/
  // mirties metinės dingdavo (komponentas tuščias sekcijas slepia). 2026-06-09.
  const byType: Record<string, any[]> = { album_anniversary: [], birthday: [], death_anniversary: [] }
  for (const it of items as any[]) (byType[it.type] ||= []).push(it)

  // Albumai: PIRMIAUSIA pagal music.lt narių patiktukus (likeCount), tiebreak
  // pagal YT peržiūras. Anksčiau likes ir views buvo maišomi (likes*1000+views),
  // tad daug peržiūrų turintis bet 0 patiktukų albumas nustelbdavo mėgstamus —
  // eilė atrodė atsitiktinė. Edvardo prašymu 2026-06-09: likes dominuoja.
  byType.album_anniversary.sort((a: any, b: any) =>
    ((b.likeCount || 0) - (a.likeCount || 0)) ||
    ((b._views || 0) - (a._views || 0)) ||
    ((b.age || 0) - (a.age || 0)))

  // Gimtadieniai: GYVI pirmiau, MIRĘ (gimimo metinės) — į galą. Tipo viduje
  // pagal populiarumą (savo + grupės score) desc. Edvardo prašymu 2026-06-09.
  byType.birthday.sort((a: any, b: any) => {
    const da = a.deceased ? 1 : 0, db = b.deceased ? 1 : 0
    if (da !== db) return da - db
    return (score(b) - score(a)) || ((b.age || 0) - (a.age || 0))
  })

  // Mirties metinės: pagal atlikėjo populiarumą desc.
  byType.death_anniversary.sort((a: any, b: any) => (score(b) - score(a)) || ((b.age || 0) - (a.age || 0)))

  const out: any[] = []
  for (const t of ['album_anniversary', 'birthday', 'death_anniversary']) {
    out.push(...(byType[t] || []).slice(0, 40))
  }
  return out as IstItem[]
}

export async function GET() {
  try {
    // Cache key turi įtraukti LT datą — kitaip `unstable_cache` (statinis raktas)
    // serB'ina vakarykštę dieną iki revalidate'o (iki 1 val. po vidurnakčio
    // rodydavo ne tos dienos sukaktis). 2026-06-01.
    const ltDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const cached = unstable_cache(fetchToday, ['istorija-today', ltDate], { revalidate: 3600 })
    const items = await cached()
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message }, { status: 200 })
  }
}
