// lib/tournament-db.ts
//
// Turnyrų seed'inimo / pergeneravimo logika su DB (server-only, admin client).
// Naudoja: scripts/seed-tournaments.ts (pilnas seed'as) ir
// app/api/zaidimai/turnyrai/salinti (kandidato šalinimas + rebuild).
//
// Kandidatų atranka vienam turnyrui (genre × scope × group):
//   1. stiliaus atlikėjai (artist_genres) filtruojami pagal scope (country)
//   2. atlikėjas priskiriamas PIRMAI grupei, kurios substiliai kertasi su jo
//      substiliais; niekur nepatekę → catch-all (substyles: null)
//   3. kiekvienam grupės atlikėjui — populiariausia daina pagal video_views
//      (≥10k peržiūrų, turi video_url), praleidžiant pašalintas (exclusions)
//   4. rikiuojama pagal peržiūras mažėjančiai

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  groupsForStyle, fitBracket, buildBracket, voteFromRound, MIN_BRACKET, MIN_VIEWS,
  type Scope, type SubstyleGroup,
} from './tournament'

export type Candidate = {
  trackId: number; views: number; title: string; artist: string; artistId: number
  year: number | null   // release_year, o jei jo nėra — YT įkėlimo metai (erų grupėms)
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/**
 * Puslapiuota selekcija (Supabase riboja 1000 eilučių). `orderBy` privalomas —
 * be stabilaus rikiavimo .range() puslapiai nestabilūs (eilutės dingsta/dubliuojasi).
 */
async function pageAll(build: () => any, orderBy: string[]): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let qy = build()
    for (const col of orderBy) qy = qy.order(col, { ascending: true })
    const { data, error } = await qy.range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** Stiliaus atlikėjai, filtruoti pagal scope. */
export async function genreArtistIds(sb: SupabaseClient, genreId: number, scope: Scope): Promise<Set<number>> {
  const rows = await pageAll(
    () => sb.from('artist_genres').select('artist_id').eq('genre_id', genreId),
    ['artist_id'],
  )
  const ids = rows.map((r: any) => r.artist_id)
  const out = new Set<number>()
  for (const chunk of chunks(ids, 500)) {
    const { data, error } = await sb.from('artists').select('id,country').in('id', chunk)
    if (error) throw error
    for (const a of data as any[]) {
      const isLt = a.country === 'Lietuva'
      if ((scope === 'lt') === isLt) out.add(a.id)
    }
  }
  return out
}

/** artist_id → Set<substilių pavadinimai> (tik nurodytiems pavadinimams). */
export async function artistSubstyleSets(
  sb: SupabaseClient, artistIds: Set<number>, names: string[],
): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>()
  if (!names.length || !artistIds.size) return out
  const { data: subs, error } = await sb.from('substyles').select('id,name').in('name', names)
  if (error) throw error
  const idToName = new Map((subs as any[]).map(s => [s.id, s.name]))
  if (!idToName.size) return out
  const links = await pageAll(
    () => sb.from('artist_substyles').select('artist_id,substyle_id').in('substyle_id', [...idToName.keys()]),
    ['artist_id', 'substyle_id'],
  )
  for (const l of links) {
    if (!artistIds.has(l.artist_id)) continue
    const n = idToName.get(l.substyle_id)
    if (!n) continue
    if (!out.has(l.artist_id)) out.set(l.artist_id, new Set())
    out.get(l.artist_id)!.add(n)
  }
  return out
}

/**
 * Kandidatų priskyrimas grupėms: pirma sutampanti grupė laimi, likę → catch-all.
 * Substilių grupė žiūri į atlikėjo substilius; erų grupė (eraTo) — į
 * populiariausios dainos metus (nežinomi metai eros grupei NEatitinka).
 */
export function assignToGroups(
  groups: SubstyleGroup[], cands: Candidate[], artistSubs: Map<number, Set<string>>,
): Map<string, Candidate[]> {
  const out = new Map<string, Candidate[]>(groups.map(g => [g.key, []]))
  const catchAll = groups.find(g => !g.substyles && g.eraTo == null && g.eraFrom == null)
  for (const c of cands) {
    let placed = false
    for (const g of groups) {
      if (g.substyles) {
        const subs = artistSubs.get(c.artistId)
        if (subs && g.substyles.some(sn => subs.has(sn))) { out.get(g.key)!.push(c); placed = true; break }
      } else if (g.eraTo != null || g.eraFrom != null) {
        if (c.year != null && (g.eraFrom == null || c.year >= g.eraFrom) && (g.eraTo == null || c.year <= g.eraTo)) {
          out.get(g.key)!.push(c); placed = true; break
        }
      }
    }
    if (!placed && catchAll) out.get(catchAll.key)!.push(c)
  }
  return out
}

/** Pašalintų dainų (niekada nebedalyvauja) ID aibė. */
export async function loadExclusions(sb: SupabaseClient): Promise<Set<number>> {
  const rows = await pageAll(
    () => sb.from('boombox_tournament_exclusions').select('track_id'),
    ['track_id'],
  )
  return new Set(rows.map((r: any) => r.track_id))
}

