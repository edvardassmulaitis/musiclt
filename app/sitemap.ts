// app/sitemap.ts
//
// Pilnas svetainės sitemap'as — KRITINIS SEO komponentas. Iki šiol jo nebuvo,
// todėl Google neturėjo sistemingo būdo atrasti ~12k atlikėjų puslapių.
// Čia išvardinam:
//   • statinius pagrindinius puslapius
//   • atlikėjų facet puslapius (šalis / žanras) — naršymo landing'us
//   • KIEKVIENĄ atlikėją (/atlikejai/{slug})
//
// Vienas sitemap failas talpina iki 50k URL — 12k atlikėjų telpa laisvai.
// revalidate=86400 → perskaičiuojama kartą per parą.

import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { SITE_URL, ltSlugify, LT_COUNTRY } from '@/lib/artist-browse'
import { NEWS_STYLES, NEWS_TYPES } from '@/lib/news-taxonomy'
import { getNewsFacets } from '@/lib/news-feed'
import { SONG_COLLECTION_MIN_INDEX, albumCollectionHref, songCollectionHref } from '@/lib/collections'
import { getSongCollections, getAlbumCollections } from '@/lib/collections-db'
import { getSongCollectionCounts } from '@/lib/muzika-hub'

export const revalidate = 86400

// Visi DB fetch'ai apgaubti try/catch — sitemap'as generuojamas build metu,
// tad jei build aplinkoje DB nepasiekiama (network/secret trūkumas), NEgriaunam
// build'o: grąžinam tuščią, o pilnas sąrašas užsipildo per revalidate runtime.
async function allArtists(): Promise<{ slug: string; updated_at: string | null; created_at: string | null }[]> {
  const out: { slug: string; updated_at: string | null; created_at: string | null }[] = []
  try {
    const sb = createAdminClient()
    const PAGE = 1000
    let offset = 0
    // Paginate — PostgREST 1000-row cap (žr. memory: postgrest_max_rows).
    while (true) {
      const { data } = await sb
        .from('artists')
        .select('slug, updated_at, created_at')
        .not('slug', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      const arr = (data || []) as any[]
      for (const a of arr) if (a.slug) out.push(a)
      if (arr.length < PAGE) break
      offset += PAGE
      if (offset > 100000) break
    }
  } catch {
    /* build-time DB nepasiekiama — degrade gracefully */
  }
  return out
}

async function genreSlugs(): Promise<string[]> {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_genre_counts')
    return ((data || []) as any[]).map((g) => ltSlugify(g.name))
  } catch {
    return []
  }
}

async function topCountries(): Promise<string[]> {
  try {
    const sb = createAdminClient()
    const { data } = await sb.rpc('artist_country_counts')
    return ((data || []) as any[])
      .filter((c) => c.country !== LT_COUNTRY)
      .slice(0, 20)
      .map((c) => ltSlugify(c.country))
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const [artists, genres, countries, newsFacets, songCounts, songColls, albumColls] = await Promise.all([
    allArtists(),
    genreSlugs(),
    topCountries(),
    getNewsFacets().catch(() => null),
    getSongCollectionCounts().catch(() => ({} as Record<string, number>)),
    getSongCollections().catch(() => []),
    getAlbumCollections().catch(() => []),
  ])

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/atlikejai`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/albumai`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/dainos`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/topai`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/topai/lietuva`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/topai/pasaulis`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/topai/jav`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/topai/uk`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/topai/dainos`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/topai/albumai`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/topai/bendruomene`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/koncertai`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/muzikos-stilius`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/naujienos`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/naujienos/lietuva`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/naujienos/pasaulis`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
  ]

  // Naujienų landing'ai — stilius visada (turi turinį), kategorija tik kai
  // jau klasifikuota (facet count > 0), kad neindeksuotume tuščių puslapių.
  const newsPages: MetadataRoute.Sitemap = [
    ...NEWS_STYLES.map((s) => ({
      url: `${SITE_URL}/naujienos/stilius/${s.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    ...NEWS_TYPES
      .filter((t) => (newsFacets?.categories?.[t.key] || 0) > 0)
      .map((t) => ({
        url: `${SITE_URL}/naujienos/tipas/${t.slug}`,
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      })),
  ]

  // Dedikuoti stiliaus landing'ai (/muzikos-stilius/{slug}) — unikalus SEO turinys
  // kiekvienam žanrui (top atlikėjai/albumai/dainos).
  const genrePages: MetadataRoute.Sitemap = genres.map((g) => ({
    url: `${SITE_URL}/muzikos-stilius/${g}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6,
  }))

  // Atlikėjų facet landing'ai (šalis / žanras) — vertingi SEO puslapiai.
  const facetPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/atlikejai?country=lt`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/atlikejai?country=world`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    ...countries.map((c) => ({
      url: `${SITE_URL}/atlikejai?country=${c}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.5,
    })),
    ...genres.map((g) => ({
      url: `${SITE_URL}/atlikejai?genre=${g}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6,
    })),
  ]

  const artistPages: MetadataRoute.Sitemap = artists.map((a) => ({
    url: `${SITE_URL}/atlikejai/${a.slug}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : a.created_at ? new Date(a.created_at) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // /muzika hub — 7 path-segment variantai (Šalis × Rikiavimas).
  const hubPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/muzika`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/muzika/lietuviska`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/muzika/lietuviska/dabar`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/muzika/lietuviska/populiariausia`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/muzika/uzsienio`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/muzika/uzsienio/dabar`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/muzika/uzsienio/populiariausia`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ]

  // Teminės kolekcijos: geriausi albumai — visada (užklausomas turinys);
  // dainų kolekcijos — tik kuruotos (>= MIN), kad neindeksuotume plonų puslapių.
  const collectionPages: MetadataRoute.Sitemap = [
    ...albumColls.map((c) => ({
      url: `${SITE_URL}${albumCollectionHref(c.slug)}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6,
    })),
    ...songColls
      .filter((c) => (songCounts[c.slug] || 0) >= SONG_COLLECTION_MIN_INDEX)
      .map((c) => ({
        url: `${SITE_URL}${songCollectionHref(c.slug)}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6,
      })),
  ]

  return [...staticPages, ...hubPages, ...newsPages, ...genrePages, ...collectionPages, ...facetPages, ...artistPages]
}
