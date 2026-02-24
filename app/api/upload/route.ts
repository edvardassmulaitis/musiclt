import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'covers'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''

    // ── URL import ──────────────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const { url } = await req.json()
      if (!url) return NextResponse.json({ error: 'URL nerastas' }, { status: 400 })

      const response = await fetch(url)
      if (!response.ok) throw new Error(`Nepavyko parsisiųsti: ${response.status}`)

      const imgContentType = response.headers.get('content-type') || 'image/jpeg'
      if (!imgContentType.startsWith('image/')) {
        return NextResponse.json({ error: 'URL nėra paveikslėlis' }, { status: 400 })
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Failas per didelis (max 5MB)' }, { status: 400 })
      }

      const ext = imgContentType.split('/')[1]?.split(';')[0] || 'jpg'
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filename, buffer, { contentType: imgContentType, upsert: false })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename)
      return NextResponse.json({ url: urlData.publicUrl })
    }

    // ── File upload ─────────────────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Failas nerastas' }, { status: 400 })

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Leidžiami tik nuotraukų failai' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Failas per didelis (max 5MB)' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename)
    return NextResponse.json({ url: urlData.publicUrl })

  } catch (e: any) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e.message || 'Upload nepavyko' }, { status: 500 })
  }
}
