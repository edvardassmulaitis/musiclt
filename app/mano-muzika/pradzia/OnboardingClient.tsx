'use client'
// app/mano-muzika/pradzia/OnboardingClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// Gamified naujo nario muzikos susidėjimo srautas. 4 žingsniai:
//   1) Stiliai  2) Atlikėjai  3) Nuotaikos daina  4) Finišas (šventė)
// Taškai + lygiai + progreso juosta. Picks saugomi inkrementiškai (optimistic).
// ───────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { proxyImg } from '@/lib/img-proxy'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'

type Style = { legacy_style_id: number; style_slug: string; style_name: string }
type Artist = { id: number; slug: string; name: string; cover_image_url: string | null }

type Props = { styles: Style[]; initialArtists: Artist[]; username: string | null }

async function api(path: string, method: string, body?: any) {
  try {
    await fetch(`/api/mano-muzika${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch { /* fire-and-forget; finišas vis tiek pereina */ }
}

const POINTS_PER_PICK = 10
const BADGES = [
  { min: 0, name: 'Naujokas', emoji: '🌱' },
  { min: 30, name: 'Klausytojas', emoji: '🎧' },
  { min: 60, name: 'Melomanas', emoji: '🎶' },
  { min: 100, name: 'Žinovas', emoji: '⭐' },
]
function badgeFor(pts: number) { let b = BADGES[0]; for (const x of BADGES) if (pts >= x.min) b = x; return b }

export default function OnboardingClient({ styles, initialArtists, username }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0) // 0 welcome, 1 styles, 2 artists, 3 mood, 4 finish
  const [pickedStyles, setPickedStyles] = useState<Style[]>([])
  const [pickedArtists, setPickedArtists] = useState<Artist[]>([])
  const [moodTrack, setMoodTrack] = useState<AttachmentHit | null>(null)
  const [artistPool, setArtistPool] = useState<Artist[]>(initialArtists)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pop, setPop] = useState(0) // taškų „+10" pop trigger

  const points = pickedStyles.length * POINTS_PER_PICK + pickedArtists.length * POINTS_PER_PICK + (moodTrack ? POINTS_PER_PICK : 0)
  const badge = badgeFor(points)

  const bump = useCallback(() => setPop(p => p + 1), [])

  function toggleStyle(s: Style) {
    const has = pickedStyles.some(x => x.legacy_style_id === s.legacy_style_id)
    if (has) { setPickedStyles(p => p.filter(x => x.legacy_style_id !== s.legacy_style_id)); api('/styles', 'DELETE', { legacy_style_id: s.legacy_style_id }) }
    else { setPickedStyles(p => [...p, s]); bump(); api('/styles', 'POST', s) }
  }
  function toggleArtist(a: Artist) {
    const has = pickedArtists.some(x => x.id === a.id)
    if (has) { setPickedArtists(p => p.filter(x => x.id !== a.id)); api('/favorites', 'DELETE', { kind: 'artist', entity_id: a.id }) }
    else { setPickedArtists(p => [...p, a]); bump(); api('/favorites', 'POST', { kind: 'artist', entity_id: a.id }) }
  }
  function setMood(hit: AttachmentHit) {
    setMoodTrack(hit); bump()
    api('/mood', 'POST', { track_id: hit.id, make_active: true })
  }
  async function loadMore() {
    setLoadingMore(true)
    try {
      const exclude = [...artistPool.map(a => a.id), ...pickedArtists.map(a => a.id)].join(',')
      const r = await fetch(`/api/mano-muzika/suggestions?exclude=${exclude}&limit=18`)
      const d = await r.json()
      if (d.artists?.length) setArtistPool(p => [...p, ...d.artists])
    } catch {} finally { setLoadingMore(false) }
  }
  async function finish() {
    setSaving(true)
    await api('/setup', 'POST', { action: 'complete' })
    router.push('/mano-muzika')
  }

  // progreso žingsniai (be welcome)
  const progressSteps = ['Stiliai', 'Atlikėjai', 'Nuotaika', 'Finišas']
  const progressIdx = Math.max(0, step - 1)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="mx-auto max-w-[720px] px-4 sm:px-6 py-6 sm:py-10">

        {/* TOP BAR: badge + points + progress */}
        {step > 0 && step < 4 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setStep(s => Math.max(0, s - 1))} className="text-[12.5px] font-bold" style={{ color: 'var(--text-muted)' }}>← Atgal</button>
              <PointsBadge points={points} badge={badge} popKey={pop} />
              <button onClick={() => { api('/setup', 'POST', { action: 'skip' }); router.push('/mano-muzika') }} className="text-[12.5px] font-bold" style={{ color: 'var(--text-faint)' }}>Praleisti</button>
            </div>
            <div className="flex gap-1.5">
              {progressSteps.map((_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full transition-colors"
                  style={{ background: i <= progressIdx ? 'var(--accent-orange)' : 'var(--bg-elevated)' }} />
              ))}
            </div>
          </div>
        )}

        {/* STEP 0 — WELCOME */}
        {step === 0 && (
          <div className="text-center pt-8 sm:pt-16">
            <div className="text-6xl mb-5 animate-bounce">🎧</div>
            <h1 className="font-black tracking-tight text-[clamp(1.8rem,1.2rem+2.4vw,2.6rem)] leading-tight">
              Susidėk savo muziką
            </h1>
            <p className="mx-auto mt-3 max-w-[440px] text-[14px]" style={{ color: 'var(--text-muted)' }}>
              Per minutę pasirink mėgstamus stilius ir atlikėjus. Mes pasiūlysim daugiau, o tavo profilis atgis.
              Už kiekvieną pasirinkimą — taškai 🏆
            </p>
            <button onClick={() => setStep(1)}
              className="mt-7 rounded-full px-8 py-3.5 text-[15px] font-black text-white transition-transform hover:scale-[1.04]"
              style={{ background: 'var(--accent-orange)' }}>
              Pradėti žaidimą →
            </button>
            <div className="mt-4 text-[12px]" style={{ color: 'var(--text-faint)' }}>~ 1 minutė · gali praleisti bet kada</div>
          </div>
        )}

        {/* STEP 1 — STYLES */}
        {step === 1 && (
          <div>
            <StepHead emoji="🎚️" title="Kokia muzika tave traukia?" sub="Pasirink bent porą stilių — jie formuos tavo „muzikos identitetą"." />
            <div className="flex flex-wrap gap-2.5">
              {styles.map(s => {
                const on = pickedStyles.some(x => x.legacy_style_id === s.legacy_style_id)
                return (
                  <button key={s.legacy_style_id} onClick={() => toggleStyle(s)}
                    className="rounded-full px-4 py-2.5 text-[13.5px] font-bold transition-all"
                    style={{
                      background: on ? 'var(--accent-orange)' : 'var(--bg-elevated)',
                      color: on ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${on ? 'transparent' : 'var(--border-default)'}`,
                      transform: on ? 'scale(1.03)' : 'none',
                    }}>
                    {on ? '✓ ' : ''}{s.style_name}
                  </button>
                )
              })}
            </div>
            <NextBar disabled={pickedStyles.length === 0} label={pickedStyles.length === 0 ? 'Pasirink bent vieną' : `Toliau (${pickedStyles.length})`} onNext={() => setStep(2)} />
          </div>
        )}

        {/* STEP 2 — ARTISTS */}
        {step === 2 && (
          <div>
            <StepHead emoji="👤" title="Kuriuos atlikėjus mėgsti?" sub="Bakstelėk tuos, kurie tau patinka. Kuo daugiau — tuo geresnės rekomendacijos." />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {artistPool.map(a => {
                const on = pickedArtists.some(x => x.id === a.id)
                return (
                  <button key={a.id} onClick={() => toggleArtist(a)} className="group relative text-center">
                    <div className="relative aspect-square overflow-hidden rounded-2xl transition-all"
                      style={{ outline: on ? '3px solid var(--accent-orange)' : '1px solid var(--border-default)', outlineOffset: on ? '0' : '0' }}>
                      {a.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg(a.cover_image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      ) : <div className="flex h-full w-full items-center justify-center text-2xl" style={{ background: 'var(--bg-elevated)' }}>👤</div>}
                      {on && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.32)' }}>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-black text-white" style={{ background: 'var(--accent-orange)' }}>✓</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 truncate text-[11.5px] font-bold px-0.5">{a.name}</div>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 text-center">
              <button onClick={loadMore} disabled={loadingMore}
                className="rounded-full px-5 py-2 text-[12.5px] font-bold disabled:opacity-50"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                {loadingMore ? 'Kraunama…' : '↻ Rodyti daugiau'}
              </button>
            </div>
            <NextBar disabled={pickedArtists.length === 0} label={pickedArtists.length === 0 ? 'Pasirink bent vieną' : `Toliau (${pickedArtists.length})`} onNext={() => setStep(3)} />
          </div>
        )}

        {/* STEP 3 — MOOD */}
        {step === 3 && (
          <div>
            <StepHead emoji="🌙" title="Tavo nuotaikos daina?" sub="Viena daina, kuri rodoma profilio viršuje. Gali praleisti ir pridėti vėliau." />
            <div className="max-w-[480px]">
              <MusicSearchPicker attached={moodTrack ? [moodTrack] : []} onAdd={setMood} typeFilter="daina" placeholder="Surask dainą..." />
            </div>
            {moodTrack && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl p-3 max-w-[480px]"
                style={{ background: 'linear-gradient(90deg, rgba(167,139,250,0.14), transparent)', border: '1px solid rgba(167,139,250,0.4)' }}>
                <div className="h-12 w-12 overflow-hidden rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  {moodTrack.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(moodTrack.image_url)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : <div className="flex h-full w-full items-center justify-center">🎵</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-black">{moodTrack.title}</div>
                  <div className="text-[11.5px]" style={{ color: '#a78bfa' }}>🌙 Tavo nuotaikos daina</div>
                </div>
                <button onClick={() => { api('/mood', 'DELETE', { track_id: moodTrack.id }); setMoodTrack(null) }} className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>Keisti</button>
              </div>
            )}
            <NextBar disabled={false} label={moodTrack ? 'Baigti →' : 'Praleisti ir baigti →'} onNext={() => setStep(4)} />
          </div>
        )}

        {/* STEP 4 — FINISH */}
        {step === 4 && (
          <div className="text-center pt-6 sm:pt-12 relative">
            <Confetti />
            <div className="text-6xl mb-4">{badge.emoji}</div>
            <h1 className="font-black tracking-tight text-[clamp(1.7rem,1.2rem+2vw,2.4rem)]">Puiki pradžia!</h1>
            <p className="mx-auto mt-2 max-w-[420px] text-[14px]" style={{ color: 'var(--text-muted)' }}>
              Surinkai <span className="font-black" style={{ color: 'var(--accent-orange)' }}>{points} taškų</span> ir tapai <span className="font-bold">{badge.name}</span>.
            </p>
            <div className="mx-auto mt-5 flex max-w-[360px] justify-center gap-3">
              <Stat n={pickedStyles.length} label="stiliai" />
              <Stat n={pickedArtists.length} label="atlikėjai" />
              <Stat n={moodTrack ? 1 : 0} label="nuotaika" />
            </div>
            <div className="mt-7 flex flex-col items-center gap-2.5">
              <button onClick={finish} disabled={saving}
                className="rounded-full px-8 py-3.5 text-[15px] font-black text-white transition-transform hover:scale-[1.04] disabled:opacity-60"
                style={{ background: 'var(--accent-orange)' }}>
                {saving ? 'Įrašoma…' : 'Eiti į Mano muziką →'}
              </button>
              {username && (
                <button onClick={() => router.push(`/vartotojas/${username}`)} className="text-[12.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  Peržiūrėti profilį
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepHead({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div className="mb-5">
      <div className="text-3xl mb-2">{emoji}</div>
      <h2 className="font-black tracking-tight text-[clamp(1.3rem,1rem+1.4vw,1.7rem)] leading-tight">{title}</h2>
      <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  )
}

function NextBar({ disabled, label, onNext }: { disabled: boolean; label: string; onNext: () => void }) {
  return (
    <div className="mt-7 flex justify-end">
      <button onClick={onNext} disabled={disabled}
        className="rounded-full px-7 py-3 text-[14px] font-black text-white transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
        style={{ background: 'var(--accent-orange)' }}>
        {label}
      </button>
    </div>
  )
}

function PointsBadge({ points, badge, popKey }: { points: number; badge: { name: string; emoji: string }; popKey: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
      <span className="text-[14px]">{badge.emoji}</span>
      <span key={popKey} className="text-[13px] font-black tabular-nums" style={{ color: 'var(--accent-orange)', animation: 'mzpop 0.4s ease' }}>{points}</span>
      <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>tšk</span>
      <style jsx>{`@keyframes mzpop { 0% { transform: scale(1) } 40% { transform: scale(1.5) } 100% { transform: scale(1) } }`}</style>
    </div>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex-1 rounded-xl py-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <div className="text-[22px] font-black" style={{ color: 'var(--accent-orange)' }}>{n}</div>
      <div className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 28 })
  const colors = ['#f97316', '#a78bfa', '#34d399', '#60a5fa', '#f43f5e', '#fbbf24']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => (
        <span key={i} className="absolute block" style={{
          left: `${(i * 37) % 100}%`, top: '-10%',
          width: 8, height: 8, background: colors[i % colors.length], borderRadius: i % 2 ? '50%' : '2px',
          animation: `mzfall ${1.8 + (i % 5) * 0.3}s ${(i % 7) * 0.12}s linear infinite`,
        }} />
      ))}
      <style jsx>{`@keyframes mzfall { 0% { transform: translateY(0) rotate(0); opacity: 1 } 100% { transform: translateY(120vh) rotate(540deg); opacity: 0.9 } }`}</style>
    </div>
  )
}
