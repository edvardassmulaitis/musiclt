/**
 * CRON: /api/cron/refresh-home — paleidziamas 3x/dienoje (vercel.json) ir is naujo
 * apskaiciuoja homepage "Naujos dainos / Nauji albumai / Greitai pasirodys" duomenis
 * (sunki uzklausa) bei irasos gatava rezultata i home_snapshot lentele. Homepage'as
 * po to skaito TIK ta lentele (greita, niekada ne-timeout).
 *
 * Apsauga: priimam (a) Vercel Cron: Authorization: Bearer <CRON_SECRET>, ARBA
 * (b) rankini trigger su ?key=<CRON_SECRET arba FALLBACK_KEY>.
 */
import { NextResponse } from 'next/server'
import { computeHomeSnapshot, writeHomeSnapshot } from '@/lib/home-snapshot'
import { revalidatePath, revalidateTag } from 'next/cache'
import { HOME_TAGS, warmHomeList } from '@/lib/home-latest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FALLBACK_KEY = 'hsnap_7f3a9c2e8b1d4f6a'

function authorized(req: Request): boolean {
  const key = new URL(req.url).searchParams.get('key')
  const auth = req.headers.get('authorization')
  const keys = [process.env.CRON_SECRET, FALLBACK_KEY].filter(Boolean) as string[]
  return keys.some(k => key === k || auth === 'Bearer ' + k)
}

export async function GET(req: Request) {
  if (!authorized(req)) {
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
    // „Daugiau" modalo cache'ą warm'inam IŠKART po invalidacijos — kad pirmas
    // modalo atidarymas būtų instant (be 8s cold compute). Best-effort.
    try { await warmHomeList() } catch {}
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