/**
 * Populiariausia tinkama daina kiekvienam atlikėjui (praleidžiant excluded).
 * Grąžina Map<artistId, Candidate>.
 */
export async function bestTrackPerArtist(
  sb: SupabaseClient, artistIds: Set<number>, excluded: Set<number>,
): Promise<Map<number, Candidate>> {
  const best = new Map<number, Candidate>()
  for (const chunk of chunks([...artistIds], 300)) {
    // orderBy artist_id (idx_tracks_artist_id) — rikiavimas pagal id verstų
    // planner'į skenuoti pkey kol pririnks puslapį ir baigdavosi timeout'u
    const rows = await pageAll(
      () => sb.from('tracks')
        .select('id,title,artist_id,video_views,release_year,video_uploaded_at,artists:artist_id!inner(name)')
        .in('artist_id', chunk)
        .not('video_url', 'is', null)
        .gte('video_views', 10000),
      ['artist_id', 'id'],
    )
    for (const t of rows) {
      if (excluded.has(t.id)) continue
      const v = t.video_views || 0
      const cur = best.get(t.artist_id)
      if (!cur || v > cur.views) {
        const year = t.release_year
          ?? (t.video_uploaded_at ? new Date(t.video_uploaded_at).getUTCFullYear() : null)
        best.set(t.artist_id, { trackId: t.id, views: v, title: t.title, artist: t.artists?.name, artistId: t.artist_id, year })
      }
    }
  }
  return best
}

export type TournamentSpec = { genreId: number; scope: Scope; group: SubstyleGroup }

/** Kandidatai vienam turnyrui, surikiuoti pagal peržiūras mažėjančiai. */
export async function candidatesForSpec(sb: SupabaseClient, spec: TournamentSpec): Promise<Candidate[]> {
  const groups = groupsForStyle(spec.genreId, spec.scope)
  const artistIds = await genreArtistIds(sb, spec.genreId, spec.scope)
  const allNames = groups.flatMap(g => g.substyles ?? [])
  const subs = await artistSubstyleSets(sb, artistIds, allNames)
  const excluded = await loadExclusions(sb)
  const best = await bestTrackPerArtist(sb, artistIds, excluded)
  // Peržiūrų slenkstis — saugo nuo visiškai nežinomų vardų dvikovose
  const floor = MIN_VIEWS[spec.scope]
  const eligible = [...best.values()].filter(c => c.views >= floor)
  const byGroup = assignToGroups(groups, eligible, subs)
  return (byGroup.get(spec.group.key) ?? []).sort((a, b) => b.views - a.views)
}

/**
 * Pergeneruoja VIENĄ turnyrą iš naujo (po kandidato pašalinimo).
 * Saugiklis: jei turnyre jau yra balsavimu išspręstų matų — atsisako
 * (pergeneravimas nurašytų bendruomenės balsus).
 */
export async function rebuildTournament(sb: SupabaseClient, tournamentId: number): Promise<{ size: number; entrants: Candidate[] }> {
  const { data: t, error: te } = await sb.from('boombox_tournaments')
    .select('id,genre_id,scope,group_key,title,size,status')
    .eq('id', tournamentId).single()
  if (te || !t) throw new Error('Turnyras nerastas')

  if (await tournamentTouched(sb, tournamentId)) {
    throw new Error('Turnyras jau startavęs (yra išspręstų ar paskelbtų matų) — pergeneruoti negalima')
  }

  const groups = groupsForStyle(t.genre_id, t.scope as Scope)
  const group = groups.find(g => g.key === (t.group_key ?? ''))
  if (!group) throw new Error(`Nerasta grupės konfigūracija: ${t.scope}/${t.genre_id}/${t.group_key}`)

  const cands = await candidatesForSpec(sb, { genreId: t.genre_id, scope: t.scope as Scope, group })
  const size = Math.min(group.target, fitBracket(cands.length))
  if (size < MIN_BRACKET) throw new Error(`Liko tik ${cands.length} tinkamų dainų (min ${MIN_BRACKET})`)

  const entrants = cands.slice(0, size)
  const matches = buildBracket(entrants.map(c => ({ trackId: c.trackId, views: c.views })), size)

  const { error: de } = await sb.from('boombox_tournament_matches').delete().eq('tournament_id', tournamentId)
  if (de) throw de
  const { error: ue } = await sb.from('boombox_tournaments')
    .update({ size, vote_from_round: voteFromRound(size), current_round: 1, updated_at: new Date().toISOString() })
    .eq('id', tournamentId)
  if (ue) throw ue
  const rows = matches.map(m => ({
    tournament_id: tournamentId, round: m.round, slot: m.slot,
    track_a_id: m.aId, track_b_id: m.bId, winner_track_id: null, decided_by: null,
  }))
  const { error: me } = await sb.from('boombox_tournament_matches').insert(rows)
  if (me) throw me

  return { size, entrants }
}

