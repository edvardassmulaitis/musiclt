'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'
import WikipediaImport from '@/components/WikipediaImport'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'

const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000001,
  'Elektroninė, šokių muzika': 1000002,
  "Hip-hop'o muzika": 1000003,
  'Kitų stilių muzika': 1000004,
  'Pop, R&B muzika': 1000005,
  'Rimtoji muzika': 1000006,
  'Roko muzika': 1000007,
  'Sunkioji muzika': 1000008,
}

function formToDb(form: ArtistFormData) {
  const genreIds: number[] = []
  if (form.genre && GENRE_IDS[form.genre]) genreIds.push(GENRE_IDS[form.genre])
  const birthDate = form.birthYear
    ? `${form.birthYear}-${String(form.birthMonth || 1).padStart(2, '0')}-${String(form.birthDay || 1).padStart(2, '0')}`
    : null
  const deathDate = form.deathYear
    ? `${form.deathYear}-${String(form.deathMonth || 1).padStart(2, '0')}-${String(form.deathDay || 1).padStart(2, '0')}`
    : null
  return {
    name:            form.name,
    type:            form.type,
    country:         form.country,
    type_music:      true,
    type_film:       false,
    type_dance:      false,
    type_books:      false,
    active_from:     form.yearStart ? parseInt(form.yearStart) : null,
    active_until:    form.yearEnd   ? parseInt(form.yearEnd)   : null,
    description:     form.description,
    cover_image_url: form.avatar,
    website:         form.website,
    subdomain:       form.subdomain,
    gender:          form.gender,
    birth_date:      birthDate,
    death_date:      deathDate,
    genres:          genreIds,
    substyleNames:   form.substyles || [],
    breaks:          form.breaks,
    photos:          form.photos,
    links: {
      facebook:   form.facebook,
      instagram:  form.instagram,
      youtube:    form.youtube,
      tiktok:     form.tiktok,
      spotify:    form.spotify,
      soundcloud: form.soundcloud,
      bandcamp:   form.bandcamp,
      twitter:    form.twitter,
    },
    related: [
      ...(form.members || []).map(m => ({ id: typeof m.id === 'string' ? parseInt(m.id) : Number(m.id), yearFrom: m.yearFrom, yearTo: m.yearTo })),
      ...(form.groups  || []).map(g => ({ id: typeof g.id === 'string' ? parseInt(g.id) : Number(g.id), yearFrom: g.yearFrom, yearTo: g.yearTo })),
    ],
  }
}

