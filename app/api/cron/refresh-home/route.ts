/**
 * CRON: /api/cron/refresh-home — paleidziamas 3x/dienoje (vercel.json) ir is naujo
 * apskaiciuoja homepage "Naujos dainos / Nauji albumai / Greitai pasirodys" duomenis
 * (sunki uzklausa) bei irasos gatava rezultata i home_snapshot lentele. Homepage'as
 * po to skaito TIK ta lentele (greita, niekada ne-timeout).
 *
 * Apsauga: priimam (a) Vercel Cron: Authorization: Bearer <CRON_SECRET>, ARBA
 * (b) rankini trigger su ?key=<CRON_SECRET arba FALLBACK_KEY>.
 */
import { NextResponse, after } from 'next/server'
import { computeHomeSnapshot, writeHomeSnapshot } from '@/lib/home-snapshot'
import { revalidatePath, revalidateTag } from 'next/cache'
import { HOME_TAGS, warmHomeList } from '@/lib/home-latest'
import { authorizeCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  // Tik env CRON_SECRET (Bearer arba ?key=). Pašalintas hardcoded FALLBACK_KEY,
  // kuris veikė kaip nerotuojamas backdoor.
  if (!authorizeCron(req, { allowQueryKey: true })) {
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
    // „Daugiau" modalo cache'ą warm'inam PER after() — t.y. PO to, kai
    // revalidateTag purge'as jau pritaikytas (request pabaigoje). Antraip warm'as
    // įvyktų PRIEŠ purge'ą ir purge'as iškart nušluotų ką tik šiltą cache'ą
    // (race) → pirmas modalo atidarymas vėl būtų 5s cold. after() warm'as
    // išgyvena, todėl modalas VISADA instant. Best-effort.
    try { after(async () => { try { await warmHomeList() } catch {} }) } catch {}
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
