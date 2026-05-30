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
      .select('id, slug, title, cover_image_url, year, artists!albums_artist_id_fkey(id, slug, name, score)')
      .eq('month', M)
      .eq('day', D)
      .not('year', 'is', null)
      .lt('year', currentYear)
      .order('year', { ascending: true })
      .limit(40)
    for (const a of (albums || []) as any[]) {
      const yrsAgo = currentYear - a.year
      if (yrsAgo < 1) continue
      const artistName = a.artists?.name || ''
      const artistSlug = a.artists?.slug || ''
      items.push({
        id: `alb-${a.id}`,
        type: 'album_anniversary',
        title: `${artistName ? artistName + ' – ' : ''}${a.title}`,
        subtitle: `Prieš ${yrsAgo} m.`,
        href: artistSlug ? `/albumai/${artistSlug}-${(a.slug || a.id)}-${a.id}` : `/albumai/${a.slug || a.id}-${a.id}`,
        emoji: '💿',
        cover: a.cover_image_url || null,
        year: a.year,
        age: yrsAgo,
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
      // Jei atlikėjas miręs — NE „Sukako X m." (jis nebešvenčia), o „X-osios
      // gimimo metinės". Edvardo prašymu 2026-05-31.
      const isDeceased = !!a.death_date
      const subtitle = isDeceased
        ? (age ? `${age}-osios gimimo metinės` : 'Gimimo metinės')
        : (age ? `Sukako ${age} m.` : 'Gimtadienis')
      items.push({
        id: `bday-${a.id}`,
        type: 'birthday',
        title: a.name,
        subtitle,
        href: `/atlikejai/${a.slug}`,
        emoji: isDeceased ? '🕯️' : '🎂',
        cover: a.cover_image_url || null,
        year: by,
        age,
        score: a.score || 0,
      })
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
        score: a.score || 0,
      })
    }
  } catch {}

  // Rikiavimas pagal atlikėjo populiarumą (score) desc — populiariausi pirmi;
  // tiebreak pagal metų skaičių. Komponentas grupuoja pagal tipą (eilė išliks).
  items.sort((a: any, b: any) => (b.score || 0) - (a.score || 0) || (b.age || 0) - (a.age || 0))
  return (items as IstItem[]).slice(0, 40)
}

const cachedFetchToday = unstable_cache(fetchToday, ['istorija-today'], { revalidate: 3600 })

export async function GET() {
  try {
    const items = await cachedFetchToday()
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message }, { status: 200 })
  }
}
