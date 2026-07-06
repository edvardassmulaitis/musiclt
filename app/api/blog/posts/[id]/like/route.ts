import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { togglePostLike } from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import { notifyFromSession } from '@/lib/notifications'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  // ── Anoniminis „pliusas" ── 2026-06-18 Edvardo prašymu: neprisijungęs
  // vartotojas vis tiek gali paspausti „Patinka". Įrašom kaip denormalizuoto
  // skaitiklio +1 (be liker'io eilutės — anonimas neturi profilio). Klientas
  // (localStorage) saugo, kad tas pats įrenginys neperdaugintų, ir po to
  // pasiūlo užsiregistruoti, „kad paskatintų kūrėją".
  if (!session?.user?.id) {
    try {
      const sb = createAdminClient()
      // ANTI-CHEAT: serverio dedup pagal IP — 1 anon „pliusas" / IP / postui / 24h
      // (client localStorage buvo lengvai apeinamas skriptu, o like_count feed'ina
      // homepage „Narių topai").
      const okAnon = await rateLimit(`bloglike:${clientIp(req)}:${id}`, 1, 86400)
      const { data: post } = await sb
        .from('blog_posts').select('like_count').eq('id', id).maybeSingle() as { data: any }
      const cur = Number(post?.like_count) || 0
      if (!okAnon) return NextResponse.json({ liked: true, anon: true, count: cur, deduped: true })
      const next = cur + 1
      await sb.from('blog_posts').update({ like_count: next }).eq('id', id)
      return NextResponse.json({ liked: true, anon: true, count: next })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  try {
    const liked = await togglePostLike(id, session.user.id)

    // ── Notification: tik kai naujas like (ne unlike). Pranešam autoriui. ──
    if (liked) {
      try {
        const sb = createAdminClient()
        const { data: post } = await sb
          .from('blog_posts')
          .select('id, slug, title, blogs:blog_id(user_id, slug)')
          .eq('id', id)
          .maybeSingle() as { data: any }
        const recipientId = post?.blogs?.user_id
        if (recipientId && recipientId !== session.user.id) {
          const blogSlug = post?.blogs?.slug
          const postSlug = post?.slug
          const url = blogSlug && postSlug ? `/blogas/${blogSlug}/${postSlug}` : '/blogas'
          await notifyFromSession({
            recipientUserId: recipientId,
            actorSession: session,
            type: 'blog_like',
            entity_type: 'blog',
            entity_id: typeof post?.id === 'number' ? post.id : null,
            url,
            title: `Tavo įrašui „${post?.title || ''}" patiko ♥`,
            snippet: post?.title || null,
            data: { post_title: post?.title || null },
          })
        }
      } catch (e: any) {
        console.error('[notifications] blog_like failed:', e?.message || e)
      }
    }

    return NextResponse.json({ liked })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
