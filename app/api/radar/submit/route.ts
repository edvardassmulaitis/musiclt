/**
 * POST /api/radar/submit
 *
 * Anonimiškas „Naujos muzikos radaro" atlikėjo pateikimas → moderacijos eilė
 * (radar_submissions, status='pending'). NIEKAS nerodoma viešai, kol admin
 * patvirtina (/admin/radaras).
 *
 * Apsaugos nuo botų/spamo (be išorinių CAPTCHA raktų):
 *   1) Honeypot laukas `website` — botai jį užpildo; jei netuščias → tyliai OK.
 *   2) Time-trap `ts` — formos render laikas; < 2.5s arba > 3h → tyliai OK.
 *   3) IP rate-limit — 3/val., 8/parą.
 *   4) Email rate-limit — 2/parą.
 *   5) Turinio euristika — per daug URL'ų → atmesti.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_FILL_MS = 2500
const MAX_FILL_MS = 3 * 3600 * 1000
const IP_HOURLY = 3
const IP_DAILY = 8
const EMAIL_DAILY = 2
const MAX_URLS = 6

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const okSilently = () => NextResponse.json({ ok: true })

function clientIp(req: NextRequest): string {
  // x-real-ip (Vercel-patikimas) / dešinysis XFF — kad IP limitas nebūtų
  // apeinamas spoof'inant kairįjį X-Forwarded-For.
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const parts = (req.headers.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'unknown'
}
function countUrls(s: string): number {
  return (s.match(/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|lt|io|fm|me)\b/gi) || []).length
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Neteisingas užklausos turinys' }, { status: 400 })
  }

  // 1) Honeypot
  if (typeof body?.website === 'string' && body.website.trim() !== '') return okSilently()

  // 2) Time-trap
  const ts = Number(body?.ts)
  const elapsed = Date.now() - ts
  if (!Number.isFinite(ts) || elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) return okSilently()

  // Prisijungęs naudotojas? (tada el. paštas nebūtinas — imam iš sesijos)
  let sessionUserId: string | null = null
  let sessionEmail: string | null = null
  try {
    const session = await getServerSession(authOptions)
    sessionUserId = (session?.user as any)?.id || session?.user?.email || null
    sessionEmail = session?.user?.email || null
  } catch { /* anon */ }

  // Validacija
  const artist_name = String(body?.artist_name || '').trim()
  const providedEmail = String(body?.contact_email || '').trim()
  const contact_email = providedEmail || sessionEmail || ''
  const links = String(body?.links || '').trim().slice(0, 1000)
  const genre = String(body?.genre || '').trim().slice(0, 80) || null
  const city = String(body?.city || '').trim().slice(0, 80) || null
  const bio = String(body?.bio || '').trim().slice(0, 1500)
  const message = String(body?.message || '').trim().slice(0, 1000)

  if (artist_name.length < 2 || artist_name.length > 120)
    return NextResponse.json({ error: 'Įrašyk atlikėjo / grupės pavadinimą.' }, { status: 400 })
  if (!EMAIL_RE.test(contact_email))
    return NextResponse.json({ error: 'Palik el. paštą, kad galėtume susisiekti.' }, { status: 400 })
  if (countUrls(`${bio} ${message}`) > MAX_URLS)
    return NextResponse.json({ error: 'Per daug nuorodų tekste.' }, { status: 400 })

  const sb = createAdminClient()
  const ip = clientIp(req)
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()

  // 3) IP rate-limit
  try {
    if (ip !== 'unknown') {
      const { count: ipHour } = await sb.from('radar_submissions').select('id', { count: 'exact', head: true }).eq('ip', ip).gt('created_at', hourAgo)
      if ((ipHour || 0) >= IP_HOURLY) return NextResponse.json({ error: 'Per daug pateikimų. Pabandyk vėliau.' }, { status: 429 })
      const { count: ipDay } = await sb.from('radar_submissions').select('id', { count: 'exact', head: true }).eq('ip', ip).gt('created_at', dayAgo)
      if ((ipDay || 0) >= IP_DAILY) return NextResponse.json({ error: 'Dienos limitas pasiektas. Pabandyk rytoj.' }, { status: 429 })
    }
    // 4) Email rate-limit
    const { count: emailDay } = await sb.from('radar_submissions').select('id', { count: 'exact', head: true }).eq('contact_email', contact_email).gt('created_at', dayAgo)
    if ((emailDay || 0) >= EMAIL_DAILY) return NextResponse.json({ error: 'Šiuo el. paštu jau pateikta. Susisieksime!' }, { status: 429 })
  } catch { /* jei count nepavyko — leidžiam praeiti, insert vis tiek pending */ }

  const submitter_user_id = sessionUserId

  const { error } = await sb.from('radar_submissions').insert({
    artist_name, contact_email, links: links || null, genre, city,
    bio: bio || null, message: message || null,
    submitter_user_id, ip, user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    status: 'pending',
  })
  if (error) return NextResponse.json({ error: 'Nepavyko išsaugoti. Pabandyk dar kartą.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
