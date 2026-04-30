// GET — vartotojo diskusijų feed'as /pokalbiai sidebar'ui.
// Grąžina visus thread'us, kuriuose user'is sukūrė ARBA komentavo,
// distinct, sortuotus pagal last_comment_at DESC.
//
// Naudoja public.chat_my_discussions_sorted RPC iš migracijos
// 20260430d_chat_discussions_link.sql. Defensive: jei migracija dar
// neaplikuota (RPC nėra), grąžinam tuščią sąrašą.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

function isMissingFn(msg: string | null | undefined) {
  return !!msg && /chat_my_discussions|relation .* does not exist|function .* does not exist/i.test(msg)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ discussions: [], authenticated: false })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 30), 100)

  const sb = createAdminClient()
  const { data, error } = await sb.rpc('chat_my_discussions_sorted', {
    p_user_id: userId,
    p_limit: limit,
  })

  if (error) {
    if (isMissingFn(error.message)) {
      // Fallback be RPC'o — tik diskusijos kurias user'is sukūrė
      // (be "kuriose komentavo", nes comments.discussion_id galbūt dar nėra).
      const fallback = await sb
        .from('discussions')
        .select('id, slug, title, comment_count, last_comment_at, created_at')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .order('last_comment_at', { ascending: false, nullsFirst: false })
        .limit(limit)

      if (fallback.error) {
        if (isMissingFn(fallback.error.message)) return NextResponse.json({ discussions: [] })
        return NextResponse.json({ error: fallback.error.message, discussions: [] }, { status: 500 })
      }

      const rows = (fallback.data || []).map(d => ({
        ...d,
        is_author: true,
        involvement: 'created' as const,
      }))
      return NextResponse.json({ discussions: rows })
    }
    return NextResponse.json({ error: error.message, discussions: [] }, { status: 500 })
  }

  return NextResponse.json({ discussions: data || [] })
}
