// app/api/notifications/seed-demo/route.ts
//
// Demo seed: prisijungusiam user'iui sukuria 6 sample notification'us iš
// kiekvieno tipo, kad galėtum pamatyti, kaip atrodo populated bell.
// Tik current user — niekas negali seed'inti kitų.
//
//   POST /api/notifications/seed-demo
//
// Naudojimas:
//   - prisijungti
//   - kviesti POST'u (per browser console: fetch('/api/notifications/seed-demo', {method:'POST'}))
//   - reload page → varpelio dropdown'e atsiras 6 įrašai
//
// Saugumas: tik authenticated, įrašo TIK tam pačiam user_id (ne kažkam kitam).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const SAMPLES = [
  {
    type: 'comment_reply',
    title: 'Andrius atsakė į tavo komentarą',
    snippet: 'Sutinku! Šitas albumas tikrai vienas geriausių per pastaruosius 5 metus. Ypač "Antroji daina" — turbūt Mamontovo geriausia karjeroje.',
    actor_full_name: 'Andrius Mamontovas',
    actor_username: 'andrius_m',
    actor_avatar_url: null,
    entity_type: 'album',
    entity_id: 1,
    url: '/albumai/1',
  },
  {
    type: 'comment_like',
    title: 'Justė pamėgo tavo komentarą',
    snippet: '„Šita daina iš pirmo klausymo įsiminė visam gyvenimui!"',
    actor_full_name: 'Justė Arlauskaitė',
    actor_username: 'juste',
    actor_avatar_url: null,
    entity_type: 'track',
    entity_id: 1,
    url: '/dainos/1',
  },
  {
    type: 'blog_like',
    title: 'Tavo įrašui „LT scenos top 10" patiko',
    snippet: 'LT scenos top 10',
    actor_full_name: 'Marijonas',
    actor_username: 'marijonas_m',
    actor_avatar_url: null,
    entity_type: 'blog',
    entity_id: 1,
    url: '/blogas',
  },
  {
    type: 'blog_comment',
    title: 'Naujas komentaras prie „Mamontovo Kalnų Pakvietimas" recenzijos',
    snippet: 'Labai geras review, ačiū! Aš pats buvau koncerte ir gali patvirtinti — atmosfera buvo neapsakoma.',
    actor_full_name: 'Edvardas S.',
    actor_username: 'edvardas',
    actor_avatar_url: null,
    entity_type: 'blog',
    entity_id: 1,
    url: '/blogas',
  },
  {
    type: 'favorite_artist_track',
    title: 'Nauja daina nuo Mamontovo',
    snippet: 'Andrius Mamontovas išleido naują singlą — „Atgal į pradžią". Klausyk pirmas.',
    actor_full_name: 'Andrius Mamontovas',
    actor_username: 'andrius_m',
    actor_avatar_url: null,
    entity_type: 'track',
    entity_id: 1,
    url: '/dainos/1',
  },
  {
    type: 'daily_song_winner',
    title: 'Tavo nominacija laimėjo dienos dainą',
    snippet: '„Atlanta — Šaltas vėjas" surinko 142 balsus ir tapo šios dienos pasirinkimu.',
    actor_full_name: null,
    actor_username: null,
    actor_avatar_url: null,
    entity_type: 'track',
    entity_id: null,
    url: '/dienos-daina',
  },
]

export async function POST() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const sb = createAdminClient()
  const now = Date.now()

  const rows = SAMPLES.map((s, i) => ({
    user_id: userId,
    type: s.type,
    actor_id: null,
    actor_username: s.actor_username,
    actor_full_name: s.actor_full_name,
    actor_avatar_url: s.actor_avatar_url,
    entity_type: s.entity_type,
    entity_id: s.entity_id,
    url: s.url,
    title: s.title,
    snippet: s.snippet,
    data: { demo: true },
    // Sumažinam timestamp'us, kad ne visi būtų "ką tik" — atrodo realistiškiau.
    created_at: new Date(now - i * 7 * 60_000).toISOString(),
  }))

  const { error } = await sb.from('notifications').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: rows.length })
}

// Convenience: leidžia clear'inti seed (kad nesimaišytų su realiais).
export async function DELETE() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  const sb = createAdminClient()
  const { error } = await sb
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .filter('data->>demo', 'eq', 'true')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
