import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { matchGenreToSubstyle, type SubstyleRow } from '@/lib/genre-match'
import { slugify } from '@/lib/slugify'

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
//   type_* (compilation, live, remix, covers, soundtrack, demo, holiday)
//                         — PROMOTE-ONLY: Wiki sako TRUE → set TRUE.
//                           Wiki nekvietė šio flag'o → nieko nedarom.
//                           NIEKADA nesetinama FALSE (neprarandame music.lt
//                           type žymėjimo).
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
  // matyti, kas DB jau yra.
  const { data: cur, error: curErr } = await sb
    .from('albums')
    .select('id, title, year, month, day, cover_image_url, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_covers, type_holiday, type_soundtrack, type_demo')
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

  // ── PROMOTE-ONLY: type flags ──────────────────────────────────────────────
  // Wiki sako TRUE → set TRUE. Niekada netrūnam į FALSE.
  // type_studio promote'inam tik jei dabar joks tipas nesetintas (defensive).
  const TYPE_FLAGS = ['type_compilation','type_ep','type_live','type_remix','type_covers','type_holiday','type_soundtrack','type_demo'] as const
  const promotedTypes: string[] = []
  for (const flag of TYPE_FLAGS) {
    if (body[flag] === true && !(cur as any)[flag]) {
      updates[flag] = true
      promotedTypes.push(flag.replace('type_',''))
    }
  }
  if (promotedTypes.length > 0) applied.type_promoted = promotedTypes

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

  return NextResponse.json({ ok: true, applied })
}
