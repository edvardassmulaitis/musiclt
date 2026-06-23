/**
 * CRON: /api/cron/refresh-home — paleidziamas 3x/dienoje (vercel.json) ir is naujo
 * apskaiciuoja homepage "Naujos dainos / Nauji albumai / Greitai pasirodys" duomenis
 * (sunki uzklausa) bei irasos gatava rezultata i home_snapshot lentele. Homepage'as
 * po to skaito TIK ta lentele (greita, niekada ne-timeout). Apsauga: ?key=... arba
 * Authorization: Bearer <CRON_SECRET> (Vercel Cron prideda automatiskai jei nustatytas).
 */
import { NextResponse } from 'next/server'
import { computeHomeSnapshot, writeHomeSnapshot } from '@/lib/home-snapshot'
import { revalidatePath, revalidateTag } from 'next/cache'
import { HOME_TAGS } from '@/lib/home-latest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_KEY = process.env.CRON_SECRET || 'hsnap_7f3a9c2e8b1d4f6a'

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')
  const auth = req.headers.get('authorization')
  if (key !== CRON_KEY && auth !== 'Bearer ' + CRON_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const payload = await computeHomeSnapshot()
    await writeHomeSnapshot(payload)
    try {
      revalidateTag(HOME_TAGS.tracks)
      revalidateTag(HOME_TAGS.albums)
      revalidatePath('/')
    } catch {}
    return NextResponse.json({
      ok: true,
      counts: {
        tracks: payload.tracks.lt.length + payload.tracks.world.length,
        albums: payload.albums.lt.length + payload.albums.world.length,
        upcoming: payload.upcoming.length,
      },
      updatedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'compute failed' }, { status: 500 })
  }
}