/** Ar turnyras „paliestas" — turi išspręstų ARBA jau paskelbtų (gyvų) matų? */
export async function tournamentTouched(sb: SupabaseClient, tournamentId: number): Promise<boolean> {
  const { count, error } = await sb.from('boombox_tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .or('winner_track_id.not.is.null,duel_drop_id.not.is.null')
  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * TAŠKINIS keitimas startavusiam turnyrui: pašalinta daina pakeičiama kita
 * (geriausia dar nedalyvaujančia) TOJE PAČIOJE bracket'o vietoje — jau
 * nubalsuoti matai nepaliečiami. Šiandienos gyvo mato (paskelbto, bet dar
 * neišspręsto) keisti negalima — balsai jau renkami.
 */
export async function replaceTrackInPlace(
  sb: SupabaseClient, tournamentId: number, trackId: number,
): Promise<{ newTrack: Candidate; slots: number }> {
  const { data: t, error: te } = await sb.from('boombox_tournaments')
    .select('id,genre_id,scope,group_key').eq('id', tournamentId).single()
  if (te || !t) throw new Error('Turnyras nerastas')

  const { data: ms, error: me } = await sb.from('boombox_tournament_matches')
    .select('id,round,slot,track_a_id,track_b_id,winner_track_id,duel_drop_id')
    .eq('tournament_id', tournamentId)
  if (me) throw me

  const targets = (ms ?? []).filter(m =>
    m.winner_track_id == null && (m.track_a_id === trackId || m.track_b_id === trackId))
  if (!targets.length) throw new Error('Daina neturi neišspręstų matų šiame turnyre (jau iškritusi arba matai baigti)')
  if (targets.some(m => m.duel_drop_id != null)) {
    throw new Error('Ši daina yra šiandienos GYVOJE dvikovoje — balsai jau renkami, keisti galima nuo rytojaus')
  }

  const groups = groupsForStyle(t.genre_id, t.scope as Scope)
  const group = groups.find(g => g.key === (t.group_key ?? ''))
  if (!group) throw new Error(`Nerasta grupės konfigūracija: ${t.scope}/${t.genre_id}/${t.group_key}`)

  const participants = new Set<number>()
  for (const m of ms ?? []) {
    if (m.track_a_id) participants.add(m.track_a_id)
    if (m.track_b_id) participants.add(m.track_b_id)
  }
  const cands = await candidatesForSpec(sb, { genreId: t.genre_id, scope: t.scope as Scope, group })
  const next = cands.find(c => !participants.has(c.trackId))
  if (!next) throw new Error('Nėra tinkamo pakaitalo (visi kandidatai jau dalyvauja)')

  for (const m of targets) {
    const side = m.track_a_id === trackId ? 'track_a_id' : 'track_b_id'
    const { error } = await sb.from('boombox_tournament_matches')
      .update({ [side]: next.trackId }).eq('id', m.id)
    if (error) throw error
  }
  await sb.from('boombox_tournaments')
    .update({ updated_at: new Date().toISOString() }).eq('id', tournamentId)
  return { newTrack: next, slots: targets.length }
}

/**
 * PENDING turnyrų atšviežinimas: stilių/substilių/erų duomenys keičiasi, tad
 * dar nestartavę turnyrai periodiškai pergeneruojami iš naujausių duomenų.
 * Po `limit` seniausiai atnaujintų per iškvietimą (cron'as sukasi 3×/parą —
 * visa eilė atsišviežina per ~2-3 paras, netelpant į maxDuration limitą).
 */
export async function refreshStalePending(
  sb: SupabaseClient, limit = 4,
): Promise<Array<{ id: number; title: string; size: number; changed: boolean }>> {
  const { data: ts, error } = await sb.from('boombox_tournaments')
    .select('id,title,size')
    .eq('status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const out: Array<{ id: number; title: string; size: number; changed: boolean }> = []
  for (const t of ts ?? []) {
    try {
      if (await tournamentTouched(sb, t.id)) continue  // apsauga nuo lenktynių
      const before = await participantsSignature(sb, t.id)
      const r = await rebuildTournament(sb, t.id)
      const after = await participantsSignature(sb, t.id)
      out.push({ id: t.id, title: t.title, size: r.size, changed: before !== after })
    } catch (e: any) {
      out.push({ id: t.id, title: t.title, size: t.size, changed: false })
    }
  }
  return out
}

/** Dalyvių „parašas" — pigiam „ar kas nors pasikeitė?" palyginimui. */
async function participantsSignature(sb: SupabaseClient, tournamentId: number): Promise<string> {
  const { data } = await sb.from('boombox_tournament_matches')
    .select('track_a_id,track_b_id').eq('tournament_id', tournamentId).eq('round', 1)
    .order('slot')
  return (data ?? []).map(m => `${m.track_a_id}/${m.track_b_id}`).join(',')
}
