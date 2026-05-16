import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { matchGenreToSubstyle, type SubstyleRow } from '@/lib/genre-match'
import { slugify } from '@/lib/slugify'
import { computeAlbumCompleteness } from '@/lib/album-completeness'
import { syncTrackFeaturing } from '@/lib/featuring-utils'

// PATCH /api/albums/[id]/enrich — Wiki "overlay" enrich endpoint.
//
// Skirtumas nuo PUT /api/albums/[id]:
//   PUT — pilnas album form save (admin UI). Reikalauja title, artist_id,
//         visi type_* flags. Wiki Discography Import naudojo PUT su partial
//         payload → 500, nes slugify(undefined) ir Number(undefined)=NaN
//         laužydavo update.
//   PATCH /enrich — Wiki overlay flow specifically. Partial payload, fill-only
//         arba promote-only semantics, niekada nieko netrina ir neperrašo.
//
// Semantika kiekvienam laukui:
//   year/month/day        — FILL-ONLY: jei DB tuščia, įrašom; jei DB jau turi,
//                           neperrašom. (Music.lt scrape'as gali turėti
//                           teisingesnę datą nei Wiki.)
//   cover_image_url       — FILL-ONLY: tas pats principas.
//   certifications        — REPLACE: Wiki = canonical šaltinis, perrašom.
//   peak_chart_position   — REPLACE: tas pats.
//   substyle_ids          — UNION: pridedam prie esamų, nepašalinam jokių.
//   substyle_names        — fuzzy → resolve → UNION (gali sukurti naują substyle).
//   type_* (studio, ep, single, compilation, live, remix, covers, soundtrack,
//            demo, holiday)
//                         — REPLACE (2026-05-15): jei caller'is siunčia BENT
//                           VIENĄ type_* boolean, REPLACE visą set'ą pagal
//                           payload. Wiki = canonical šaltinis (taiso music.lt
//                           scrape klaidas, pvz Queen 21 albumas).
//
// Response: { ok: true, applied: {...kas buvo pakeista...} }
// Frontend gali rodyti tikslų log'ą "Pridėjom: leidimo data, peak vieta, 2 sertifikatai"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: idStr } = await params
  const albumId = parseInt(idStr)
  if (!Number.isFinite(albumId)) {
    return NextResponse.json({ error: 'Bad album id' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const sb = createAdminClient()

  // Fetch current state — fill-only ir promote-only sprendimams reikia
  // matyti, kas DB jau yra. + artist_id reikia tracks_to_create flow'ui.
  const { data: cur, error: curErr } = await sb
    .from('albums')
    .select('id, title, artist_id, year, month, day, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_covers, type_holiday, type_soundtrack, type_demo')
    .eq('id', albumId)
    .single()
  if (curErr || !cur) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  const updates: Record<string, any> = {}
  const applied: Record<string, any> = {}

  // ── FILL-ONLY: data (year/month/day) ──────────────────────────────────────
  // Jei DB jau turi pilną datą — paliekam. Jei dalis tuščia — užfilling'inam.
  // year ima precedence (be year nieko nepilds — month/day be year nelogiški).
  if (body.year && !cur.year) {
    updates.year = parseInt(String(body.year)) || null
    applied.year = updates.year
  }
  if (body.month && !cur.month && (cur.year || updates.year)) {
    updates.month = parseInt(String(body.month)) || null
    applied.month = updates.month
  }
  if (body.day && !cur.day && (cur.month || updates.month)) {
    updates.day = parseInt(String(body.day)) || null
    applied.day = updates.day
  }

  // ── FILL-ONLY: cover_image_url ────────────────────────────────────────────
  if (body.cover_image_url && !cur.cover_image_url) {
    updates.cover_image_url = body.cover_image_url
    applied.cover_image_url = body.cover_image_url
  }

  // ── REPLACE: certifications + peak_chart_position ─────────────────────────
  // Wiki = canonical šaltinis šitiems duomenims. Music.lt'as paprastai jų
  // neturi (LT vietos chartai neoperuoja per RIAA cert'us).
  if (Array.isArray(body.certifications) && body.certifications.length > 0) {
    updates.certifications = body.certifications
    applied.certifications = body.certifications.length
  }
  if (body.peak_chart_position != null && Number.isFinite(Number(body.peak_chart_position))) {
    updates.peak_chart_position = Number(body.peak_chart_position)
    applied.peak_chart_position = updates.peak_chart_position
  }

  // ── REPLACE: type flags (2026-05-15: Wiki = canonical) ────────────────────
  // Anksčiau PROMOTE-ONLY palikdavo music.lt scrape klaidas (Queen 21 albumas
  // su daug klaidingai pažym. type_studio kompiliacijoms). Dabar Wiki = source
  // of truth: jei client'as siunčia BENT VIENĄ type_* boolean,
  // laikom kad Wiki turėjo opinion ir REPLACE'inam VISĄ type set'ą
  // pagal payload (TRUE arba FALSE — lygiai ką Wiki sako).
  // Praleidžiama tik jei visi type_* nesiunčiami (caller'is admin form'as
  // ar kt., kuris nežinotų ka REPLACE'inti).
  const ALL_TYPE_FLAGS = ['type_studio','type_compilation','type_ep','type_single','type_live','type_remix','type_covers','type_holiday','type_soundtrack','type_demo'] as const
  const wikiHasAnyType = ALL_TYPE_FLAGS.some(f => typeof body[f] === 'boolean')
  if (wikiHasAnyType) {
    const replacedTypes: string[] = []
    for (const flag of ALL_TYPE_FLAGS) {
      const wikiSays = body[flag] === true
      if (wikiSays !== !!(cur as any)[flag]) {
        updates[flag] = wikiSays
        replacedTypes.push(`${wikiSays ? '+' : '-'}${flag.replace('type_','')}`)
      }
    }
    if (replacedTypes.length > 0) applied.type_replaced = replacedTypes
  }

  // ── albums table UPDATE ───────────────────────────────────────────────────
  if (Object.keys(updates).length > 0) {
    // Re-slug jei year pasikeitė (slugify konvencija: title-year)
    if (updates.year && cur.title) {
      updates.slug = slugify(cur.title) + `-${updates.year}`
    }
    const { error: upErr } = await sb.from('albums').update(updates).eq('id', albumId)
    if (upErr) {
      return NextResponse.json({ error: `Album update failed: ${upErr.message}` }, { status: 500 })
    }
  }

  // ── UNION: substyles ──────────────────────────────────────────────────────
  // Pridedam prie esamų; resolve'inam vardus per fuzzy match (jei neranda —
  // INSERT'iname naują substyle row'ą, kad taksonomija augintųsi).
  const passedIds: number[] = Array.isArray(body.substyle_ids)
    ? body.substyle_ids.filter((n: any) => Number.isFinite(Number(n)) && Number(n) > 0).map(Number)
    : []
  const passedNames: string[] = Array.isArray(body.substyle_names)
    ? body.substyle_names.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
    : []

  if (passedIds.length > 0 || passedNames.length > 0) {
    // Resolve names → IDs
    const resolvedIds = new Set<number>(passedIds)
    if (passedNames.length > 0) {
      const { data: existing } = await sb.from('substyles').select('id, name, slug')
      const existingRows: SubstyleRow[] = (existing || []) as SubstyleRow[]
      for (const rawName of passedNames) {
        const found = matchGenreToSubstyle(rawName, existingRows)
        if (found) {
          resolvedIds.add(found.id)
          continue
        }
        // Naujas substyle
        try {
          const { data: newRow, error } = await sb
            .from('substyles')
            .insert({ name: rawName, slug: slugify(rawName) })
            .select('id')
            .single()
          if (!error && newRow?.id) {
            resolvedIds.add(newRow.id)
            existingRows.push({ id: newRow.id, name: rawName, slug: slugify(rawName) })
          } else if (error) {
            const { data: bySlug } = await sb
              .from('substyles')
              .select('id')
              .eq('slug', slugify(rawName))
              .maybeSingle()
            if (bySlug?.id) resolvedIds.add(bySlug.id)
          }
        } catch {}
      }
    }

    // UNION: paimam esamus, pridedam naujus, INSERT'inam tik delta
    const { data: existingLinks } = await sb
      .from('album_substyles')
      .select('substyle_id')
      .eq('album_id', albumId)
    const existingSet = new Set<number>((existingLinks || []).map((r: any) => r.substyle_id))
    const toInsert = [...resolvedIds].filter(sid => !existingSet.has(sid))
    if (toInsert.length > 0) {
      const rows = toInsert.map(substyle_id => ({ album_id: albumId, substyle_id }))
      const { error: insErr } = await sb.from('album_substyles').insert(rows)
      if (insErr) {
        console.warn('[enrich substyles] insert error:', insErr.message)
      } else {
        applied.substyles_added = toInsert.length
      }
    }
  }

  // ── CREATE Wiki-only tracks (admin opt-in per checkbox) ──────────────────
  // body.tracks_to_create — masyvas Wiki dainų, kurias admin pažymėjo kaip
  // "sukurti DB". Per slug match'iname, kad nesukurtume duplikato (pvz jei
  // music.lt'as jau yra po skirtingu slug pavadinimu); jei vis vien naujas —
  // INSERT'iname tracks + linkuojam į album_tracks JOIN'ą.
  let createdCount = 0
  let linkedExistingCount = 0
  if (Array.isArray(body.tracks_to_create) && body.tracks_to_create.length > 0) {
    // Surinkti egzistuojančias dainas šio atlikėjo, kad galetume slug match'inti
    const { data: existingTracks } = await sb
      .from('tracks')
      .select('id, slug, title')
      .eq('artist_id', cur.artist_id)
      .limit(5000)
    const bySlug = new Map<string, number>()
    const byTitle = new Map<string, number>()
    for (const t of existingTracks || []) {
      bySlug.set((t as any).slug, (t as any).id)
      byTitle.set(((t as any).title || '').toLowerCase().trim(), (t as any).id)
    }
    // album_tracks egzistuojantys link'ai (kad netyčia neduplinkintume)
    const { data: existingLinks2 } = await sb
      .from('album_tracks')
      .select('track_id, position')
      .eq('album_id', albumId)
    const linkedSet = new Set<number>((existingLinks2 || []).map((r: any) => r.track_id))
    let nextPos = Math.max(0, ...((existingLinks2 || []).map((r: any) => r.position || 0))) + 1

    for (const t of body.tracks_to_create) {
      const title = String(t?.title || '').trim()
      if (!title) continue
      const tType = (t?.type as string) || 'normal'
      const baseSlug = slugify(title)
      let trackId = bySlug.get(baseSlug) || byTitle.get(title.toLowerCase())

      if (!trackId) {
        // Naujas track — unikalus slug
        let slug = baseSlug
        let suffix = 1
        while (true) {
          const { data: clash } = await sb.from('tracks').select('id').eq('slug', slug).maybeSingle()
          if (!clash) break
          slug = `${baseSlug}-${suffix++}`
        }
        const insertBody: any = {
          title,
          slug,
          artist_id: cur.artist_id,
          type: tType,
          is_single: !!t?.is_single,
          source: 'wikipedia',
        }
        if (t?.release_year) insertBody.release_year = parseInt(String(t.release_year)) || null
        if (t?.release_month) insertBody.release_month = parseInt(String(t.release_month)) || null
        if (t?.release_day) insertBody.release_day = parseInt(String(t.release_day)) || null
        if (t?.video_url) insertBody.video_url = t.video_url
        const { data: newRow, error: trkErr } = await sb.from('tracks').insert(insertBody).select('id').single()
        if (trkErr || !newRow?.id) {
          console.warn('[enrich tracks_to_create] insert err:', trkErr?.message, title)
          continue
        }
        trackId = newRow.id
        createdCount++
      } else if (linkedSet.has(trackId)) {
        // jau yra ir jau prijungtas — nieko nedarom
        continue
      } else {
        linkedExistingCount++
      }

      // Link į album_tracks
      if (!trackId) continue  // narrowing: po insert/maps trackId turėtų būti, defensive
      const finalTrackId: number = trackId
      const { error: linkErr } = await sb.from('album_tracks').insert({
        album_id: albumId,
        track_id: finalTrackId,
        position: nextPos++,
      })
      if (linkErr) {
        console.warn('[enrich tracks_to_create] link err:', linkErr.message, title)
      } else {
        linkedSet.add(finalTrackId)
      }
      // Featuring artists naujam track'ui — kvieciame syncTrackFeaturing'ą,
      // kuris UNION'iškai prideda featuring DB artists (jei egzistuoja) ar
      // sukuria naujus (jei dar nėra).
      if (Array.isArray(t?.featuring) && t.featuring.length > 0) {
        const featNames = t.featuring.filter((s: any) => typeof s === 'string' && s.trim())
        if (featNames.length > 0) {
          const added = await syncTrackFeaturing(sb, finalTrackId, featNames)
          if (added > 0) {
            applied.tracks_create_featuring = (applied.tracks_create_featuring || 0) + added
          }
        }
      }
    }
    if (createdCount > 0) applied.tracks_created = createdCount
    if (linkedExistingCount > 0) applied.tracks_linked_existing = linkedExistingCount
  }

  // ── AUTO-LINK matched-but-not-linked tracks ──────────────────────────────
  // Bug fix (2026-05-15): kai trackDuplicateMap matchina Wiki track → DB track
  // pagal pavadinimą, BET tas DB track nelinkint'as į ŠĮ album'ą — anksčiau
  // tiesiog rodydavom ↻ papildyti badge'ą ir nieko nelinkindavom.
  // Pvz Queen 1973 'Seven Seas of Rhye' — track buvo DB (id=107616) bet
  // album_tracks neturėjo JOIN į 100855 → admin matydavo "1 daina neprijungta"
  // amžinai. Dabar enrich automatiškai linkina visus matched DB IDs jei dar
  // neprilinkint'i.
  //
  // matched_track_ids: number[] — visi DB track IDs, kuriuos Wiki match'ino
  // (Object.values(trackDuplicateMap)). Backend filter'ina nelinkint'us.
  // matched_tracks: [{id, wiki_title}] — naujesnis formatas, leidžia ne tik
  // link'ti, bet ir promote'inti Wiki canonical title'ą (case/punct), jei DB
  // titulus skiriasi tik formatavimu.
  type MatchedTrack = { id: number; wiki_title?: string; featuring?: string[] }
  let matchedItems: MatchedTrack[] = []
  if (Array.isArray(body.matched_tracks)) {
    matchedItems = body.matched_tracks
      .map((x: any) => ({
        id: Number(x?.id),
        wiki_title: typeof x?.wiki_title === 'string' ? x.wiki_title.trim() : undefined,
        featuring: Array.isArray(x?.featuring) ? x.featuring.filter((s: any) => typeof s === 'string' && s.trim()) : undefined,
      }))
      .filter((x: MatchedTrack) => Number.isFinite(x.id) && x.id > 0)
  } else if (Array.isArray(body.matched_track_ids)) {
    matchedItems = body.matched_track_ids
      .filter((n: any) => Number.isFinite(Number(n)) && Number(n) > 0)
      .map((n: any) => ({ id: Number(n) }))
  }
  const matchedIds = matchedItems.map(m => m.id)

  let autoLinkedCount = 0
  if (matchedIds.length > 0) {
    const { data: existingLinks3 } = await sb
      .from('album_tracks')
      .select('track_id, position')
      .eq('album_id', albumId)
    const linkedSet3 = new Set<number>((existingLinks3 || []).map((r: any) => r.track_id))
    const toLink = [...new Set(matchedIds)].filter(id => !linkedSet3.has(id))
    if (toLink.length > 0) {
      let nextPos2 = Math.max(0, ...((existingLinks3 || []).map((r: any) => r.position || 0))) + 1
      const rows = toLink.map(track_id => ({ album_id: albumId, track_id, position: nextPos2++ }))
      const { error: linkErr2 } = await sb.from('album_tracks').insert(rows)
      if (linkErr2) {
        console.warn('[enrich auto-link] insert err:', linkErr2.message)
      } else {
        autoLinkedCount = toLink.length
        applied.tracks_auto_linked = autoLinkedCount
      }
    }
  }

  // ── PROMOTE Wiki canonical title — case/punct cleanup ────────────────────
  // Jei matched_tracks turi wiki_title ir norm() sutampa su DB title bet
  // actual strings skiriasi (capitalization, apostrofai, hyphenai) — Wiki
  // canonical formato promote'inam. Vienas track.title update'as automatišk-
  // ai keičiasi VISUR (visuose albumuose per album_tracks JOIN naudoja tą
  // patį track.title — tai tas pats record'as).
  const titleNorm = (s: string) => (s || '').toLowerCase()
    .replace(/[-‒–—_/]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '')
  const titleCandidates = matchedItems.filter(m => m.wiki_title)
  let titlesUpdatedCount = 0
  if (titleCandidates.length > 0) {
    // Batch'iname dabartinius DB titles
    const { data: curTitles } = await sb
      .from('tracks')
      .select('id, title')
      .in('id', titleCandidates.map(m => m.id))
    const dbTitleById = new Map<number, string>(
      (curTitles || []).map((r: any) => [r.id as number, (r.title || '') as string])
    )
    for (const m of titleCandidates) {
      const dbTitle = dbTitleById.get(m.id)
      if (dbTitle == null || !m.wiki_title) continue
      if (m.wiki_title !== dbTitle && titleNorm(m.wiki_title) === titleNorm(dbTitle)) {
        const { error } = await sb.from('tracks').update({ title: m.wiki_title }).eq('id', m.id)
        if (!error) titlesUpdatedCount++
      }
    }
    if (titlesUpdatedCount > 0) applied.titles_updated = titlesUpdatedCount
  }

  // ── FEATURING ARTISTS sync (UNION) ────────────────────────────────────────
  // Wiki parser ištraukia featuring kiekvienai dainai (cleanFeaturingTokens
  // helper'iui — drop'ina year/album metadata). Backend pridedam į
  // track_artists JOIN'ą — niekada netriname existing. Pvz Under Pressure
  // (id=107575) DB neturi David Bowie kaip feat → po Wiki import bus
  // prijungtas. Jei David Bowie egzistuoja DB (id=354 music.lt scrape) —
  // linkina; jei ne — findOrCreateArtist'as sukurs naują 'wikipedia' source.
  let featuringAddedTotal = 0
  for (const m of matchedItems) {
    if (!m.featuring || m.featuring.length === 0) continue
    const added = await syncTrackFeaturing(sb, m.id, m.featuring)
    featuringAddedTotal += added
  }
  if (featuringAddedTotal > 0) applied.featuring_added = featuringAddedTotal

  // ── COMPLETENESS state — frontend rodys ✓/⚠ badge be papildomo fetch'o ──
  // Shared helper apibūdina album + per-track pilnatvą. Žr. lib/album-completeness.
  const completeness = await computeAlbumCompleteness(sb, albumId)

  return NextResponse.json({ ok: true, applied, completeness })
}
