// app/api/mano-muzika/seen-live/media-url/route.ts
// POST { filename, contentType } → grąžina SIGNED UPLOAD URL, kad klientas
// keltų failą TIESIAI į Supabase Storage (aplenkiant Vercel 4.5MB body limitą —
// būtina video failams). Grąžina { uploadUrl, path, token, publicUrl, type }.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserId } from '../../_auth'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'sightings'
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const contentType = String(body.contentType || '').toLowerCase()
  const ext = EXT[contentType]
  if (!ext) return NextResponse.json({ error: 'Leidžiamos nuotraukos arba video (mp4/webm/mov)' }, { status: 400 })
  const type = contentType.startsWith('video/') ? 'video' : 'image'

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw error || new Error('Signed URL nepavyko')
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ uploadUrl: data.signedUrl, path: data.path, token: data.token, publicUrl: pub.publicUrl, type })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Klaida' }, { status: 500 })
  }
}
