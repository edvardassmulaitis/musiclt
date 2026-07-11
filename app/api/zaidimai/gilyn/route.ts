// app/api/zaidimai/gilyn/route.ts
//
// GILYN API — dienos dėžės run'o būsena ir veiksmai.
//
// GET  → { day, box (asmenine tvarka), statuses, run, community?, map onboarding info }
// POST { action } → run mutacijos:
//   start | advance | hold | swap | shelf | heard | undo | finishBox |
//   surprise | endDay | chooseDoor | finalPick | saveFind
//
// Visos būsenos keičiamos TIK serveryje — klientas siunčia intent'us.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { todayLT } from '@/lib/boombox'
import { bumpStreakAndXp } from '@/lib/boombox'
import { resolveViewer, insertGameScore } from '@/lib/zaidimai'
import {
  BOX_SIZE, DIG_STEPS, GILYN_XP_FINISH, GILYN_XP_NEW_NODE,
  ensureDayBox, personalOrder, fetchViewerLikes, computeBoxStatuses,
  generateDoors, upsertMapNode, communityStats,
  type BoxAlbum, type Door, type PathNode,
} from '@/lib/gilyn'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function viewerKey(v: { userId: string | null; anonId: string | null }): string {
  return v.userId || v.anonId || 'guest'
}

async function loadRun(sb: any, day: string, v: { userId: string | null; anonId: string | null }) {
  let q = sb.from('gilyn_runs').select('*').eq('day', day)
  q = v.userId ? q.eq('user_id', v.userId) : q.eq('anon_id', v.anonId)
  const { data } = await q.maybeSingle()
  return data || null
}