// ── Step indicators ──────────────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Wikipedia' },
    { n: 2, label: 'Informacija' },
    { n: 3, label: 'Diskografija' },
  ]
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            current === s.n
              ? 'bg-blue-600 text-white shadow-sm'
              : current > s.n
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-400'
          }`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              current > s.n ? 'bg-green-500 text-white' : current === s.n ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-400'
            }`}>
              {current > s.n ? '✓' : s.n}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px mx-1 ${current > s.n ? 'bg-green-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Wikipedia search / URL ──────────────────────────────────────────
function Step1Wiki({ onFound, onSkip }: {
  onFound: (wikiUrl: string, wikiTitle: string) => void
  onSkip: () => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<{ title: string; url: string; description?: string }[]>([])
  const [manualUrl, setManualUrl] = useState('')
  const [mode, setMode] = useState<'search' | 'manual'>('search')

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const res = await fetch(
        `https://lt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&format=json&origin=*`
      )
      const data = await res.json()
      const hits = (data.query?.search || []).map((r: any) => ({
        title: r.title,
        url: `https://lt.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
        description: r.snippet?.replace(/<[^>]+>/g, '').slice(0, 100),
      }))

      // If nothing in lt.wikipedia, try en.wikipedia
      if (hits.length === 0) {
        const res2 = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' musician')}&srlimit=6&format=json&origin=*`
        )
        const data2 = await res2.json()
        const hits2 = (data2.query?.search || []).map((r: any) => ({
          title: r.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
          description: r.snippet?.replace(/<[^>]+>/g, '').slice(0, 100),
        }))
        setResults(hits2)
      } else {
        setResults(hits)
      }
    } catch {}
    setSearching(false)
  }

  const useManual = () => {
    const url = manualUrl.trim()
    if (!url.includes('wikipedia.org/wiki/')) return
    const title = decodeURIComponent(url.split('/wiki/')[1]?.replace(/_/g, ' ') || '')
    onFound(url, title)
  }

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-lg font-bold text-gray-800 mb-1">Ieškoti Wikipedia</h2>
      <p className="text-sm text-gray-500 mb-5">Importuosime pagrindinę informaciją automatiškai. Jei nėra Wikipedia — galima praleisti.</p>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl w-fit">
        <button type="button" onClick={() => setMode('search')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'search' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          🔍 Paieška
        </button>
        <button type="button" onClick={() => setMode('manual')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          🔗 URL
        </button>
      </div>

      {mode === 'search' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Pvz: Skamp, Serebro, Rammstein..."
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-400 bg-white"
              autoFocus
            />
            <button type="button" onClick={search} disabled={searching || !query.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
              {searching ? '...' : 'Ieškoti'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
              {results.map((r, i) => (
                <button key={i} type="button" onClick={() => onFound(r.url, r.title)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                  <div className="flex items-start gap-3">
                    <span className="text-base mt-0.5">📖</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{r.title}</div>
                      {r.description && <div className="text-xs text-gray-400 truncate mt-0.5">{r.description}...</div>}
                      <div className="text-[10px] text-blue-400 mt-0.5 truncate">{r.url}</div>
                    </div>
                    <span className="text-gray-300 text-sm ml-auto shrink-0">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.length === 0 && query && !searching && (
            <div className="text-center py-4 text-sm text-gray-400">
              Nieko nerasta. Bandykite anglų kalba arba įveskite URL tiesiogiai.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && useManual()}
              placeholder="https://lt.wikipedia.org/wiki/..."
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-400 bg-white"
              autoFocus
            />
            <button type="button" onClick={useManual} disabled={!manualUrl.includes('wikipedia.org/wiki/')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
              Naudoti
            </button>
          </div>
          <p className="text-xs text-gray-400">Palaikoma: lt.wikipedia.org ir en.wikipedia.org</p>
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-100">
        <button type="button" onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ↓ Praleisti — pildyti formą rankiniu būdu
        </button>
      </div>
    </div>
  )
}

// ── WikipediaImportPrefilled — renders WikipediaImport with URL pre-filled ───
// WikipediaImport manages its own URL state internally, so we render it
// with a visible pre-fill hint and let the user click "→ Importuoti" themselves,
// OR we overlay an auto-trigger by mounting a hidden input + simulating click.
// Simplest correct approach: just show the component and pre-fill via DOM ref.
function WikipediaImportPrefilled({ initialUrl, onImport }: {
  initialUrl: string
  onImport: (data: Partial<ArtistFormData>) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // After mount, find the URL input inside WikipediaImport and pre-fill + trigger
  useEffect(() => {
    if (!containerRef.current || !initialUrl) return
    const t = setTimeout(() => {
      const input = containerRef.current?.querySelector('input[type="url"]') as HTMLInputElement | null
      if (!input) return
      // Set value via React's synthetic event system
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(input, initialUrl)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      // Small delay then click the import button
      setTimeout(() => {
        const btn = containerRef.current?.querySelector('button[type="button"]') as HTMLButtonElement | null
        btn?.click()
      }, 100)
    }, 200)
    return () => clearTimeout(t)
  }, [initialUrl])

  return (
    <div ref={containerRef}>
      <WikipediaImport onImport={onImport} />
    </div>
  )
}

// ── Step 2: Info form with wiki import ──────────────────────────────────────
function Step2Info({ wikiUrl, wikiTitle, onCreated, onBack }: {
  wikiUrl: string | null
  wikiTitle: string | null
  onCreated: (artistId: string, artistName: string, slug: string, isSolo: boolean) => void
  onBack: () => void
}) {
  const [form, setForm] = useState<ArtistFormData>({ ...emptyArtistForm })
  // formKey forces ArtistForm to fully remount when wiki data arrives
  // so ALL fields (country, genre, yearStart, avatar, etc.) get applied
  const [formKey, setFormKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleImport = (data: Partial<ArtistFormData>) => {
    const merged = { ...emptyArtistForm, ...data }
    setForm(merged)
    // Force remount so ArtistForm initialData picks up ALL fields fresh
    setFormKey(k => k + 1)
  }

  const handleSubmit = async (formData: ArtistFormData) => {
    if (!formData.name.trim()) { setError('Pavadinimas privalomas'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(formData)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klaida')
      onCreated(String(data.id), formData.name, data.slug || '', formData.type === 'solo')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {wikiUrl && (
        <div className="mb-6">
          <WikipediaImportPrefilled
            initialUrl={wikiUrl}
            onImport={handleImport}
          />
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          ❌ {error}
        </div>
      )}

      {/* key= forces full remount when wiki data arrives — all fields apply */}
      <ArtistForm
        key={formKey}
        title=""
        submitLabel={saving ? 'Kuriama...' : 'Sukurti ir tęsti →'}
        backHref="/admin/artists"
        initialData={form}
        onChange={setForm}
        onSubmit={handleSubmit}
      />

      <div className="mt-4">
        <button type="button" onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600">← Atgal</button>
      </div>
    </div>
  )
}

// ── Step 3: Discography ──────────────────────────────────────────────────────
function Step3Discography({ artistId, artistName, wikiTitle, isSolo, onFinish }: {
  artistId: string
  artistName: string
  wikiTitle: string | null
  isSolo: boolean
  onFinish: () => void
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800">Diskografija</h2>
        <p className="text-sm text-gray-500">Importuokite albumus ir dainas iš Wikipedia arba praleiskite.</p>
      </div>

      {wikiTitle ? (
        <WikipediaImportDiscography
          artistId={parseInt(artistId)}
          artistName={artistName}
          artistWikiTitle={wikiTitle}
          isSolo={isSolo}
        />
      ) : (
        <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-400 text-sm">Nėra Wikipedia — diskografija gali būti pridėta vėliau atlikėjo puslapyje.</p>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <button type="button" onClick={onFinish}
          className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl hover:opacity-90 shadow-md text-sm">
          ✓ Baigti ir eiti į atlikėjo puslapį →
        </button>
        <button type="button" onClick={onFinish}
          className="px-6 py-3.5 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50 transition-colors">
          Praleisti
        </button>
      </div>
    </div>
  )
}

// ── Main wizard ──────────────────────────────────────────────────────────────
export default function NewArtistWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [wikiUrl, setWikiUrl]     = useState<string | null>(null)
  const [wikiTitle, setWikiTitle] = useState<string | null>(null)
  const [artistId, setArtistId]   = useState<string | null>(null)
  const [artistName, setArtistName] = useState('')
  const [artistSlug, setArtistSlug] = useState('')
  const [isSolo, setIsSolo]       = useState(false)

  const handleWikiFound = (url: string, title: string) => {
    setWikiUrl(url)
    setWikiTitle(title)
    setStep(2)
  }

  const handleSkipWiki = () => {
    setWikiUrl(null)
    setWikiTitle(null)
    setStep(2)
  }

  const handleCreated = (id: string, name: string, slug: string, solo: boolean) => {
    setArtistId(id)
    setArtistName(name)
    setArtistSlug(slug)
    setIsSolo(solo)
    setStep(3)
  }

  const handleFinish = () => {
    if (artistId) router.push(`/admin/artists/${artistId}`)
    else router.push('/admin/artists')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin/artists" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2">
              ← Admin / Atlikėjai
            </Link>
            <h1 className="text-2xl font-black text-gray-900">🎤 Naujas atlikėjas</h1>
          </div>
          {artistId && step === 3 && (
            <a href={`/atlikejai/${artistSlug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              👁 Peržiūrėti ↗
            </a>
          )}
        </div>

        <Steps current={step} />

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {step === 1 && (
            <Step1Wiki onFound={handleWikiFound} onSkip={handleSkipWiki} />
          )}
          {step === 2 && (
            <Step2Info
              wikiUrl={wikiUrl}
              wikiTitle={wikiTitle}
              onCreated={handleCreated}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && artistId && (
            <Step3Discography
              artistId={artistId}
              artistName={artistName}
              wikiTitle={wikiTitle}
              isSolo={isSolo}
              onFinish={handleFinish}
            />
          )}
        </div>
      </div>
    </div>
  )
}
