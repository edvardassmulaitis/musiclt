// lib/itunes.ts
//
// iTunes Search API — 30 s garso ištraukos kvizams.
//
// Kodėl: iOS Safari NEgroja YouTube iframe garso (jokiu būdu — nei autoplay,
// nei IFrame API iš tėvinio gesto). HTML5 <audio> su tiesiogine MP3/AAC
// ištrauka veikia visur po vieno atrakinimo gesto. iTunes previews — vieši,
// be rakto, LT muzikos aprėptis gera (country=lt).
//
// Cache: tracks.itunes_preview_url (+ itunes_checked_at, kad nekartotume
// nesėkmingų paieškų dažniau nei kas 7 d.).

import { createAdminClient } from '@/lib/supabase'

const RECHECK_DAYS = 7

async function searchItunes(artist: string, title: string): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${title}`.slice(0, 120))
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=3&country=lt`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3500)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const json = await res.json()
    const artistLc = artist.toLowerCase()
    for (const r of json.results || []) {
      if (!r.previewUrl) continue
      // Bent minimalus atlikėjo sutapimas — kad neįdėtume svetimos dainos
      const foundArtist = String(r.artistName || '').toLowerCase()
      if (foundArtist.includes(artistLc.slice(0, 12)) || artistLc.includes(foundArtist.slice(0, 12))) {
        return r.previewUrl as string
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Užtikrina garso ištraukas duotiems track'ams (batch, su DB cache).
 * Grąžina Map<trackId, previewUrl|null>. Naujus lookup'us daro lygiagrečiai
 * (iki 6 vienu metu) ir įrašo į cache.
 */
export async function ensurePreviews(
  tracks: Array<{ id: number; title: string; artist: string }>,
): Promise<Map<number, string | null>> {
  const sb = createAdminClient()
  const out = new Map<number, string | null>()
  if (!tracks.length) return out

  const ids = tracks.map(t => t.id)
  const { data: rows } = await sb
    .from('tracks')
    .select('id, itunes_preview_url, itunes_checked_at')
    .in('id', ids)
  const byId = new Map((rows || []).map((r: any) => [r.id, r]))

  const recheckBefore = Date.now() - RECHECK_DAYS * 864e5
  const toLookup: Array<{ id: number; title: string; artist: string }> = []
  for (const t of tracks) {
    const row: any = byId.get(t.id)
    if (row?.itunes_preview_url) {
      out.set(t.id, row.itunes_preview_url)
    } else if (row?.itunes_checked_at && Date.parse(row.itunes_checked_at) > recheckBefore) {
      out.set(t.id, null) // neseniai ieškota, nerasta
    } else {
      toLookup.push(t)
    }
  }

  // Lygiagrečiai po 6
  for (let i = 0; i < toLookup.length; i += 6) {
    const chunk = toLookup.slice(i, i + 6)
    const found = await Promise.all(chunk.map(t => searchItunes(t.artist, t.title)))
    await Promise.all(chunk.map((t, j) => {
      out.set(t.id, found[j])
      return sb.from('tracks').update({
        itunes_preview_url: found[j],
        itunes_checked_at: new Date().toISOString(),
      }).eq('id', t.id)
    }))
  }

  return out
}