function publicRun(run: any) {
  if (!run) return null
  return {
    status: run.status,
    boxPos: run.box_pos,
    held: run.held || null,
    swaps: run.swaps || 0,
    shelf: run.shelf || [],
    heard: run.heard || [],
    doors: run.doors || null,
    path: run.path || [],
    digStep: run.dig_step || 0,
    finalPick: run.final_pick || null,
    finishedAt: run.finished_at || null,
  }
}

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const viewer = await resolveViewer()
    const sb = createAdminClient()
    const day = todayLT()

    const box = await ensureDayBox(day)
    const ordered = personalOrder(box, day, viewerKey(viewer))
    const likes = await fetchViewerLikes(viewer)
    const statuses = await computeBoxStatuses(ordered, likes)
    const run = await loadRun(sb, day, viewer)

    let community = null
    if (run?.status === 'done') community = await communityStats(day, run)

    return NextResponse.json({
      day,
      isAuthenticated: viewer.isAuthenticated,
      username: viewer.username,
      boxSize: BOX_SIZE,
      digSteps: DIG_STEPS,
      box: ordered.map(a => ({ ...a, personal: statuses.get(a.albumId) || 'new' })),
      run: publicRun(run),
      likeCounts: likes.counts,
      community,
    })
  } catch (e: any) {
    console.error('gilyn GET:', e?.message)
    return NextResponse.json({ error: 'Nepavyko užkrauti dienos dėžės' }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const viewer = await resolveViewer()
    if (!viewer.userId && !viewer.anonId) {
      return NextResponse.json({ error: 'Sesija nepasiekiama' }, { status: 401 })
    }
    const sb = createAdminClient()
    const day = todayLT()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    const box = await ensureDayBox(day)
    const ordered = personalOrder(box, day, viewerKey(viewer))
    const byAlbum = new Map(ordered.map(a => [a.albumId, a]))
    let run = await loadRun(sb, day, viewer)

    // ── start ──
    if (action === 'start') {
      if (!run) {
        const { data, error } = await sb.from('gilyn_runs').insert({
          day,
          user_id: viewer.userId,
          anon_id: viewer.userId ? null : viewer.anonId,
        }).select('*').single()
        if (error) run = await loadRun(sb, day, viewer)
        else run = data
      }
      return NextResponse.json({ run: publicRun(run) })
    }

    if (!run) return NextResponse.json({ error: 'Run\'as nepradėtas' }, { status: 400 })

    const save = async (patch: Record<string, any>) => {
      patch.updated_at = new Date().toISOString()
      const { data } = await sb.from('gilyn_runs').update(patch).eq('id', run.id).select('*').single()
      run = data || { ...run, ...patch }
    }

    const history: any[] = Array.isArray(run.history) ? run.history : []

    // ── Dėžės veiksmai ──
    if (run.status === 'box') {
      const pos = run.box_pos || 0

      if (action === 'advance' || action === 'hold' || action === 'swap') {
        if (pos >= BOX_SIZE) return NextResponse.json({ error: 'Dėžė jau baigta' }, { status: 400 })
        const albumId = Number(body.albumId || 0)
        let held = run.held

        if (action === 'hold' || action === 'swap') {
          const alb = byAlbum.get(albumId)
          if (!alb) return NextResponse.json({ error: 'Nežinomas albumas' }, { status: 400 })
          held = {
            albumId: alb.albumId, artistId: alb.artistId, title: alb.title, artist: alb.artist,
            artistSlug: alb.artistSlug, year: alb.year, cover: alb.cover, ytId: alb.ytId,
          }
        }
        history.push({ pos, action, albumId: albumId || null, prevHeld: run.held?.albumId || null })
        await save({
          box_pos: pos + 1,
          held,
          swaps: action === 'swap' ? (run.swaps || 0) + 1 : run.swaps,
          history: history.slice(-40),
        })

        // Automatinis perėjimas į kasimąsi, kai dėžė baigta ir yra laikomas vinilas
        if ((run.box_pos || 0) >= BOX_SIZE && run.held) {
          return transitionToDig(sb, run, viewer, day, box)
        }
        return NextResponse.json({ run: publicRun(run) })
      }

      if (action === 'shelf') {
        const alb = byAlbum.get(Number(body.albumId || 0))
        if (!alb) return NextResponse.json({ error: 'Nežinomas albumas' }, { status: 400 })
        const shelf: any[] = Array.isArray(run.shelf) ? run.shelf : []
        if (!shelf.some(s => s.albumId === alb.albumId)) {
          shelf.push({ albumId: alb.albumId, artistId: alb.artistId, title: alb.title, artist: alb.artist, cover: alb.cover, year: alb.year, ytId: alb.ytId })
        }
        await save({ shelf })
        return NextResponse.json({ run: publicRun(run) })
      }

      if (action === 'heard') {
        const albumId = Number(body.albumId || 0)
        const heard: number[] = Array.isArray(run.heard) ? run.heard : []
        if (albumId && !heard.includes(albumId)) heard.push(albumId)
        await save({ heard })
        const alb = byAlbum.get(albumId)
        if (alb) upsertMapNode(viewer, alb.artistId, { heard: true }).catch(() => {})
        return NextResponse.json({ run: publicRun(run) })
      }

      if (action === 'undo') {
        const last = history.pop()
        if (!last || (run.box_pos || 0) <= 0) return NextResponse.json({ run: publicRun(run) })
        let held = run.held
        if (last.action === 'hold') held = null
        else if (last.action === 'swap') {
          const prev = last.prevHeld ? byAlbum.get(last.prevHeld) : null
          held = prev ? {
            albumId: prev.albumId, artistId: prev.artistId, title: prev.title, artist: prev.artist,
            artistSlug: prev.artistSlug, year: prev.year, cover: prev.cover, ytId: prev.ytId,
          } : run.held
        }
        await save({
          box_pos: Math.max(0, (run.box_pos || 0) - 1),
          held,
          swaps: last.action === 'swap' ? Math.max(0, (run.swaps || 0) - 1) : run.swaps,
          history,
        })
        return NextResponse.json({ run: publicRun(run) })
      }

      if (action === 'surprise') {
        // „Nustebink mane" — parenkam tinkamą portalą iš dėžės (seed = viewer+day)
        if (run.held) return NextResponse.json({ error: 'Jau turi laikomą vinilą' }, { status: 400 })
        const pick = ordered[(Math.abs(viewerKey(viewer).length * 7 + day.length) + (run.id % ordered.length)) % ordered.length]
        await save({
          held: {
            albumId: pick.albumId, artistId: pick.artistId, title: pick.title, artist: pick.artist,
            artistSlug: pick.artistSlug, year: pick.year, cover: pick.cover, ytId: pick.ytId,
          },
          box_pos: BOX_SIZE,
        })
        return transitionToDig(sb, run, viewer, day, box)
      }

      if (action === 'finishBox') {
        if (run.held) {
          await save({ box_pos: BOX_SIZE })
          return transitionToDig(sb, run, viewer, day, box)
        }
        await save({ box_pos: BOX_SIZE })
        return NextResponse.json({ run: publicRun(run) })
      }

      if (action === 'endDay') {
        await save({ status: 'done', finished_at: new Date().toISOString() })
        const community = await communityStats(day, run)
        return NextResponse.json({ run: publicRun(run), community })
      }
    }

    // ── Kasimosi veiksmai ──
    if (run.status === 'dig') {
      if (action === 'heard') {
        const artistId = Number(body.artistId || 0)
        if (artistId) upsertMapNode(viewer, artistId, { heard: true }).catch(() => {})
        return NextResponse.json({ run: publicRun(run) })
      }

      if (action === 'chooseDoor') {
        const artistId = Number(body.artistId || 0)
        const doors: Door[] = Array.isArray(run.doors) ? run.doors : []
        const door = doors.find(d => d.artistId === artistId)
        if (!door) return NextResponse.json({ error: 'Tokių durų nėra' }, { status: 400 })

        const path: PathNode[] = Array.isArray(run.path) ? run.path : []
        const step = (run.dig_step || 0) + 1
        path.push({
          step, doorType: door.doorType, artistId: door.artistId, artist: door.artist,
          artistSlug: door.artistSlug, albumId: door.albumId, title: door.title,
          cover: door.cover, year: door.year, ytId: door.ytId, reason: door.reason,
        })
        await upsertMapNode(viewer, door.artistId, { visited: true }, door.doorType)

        if (step >= DIG_STEPS) {
          await save({ path, dig_step: step, doors: null, status: 'done', finished_at: new Date().toISOString(), final_pick: path[path.length - 1] })
          // default dienos radinys = paskutinis kelio taškas → žemėlapio žvaigždė
          upsertMapNode(viewer, door.artistId, { saved: true }).catch(() => {})
          // XP + rezultatas
          const newNodes = path.length
          const xp = GILYN_XP_FINISH + Math.min(3, newNodes) * GILYN_XP_NEW_NODE
          insertGameScore({
            viewer, game: 'gilyn' as any, category: day,
            score: newNodes, xpEarned: xp,
            details: { held: run.held?.albumId, swaps: run.swaps, doors: path.map(p => p.doorType) },
          }).catch(() => {})
          bumpStreakAndXp({ userId: viewer.userId, anonId: viewer.anonId, xp }).catch(() => {})
          const community = await communityStats(day, run)
          return NextResponse.json({ run: publicRun(run), community, xp })
        }

        // Kitos durys
        const exclude = new Set<number>(box.map(b => b.artistId))
        for (const p of path) exclude.add(p.artistId)
        for (const d of doors) exclude.add(d.artistId)
        const likes = await fetchViewerLikes(viewer)
        const visited = await visitedArtistIds(sb, viewer)
        const next = await generateDoors({
          currentArtistId: door.artistId,
          exclude, likedArtists: likes.artistIds, visitedArtists: visited,
          seed: `${day}|${viewerKey(viewer)}|${step}`,
        })
        await save({ path, dig_step: step, doors: next })
        return NextResponse.json({ run: publicRun(run) })
      }
    }

    // ── Po run'o ──
    if (run.status === 'done') {
      if (action === 'finalPick') {
        const idx = Number(body.index)
        const path: PathNode[] = Array.isArray(run.path) ? run.path : []
        // path jau turi portalą (step 0) — held pridedam tik jei jo tenai nėra
        const all: any[] = [
          ...(run.held && !path.some(p => p.step === 0) ? [{ step: 0, doorType: 'portal', ...run.held }] : []),
          ...path,
        ]
        if (idx < 0 || idx >= all.length) return NextResponse.json({ error: 'Blogas indeksas' }, { status: 400 })
        const pick = all[idx]
        await save({ final_pick: pick })
        if (pick?.artistId) upsertMapNode(viewer, pick.artistId, { saved: true }).catch(() => {})
        return NextResponse.json({ run: publicRun(run) })
      }
    }

    return NextResponse.json({ error: 'Nežinomas veiksmas' }, { status: 400 })
  } catch (e: any) {
    console.error('gilyn POST:', e?.message)
    return NextResponse.json({ error: 'Įvyko klaida' }, { status: 500 })
  }
}

