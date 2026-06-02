import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!role || !['admin', 'super_admin'].includes(role)) return null
  return session
}

// GET ?date=YYYY-MM-DD — balsų išklotinė per nominaciją: vidiniai nariai
// (profilis + svoris) ir išoriniai (anon, IP + svoris). Admin spam analizei.
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || todayLT()
  const supabase = createAdminClient()

  const { data: votes, error } = await supabase
    .from('daily_song_votes')
    .select('id, nomination_id, user_id, voter_ip, weight, created_at')
    .eq('date', date)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (votes || []) as any[]
  const userIds = Array.from(new Set(rows.filter(v => v.user_id).map(v => v.user_id)))
  const profileById: Record<string, any> = {}
  if (userIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', userIds)
    for (const p of (profs || []) as any[]) profileById[p.id] = p
  }

  const byNom: Record<number, { internal: any[]; external: any[]; total: number; weighted: number }> = {}
  for (const v of rows) {
    const b = (byNom[v.nomination_id] ||= { internal: [], external: [], total: 0, weighted: 0 })
    b.total += 1
    b.weighted += v.weight || 0
    if (v.user_id) {
      const p = profileById[v.user_id]
      b.internal.push({ user_id: v.user_id, username: p?.username || null, full_name: p?.full_name || null, avatar_url: p?.avatar_url || null, weight: v.weight, created_at: v.created_at })
    } else {
      b.external.push({ ip: v.voter_ip || '?', weight: v.weight, created_at: v.created_at })
    }
  }

  return NextResponse.json({ date, by_nomination: byNom })
}

// DELETE ?nomination_id=X[&scope=external|all] — išvalyti balsus (spam'as).
// Default scope=external (tik anon/svečių balsai). scope=all — visi.
export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const nominationId = searchParams.get('nomination_id')
  const scope = searchParams.get('scope') || 'external'
  if (!nominationId) return NextResponse.json({ error: 'nomination_id privalomas' }, { status: 400 })
  const supabase = createAdminClient()

  let q = supabase.from('daily_song_votes').delete().eq('nomination_id', Number(nominationId))
  if (scope === 'external') q = q.is('user_id', null)
  const { data: deleted, error } = await q.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: (deleted || []).length })
}
