// app/perkelti/page.tsx
// Vieša landing — kaip perkelti mėgstamą muziką į music.lt (Last.fm/Spotify/YouTube).
import Link from 'next/link'

export const metadata = {
  title: 'Perkelk savo muziką į music.lt — iš Spotify, Last.fm ir YouTube',
  description: 'Atsinešk mėgstamus atlikėjus ir dainas iš Spotify, Last.fm ar YouTube į savo music.lt kolekciją per kelias minutes.',
  alternates: { canonical: '/perkelti' },
}

type Step = { n: number; text: string }
const METHODS: { id: string; emoji: string; title: string; tagline: string; time: string; steps: Step[]; cta: string; src: string; accent: string }[] = [
  {
    id: 'lastfm', emoji: '🎧', title: 'Last.fm', tagline: 'Greičiausias būdas — vos vartotojo vardas.', time: '~30 sek.',
    accent: '#d51007',
    steps: [
      { n: 1, text: 'Įsitikink, kad tavo Last.fm profilis viešas.' },
      { n: 2, text: 'Įvesk savo Last.fm vartotojo vardą (rasi adrese last.fm/user/VARDAS).' },
      { n: 3, text: 'Peržiūrėk atitiktis ir įdėk pasirinktus atlikėjus bei dainas.' },
    ],
    cta: 'Perkelti iš Last.fm',
  },
  {
    id: 'spotify', emoji: '🟢', title: 'Spotify', tagline: 'Pilniausi duomenys — per oficialų duomenų eksportą.', time: '~1 para',
    accent: '#1DB954',
    steps: [
      { n: 1, text: 'Spotify → Account → Privacy settings → „Download your data" → pažymėk Account data.' },
      { n: 2, text: 'Palauk el. laiško (dažniausiai iki paros) ir parsisiųsk ZIP.' },
      { n: 3, text: 'Įkelk iš jo failą YourLibrary.json — perkelsim išsaugotus atlikėjus, dainas ir albumus.' },
    ],
    cta: 'Įkelti Spotify failą',
  },
  {
    id: 'youtube', emoji: '▶️', title: 'YouTube', tagline: 'Iš viešo playlisto — pagal video pavadinimus.', time: '~1 min.',
    accent: '#FF0000',
    steps: [
      { n: 1, text: 'Pasirink viešą (ar „unlisted") YouTube playlistą su muzika.' },
      { n: 2, text: 'Nukopijuok jo nuorodą (youtube.com/playlist?list=...).' },
      { n: 3, text: 'Įklijuok — iš pavadinimų atpažinsim atlikėją ir dainą.' },
    ],
    cta: 'Perkelti iš YouTube',
  },
]

export default function PerkeltiLanding() {
  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      {/* HERO */}
      <div className="rounded-3xl p-7 sm:p-10 mb-8 text-center" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(167,139,250,0.13))', border: '1px solid var(--border-default)' }}>
        <div className="text-4xl mb-3">📥</div>
        <h1 className="font-black tracking-tight text-[clamp(1.8rem,1.2rem+2.2vw,2.6rem)] leading-tight">Atsinešk savo muziką į music.lt</h1>
        <p className="mx-auto mt-3 max-w-[560px] text-[14.5px]" style={{ color: 'var(--text-secondary)' }}>
          Jau turi mėgstamų atlikėjų ir dainų kitur? Perkelk juos iš Spotify, Last.fm ar YouTube į savo music.lt kolekciją.
          Sumesim su music.lt baze, o tu pasirinksi, ką įdėti.
        </p>
        <Link href="/mano-muzika/importas" className="inline-block mt-6 rounded-full px-8 py-3.5 text-[15px] font-black text-white transition-transform hover:scale-[1.04]" style={{ background: 'var(--accent-orange)' }}>
          Pradėti perkėlimą →
        </Link>
      </div>

      {/* METHODS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {METHODS.map(m => (
          <div key={m.id} id={m.id} className="flex flex-col rounded-2xl p-5 scroll-mt-24" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-3 mb-1">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[20px]" style={{ background: `${m.accent}1f` }}>{m.emoji}</span>
              <div>
                <div className="text-[16px] font-black leading-none">{m.title}</div>
                <div className="text-[11px] font-bold mt-1" style={{ color: 'var(--text-faint)' }}>{m.time}</div>
              </div>
            </div>
            <p className="text-[12.5px] mb-3 mt-1.5" style={{ color: 'var(--text-muted)' }}>{m.tagline}</p>
            <ol className="flex flex-col gap-2.5 flex-1">
              {m.steps.map(s => (
                <li key={s.n} className="flex gap-2.5">
                  <span className="shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black" style={{ background: 'var(--bg-elevated)', color: m.accent }}>{s.n}</span>
                  <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{s.text}</span>
                </li>
              ))}
            </ol>
            <Link href={`/mano-muzika/importas?src=${m.id}`} className="mt-4 text-center rounded-full px-4 py-2.5 text-[12.5px] font-black text-white transition-opacity hover:opacity-90" style={{ background: 'var(--accent-orange)' }}>
              {m.cta} →
            </Link>
          </div>
        ))}
      </div>

      {/* HOW MATCHING WORKS */}
      <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <h2 className="text-[16px] font-black mb-2">Kaip vyksta sumešimas?</h2>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Iš kiekvieno šaltinio paimame atlikėjų ir dainų pavadinimus ir surandame juos music.lt bazėje — diakritikai ir „feat." nepainioja.
          Tau parodome atitiktis (galimai netiksliąsias pažymime ≈), o neatpažintus įrašus tiesiog praleidžiame. Niekas nepridedama be tavo patvirtinimo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          <span className="rounded-full px-3 py-1" style={{ background: 'var(--bg-elevated)' }}>🔒 Duomenys nesaugomi tarpiniame serveryje</span>
          <span className="rounded-full px-3 py-1" style={{ background: 'var(--bg-elevated)' }}>✋ Tu renkiesi, ką įdėti</span>
          <span className="rounded-full px-3 py-1" style={{ background: 'var(--bg-elevated)' }}>♻️ Galima kartoti bet kada</span>
        </div>
      </div>
    </div>
  )
}