// ── Perėjimas dėžė → kasimasis ────────────────────────────────────────────

async function visitedArtistIds(sb: any, viewer: { userId: string | null; anonId: string | null }): Promise<Set<number>> {
  let q = sb.from('gilyn_map_nodes').select('artist_id').eq('visited', true)
  q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId)
  const { data } = await q.limit(500)
  return new Set(((data as any[]) || []).map(r => r.artist_id))
}

async function transitionToDig(sb: any, run: any, viewer: any, day: string, box: BoxAlbum[]) {
  const held = run.held
  // Portalas — pirmas kelio taškas
  const path: PathNode[] = [{
    step: 0, doorType: 'portal', artistId: held.artistId, artist: held.artist,
    artistSlug: held.artistSlug || null, albumId: held.albumId, title: held.title,
    cover: held.cover, year: held.year, ytId: held.ytId || null, reason: null,
  }]
  await upsertMapNode(viewer, held.artistId, { visited: true }, 'portal')

  const exclude = new Set<number>(box.map(b => b.artistId))
  const likes = await fetchViewerLikes(viewer)
  const visited = await visitedArtistIds(sb, viewer)
  const doors = await generateDoors({
    currentArtistId: held.artistId,
    exclude, likedArtists: likes.artistIds, visitedArtists: visited,
    seed: `${day}|${viewer.userId || viewer.anonId}|1`,
  })
  const { data } = await sb.from('gilyn_runs').update({
    status: 'dig', path, doors, dig_step: 0, updated_at: new Date().toISOString(),
  }).eq('id', run.id).select('*').single()
  return NextResponse.json({
    run: {
      status: 'dig', boxPos: BOX_SIZE, held, swaps: data?.swaps || run.swaps || 0,
      shelf: data?.shelf || [], heard: data?.heard || [], doors, path,
      digStep: 0, finalPick: null, finishedAt: null,
    },
  })
}
