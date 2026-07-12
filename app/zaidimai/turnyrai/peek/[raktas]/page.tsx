// app/zaidimai/turnyrai/peek/[raktas]/page.tsx
//
// TURNYRŲ BRACKET'AI — laikinas nevieša peržiūra.
//
// Kol dainų „playoffs" dar neišleisti, medį galima pamatyti tik per nespėjamą
// URL: /zaidimai/turnyrai/peek/<TOURNAMENT_PEEK_KEY>
// Be teisingo rakto — 404 (ne 403, kad puslapio egzistavimas neišsiduotų).
// Puslapis noindex, be nuorodų iš niekur, ne sitemap'e.
//
// Kai turnyrai bus paruošti viešinimui — šitą katalogą galima ištrinti, o
// atvaizdavimą perkelti į /zaidimai/turnyrai.

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { scopeOfDay, roundsCount } from '@/lib/tournament'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Turnyrų peržiūra',
  robots: { index: false, follow: false, nocache: true },
}

type Track = { id: number; title: string; artists: { name: string } | null }
type Match = {
  id: number; tournament_id: number; round: number; slot: number
  winner_track_id: number | null; decided_by: 'seed' | 'vote' | null
  published_at: string | null
  track_a: Track | null; track_b: Track | null
}

async function loadTournaments() {
  const sb = createAdminClient()

  const { data: tournaments, error: te } = await sb
    .from('boombox_tournaments')
    .select('id,title,scope,size,status,vote_from_round,current_round,champion_track_id,sort_order')
    .order('scope', { ascending: true })
    .order('sort_order', { ascending: true })
  if (te) throw te
  if (!tournaments?.length) return { tournaments: [], matches: [] as Match[] }

  const { data: matches, error: me } = await sb
    .from('boombox_tournament_matches')
    .select(`
      id, tournament_id, round, slot, winner_track_id, decided_by, published_at,
      track_a:track_a_id ( id, title, artists:artist_id ( name ) ),
      track_b:track_b_id ( id, title, artists:artist_id ( name ) )
    `)
    .in('tournament_id', tournaments.map(t => t.id))
    .order('round', { ascending: true })
    .order('slot', { ascending: true })
  if (me) throw me

  return { tournaments, matches: (matches ?? []) as unknown as Match[] }
}

function Side({ track, isWinner, decided }: { track: Track | null; isWinner: boolean; decided: boolean }) {
  if (!track) {
    return <div className="px-2 py-1 text-xs text-neutral-500 italic">— laukia —</div>
  }
  return (
    <div
      className={[
        'px-2 py-1 text-xs leading-tight',
        decided && isWinner ? 'font-semibold text-white' : '',
        decided && !isWinner ? 'text-neutral-500 line-through decoration-neutral-700' : '',
        !decided ? 'text-neutral-300' : '',
      ].join(' ')}
    >
      <span className="text-neutral-400">{track.artists?.name ?? '?'}</span>
      {' — '}
      {track.title}
    </div>
  )
}

function Bracket({ t, matches }: { t: any; matches: Match[] }) {
  const total = roundsCount(t.size)
  const rounds = Array.from({ length: total }, (_, i) => i + 1)
  const roundName = (r: number) => {
    const left = t.size / Math.pow(2, r - 1)
    if (left === 2) return 'Finalas'
    if (left === 4) return 'Pusfinaliai'
    if (left === 8) return 'Ketvirtfinaliai'
    return `1/${left / 2} (${left} dalyviai)`
  }

  return (
    <section className="mb-10 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-white">
          {t.scope === 'lt' ? '🇱🇹' : '🌍'} {t.title}
        </h2>
        <span className="text-xs text-neutral-500">
          {t.size} dainų · balsavimas nuo rato {t.vote_from_round} ·{' '}
          <span
            className={
              t.status === 'active' ? 'text-emerald-400'
                : t.status === 'done' ? 'text-neutral-400' : 'text-amber-400'
            }
          >
            {t.status === 'active' ? 'aktyvus' : t.status === 'done' ? 'baigtas' : 'eilėje'}
          </span>
        </span>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map(r => {
          const rm = matches.filter(m => m.round === r)
          const isVoteRound = r >= t.vote_from_round
          return (
            <div key={r} className="min-w-[220px] flex-1">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {roundName(r)}
                </h3>
                <span
                  className={[
                    'rounded px-1.5 py-0.5 text-[10px]',
                    isVoteRound ? 'bg-violet-500/15 text-violet-300' : 'bg-neutral-800 text-neutral-500',
                  ].join(' ')}
                  title={isVoteRound ? 'Sprendžia bendruomenės balsavimas' : 'Išsprendžiama automatiškai pagal peržiūras'}
                >
                  {isVoteRound ? 'balsavimas' : 'auto'}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {rm.map(m => {
                  const decided = m.winner_track_id != null
                  return (
                    <div
                      key={m.id}
                      className={[
                        'rounded border bg-neutral-950/60',
                        m.published_at && !decided
                          ? 'border-violet-500/60 ring-1 ring-violet-500/30'  // šiandienos gyvas matas
                          : 'border-neutral-800',
                      ].join(' ')}
                    >
                      <Side track={m.track_a} isWinner={m.winner_track_id === m.track_a?.id} decided={decided} />
                      <div className="border-t border-neutral-800/70" />
                      <Side track={m.track_b} isWinner={m.winner_track_id === m.track_b?.id} decided={decided} />
                      {m.decided_by === 'vote' && (
                        <div className="border-t border-neutral-800/70 px-2 py-0.5 text-[10px] text-violet-400">
                          nulėmė balsavimas
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default async function TurnyraiPeekPage({
  params,
}: {
  params: Promise<{ raktas: string }>
}) {
  const key = process.env.TOURNAMENT_PEEK_KEY
  const { raktas } = await params

  // Rakto nėra sukonfigūruoto arba nesutampa → puslapio tarsi nėra.
  if (!key || raktas !== key) notFound()

  const { tournaments, matches } = await loadTournaments()
  const todayScope = scopeOfDay()

  const lt = tournaments.filter(t => t.scope === 'lt')
  const world = tournaments.filter(t => t.scope === 'world')

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Turnyrų bracket'ai</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Nevieša peržiūra. Šiandien dienos dvikova ateina iš{' '}
          <strong className="text-white">
            {todayScope === 'lt' ? '🇱🇹 lietuviškos' : '🌍 pasaulio'}
          </strong>{' '}
          eilės — rytoj iš kitos.
        </p>
        {tournaments.length === 0 && (
          <p className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Turnyrų dar nėra — paleisk <code>npx tsx scripts/seed-tournaments.ts</code>
          </p>
        )}
      </div>

      {lt.length > 0 && (
        <>
          <h2 className="mb-3 border-b border-neutral-800 pb-1 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Lietuviška eilė ({lt.length})
          </h2>
          {lt.map(t => (
            <Bracket key={t.id} t={t} matches={matches.filter(m => m.tournament_id === t.id)} />
          ))}
        </>
      )}

      {world.length > 0 && (
        <>
          <h2 className="mb-3 border-b border-neutral-800 pb-1 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Pasaulio eilė ({world.length})
          </h2>
          {world.map(t => (
            <Bracket key={t.id} t={t} matches={matches.filter(m => m.tournament_id === t.id)} />
          ))}
        </>
      )}
    </main>
  )
}
