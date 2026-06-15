// Atlikėjo žinutės fanams.
//   GET  ?artistId=  → paskutinės žinutės (team istorijai / viešam feed'ui)
//   POST { artistId, kind, title, body?, channels? } → paskelbia + praneša sekėjams
//
// kind: release | concert | message | milestone
// Pranešimai: in-app notification + web push kiekvienam sekėjui (artist_follows).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'
import { createNotification, type NotificationType } from '@/lib/notifications'
import { sendEmail, emailLayout, unsubscribeUrl } from '@/lib/email'

const KINDS = ['release', 'concert', 'message', 'milestone'] as const
const MAX_RECIPIENTS = 5000

export async function GET(req: NextRequest) {
  const artistId = Number(new URL(req.url).searchParams.get('artistId'))
  if (!Number.isFinite(artistId) || artistId <= 0) return NextResponse.json({ updates: [] })
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_updates')
      .select('id, kind, title, body, sent_at, recipients, created_at')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .limit(30)
    return NextResponse.json({ updates: data || [] })
  } catch {
    return NextResponse.json({ updates: [] })
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })

  const { profile, ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const kind = KINDS.includes(body?.kind) ? body.kind : 'message'
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 2000) : null
  if (!title) return NextResponse.json({ error: 'Trūksta antraštės' }, { status: 400 })

  const channels: string[] = Array.isArray(body?.channels) && body.channels.length
    ? body.channels.filter((c: any) => ['push', 'feed', 'email'].includes(c))
    : ['push', 'feed']

  try {
    const sb = createAdminClient()
    const { data: artist } = await sb.from('artists').select('id, slug, name, cover_image_url').eq('id', artistId).maybeSingle()
    if (!artist) return NextResponse.json({ error: 'Atlikėjas nerastas' }, { status: 404 })

    // Sekėjai
    const { data: followers } = await sb.from('artist_follows')
      .select('user_id').eq('artist_id', artistId).limit(MAX_RECIPIENTS)
    const recipientIds = (followers || []).map((f: any) => f.user_id).filter(Boolean)

    const { data: row, error } = await sb.from('artist_updates').insert({
      artist_id: artistId, kind, title, body: text, channels,
      created_by: profile?.id || null,
      sent_at: new Date().toISOString(),
      recipients: recipientIds.length,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Pranešimai (in-app + push). Email — F1 (per esamą gmail vamzdį).
    const notifType: NotificationType = kind === 'release' ? 'favorite_artist_track' : 'system'
    const url = `/atlikejai/${artist.slug}`
    if (channels.includes('push') || channels.includes('feed')) {
      // Fire sequentially but don't block too long; createNotification swallows errors.
      await Promise.allSettled(recipientIds.map((uid: string) => createNotification({
        user_id: uid,
        type: notifType,
        actor_full_name: artist.name,
        actor_avatar_url: artist.cover_image_url || null,
        entity_type: 'artist',
        entity_id: artistId,
        url,
        title: `${artist.name}: ${title}`,
        snippet: text || undefined,
        data: { kind, artist_update_id: row.id },
      })))
    }

    // El. paštas sekėjams, kurie davė sutikimą (artist_follows.email_consent).
    let emailsSent = 0
    if (channels.includes('email')) {
      const { data: subs } = await sb.from('artist_follows')
        .select('user_id, profiles!artist_follows_user_id_fkey(email)')
        .eq('artist_id', artistId).eq('email_consent', true).limit(MAX_RECIPIENTS)
      const targets = (subs || [])
        .map((s: any) => ({ id: s.user_id, email: s.profiles?.email }))
        .filter((t: any) => t.email)
      const pageUrl = `${process.env.NEXTAUTH_URL || 'https://music.lt'}/atlikejai/${artist.slug}`
      const results = await Promise.allSettled(targets.map((t: any) => sendEmail({
        to: t.email,
        subject: `${artist.name}: ${title}`,
        html: emailLayout({
          heading: title,
          bodyHtml: (text ? text.replace(/\n/g, '<br>') : '') ,
          ctaUrl: pageUrl,
          ctaLabel: `Atidaryti ${artist.name}`,
          footerHtml: `Gauni šį laišką, nes seki ${artist.name} music.lt. <a href="${unsubscribeUrl(artistId, t.id)}" style="color:#888;">Atsisakyti šių laiškų</a>.`,
        }),
      })))
      emailsSent = results.filter((r) => r.status === 'fulfilled' && (r.value as any)?.ok).length
    }

    return NextResponse.json({ ok: true, id: row.id, recipients: recipientIds.length, emailsSent })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Serverio klaida' }, { status: 500 })
  }
}
