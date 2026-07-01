import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { authorKey } from '@/lib/parse-review-author'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/naujienu-triage/link
//
// Vienas endpoint'as triage veiksmams. Body:
//   { action:'link',   discussion_id, profile_id, author_display? }
//        Susieja autorių su nariu. Jei triage eilutė neturi author_key
//        (parser'is nepagavo), author_display privalomas — iš jo skaičiuojam
//        raktą. ĮSIMENA į review_author_map ir priskiria narį VISIEMS to
//        autoriaus (author_key) įrašams (išskyrus 'converted'/'dismissed').
//   { action:'unlink', discussion_id }
//        Nuima susiejimą nuo VIENO įrašo (atgal į 'pending'). Atminties netrina.
//   { action:'forget', author_key }
//        Ištrina atmintį + atriša visus tos autorės (status='linked') įrašus.
//   { action:'dismiss'|'undismiss', discussion_id }
//        Pažymi/atžymi įrašą kaip nereikšmingą (praleistiną).
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = String(body.action || '')

  const sb = createAdminClient()
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const actorId = String((session.user as any)?.id || '')
  const actor = uuidRe.test(actorId) ? actorId : null
  const now = new Date().toISOString()

  // ── LINK ──────────────────────────────────────────────────────────────
  if (action === 'link') {
    const discussionId = Number(body.discussion_id)
    const profileId = String(body.profile_id || '')
    if (!discussionId || !uuidRe.test(profileId)) {
      return NextResponse.json({ error: 'discussion_id ir galiojantis profile_id privalomi' }, { status: 400 })
    }
    // Patikrinam, kad narys egzistuoja.
    const { data: prof } = await sb.from('profiles').select('id, username, full_name, avatar_url').eq('id', profileId).maybeSingle()
    if (!prof) return NextResponse.json({ error: 'Narys nerastas' }, { status: 404 })

    // Esama triage eilutė (jei yra) — kad gautume author_key/raw.
    const { data: cur } = await sb
      .from('news_review_triage')
      .select('discussion_id, author_raw, author_key, status')
      .eq('discussion_id', discussionId)
      .maybeSingle()

    const display: string = (body.author_display || cur?.author_raw || '').trim()
    const key = cur?.author_key || (display ? authorKey(display) : '')
    if (!key) {
      return NextResponse.json({ error: 'Nėra autoriaus vardo — nurodyk author_display' }, { status: 400 })
    }

    // 1. Įsimenam į atmintį (upsert pagal author_key).
    const { error: mapErr } = await sb
      .from('review_author_map')
      .upsert(
        { author_key: key, author_display: display || null, profile_id: profileId, created_by: actor },
        { onConflict: 'author_key' },
      )
    if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 500 })

    // 2. Užtikrinam, kad ŠI eilutė turi teisingą key/raw (jei parser'is nepagavo).
    await sb.from('news_review_triage').upsert(
      {
        discussion_id: discussionId,
        author_raw: display || cur?.author_raw || null,
        author_key: key,
        author_profile_id: profileId,
        status: 'linked',
        updated_at: now,
        updated_by: actor,
      },
      { onConflict: 'discussion_id' },
    )

    // 3. ATMINTIS: priskiriam narį VISIEMS to author_key įrašams
    //    (išskyrus jau konvertuotus / atmestus).
    const { data: affected, error: updErr } = await sb
      .from('news_review_triage')
      .update({ author_profile_id: profileId, status: 'linked', updated_at: now, updated_by: actor })
      .eq('author_key', key)
      .not('status', 'in', '("converted","dismissed")')
      .select('discussion_id')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, action, author_key: key, member: prof, affected: (affected || []).length })
  }

  // ── UNLINK (vienas įrašas) ──────────────────────────────────────────────
  if (action === 'unlink') {
    const discussionId = Number(body.discussion_id)
    if (!discussionId) return NextResponse.json({ error: 'discussion_id privalomas' }, { status: 400 })
    const { error } = await sb
      .from('news_review_triage')
      .update({ author_profile_id: null, status: 'pending', updated_at: now, updated_by: actor })
      .eq('discussion_id', discussionId)
      .eq('status', 'linked')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action })
  }

  // ── FORGET (ištrinam atmintį visai autorei) ────────────────────────────
  if (action === 'forget') {
    const key = String(body.author_key || '').trim()
    if (!key) return NextResponse.json({ error: 'author_key privalomas' }, { status: 400 })
    await sb.from('review_author_map').delete().eq('author_key', key)
    const { data: affected } = await sb
      .from('news_review_triage')
      .update({ author_profile_id: null, status: 'pending', updated_at: now, updated_by: actor })
      .eq('author_key', key)
      .eq('status', 'linked')
      .select('discussion_id')
    return NextResponse.json({ ok: true, action, affected: (affected || []).length })
  }

  // ── DISMISS / UNDISMISS ────────────────────────────────────────────────
  if (action === 'dismiss' || action === 'undismiss') {
    const discussionId = Number(body.discussion_id)
    if (!discussionId) return NextResponse.json({ error: 'discussion_id privalomas' }, { status: 400 })
    const status = action === 'dismiss' ? 'dismissed' : 'pending'
    const { error } = await sb.from('news_review_triage').upsert(
      { discussion_id: discussionId, status, updated_at: now, updated_by: actor },
      { onConflict: 'discussion_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action })
  }

  return NextResponse.json({ error: `Nežinomas action: ${action}` }, { status: 400 })
}
