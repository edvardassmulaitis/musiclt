'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import FullEnrichButton from '@/components/FullEnrichButton'

// Tipai dubliuoti iš lib/artist-import.ts (client'e nenorim importuoti server lib).
interface MatchCandidate { id: number; name: string; slug: string; type: string | null; country: string | null }
interface FieldDiff { field: string; label: string; old: any; new: any; changed: boolean }
interface LinkDiff { platform: string; column: string | null; oldUrl: string | null; newUrl: string; action: string }
interface ContactPlan { name: string; type: string; email: string | null; phone: string | null; url: string | null; confidence: string; action: string; isPotential: boolean }
interface AlbumPlan { title: string; type: string | null; year: number | null; action: string; existingId: number | null }
interface TrackPlan { title: string; albumTitle: string | null; type: string | null; action: string; existingId: number | null; albumFound: boolean; featuring: string[]; featuringNew: string[] }
interface ImagePlan { url: string; type: string | null; license: string | null; hasLicense: boolean; action: string }
interface Preview {
  match: { status: string; artist?: MatchCandidate; candidates: MatchCandidate[] }
  willCreateArtist: boolean
  targetArtistId: number | null
  fieldDiffs: FieldDiff[]
  linkDiffs: LinkDiff[]
  contactPlans: ContactPlan[]
  albumPlans: AlbumPlan[]
  trackPlans: TrackPlan[]
  imagePlans: ImagePlan[]
  warnings: string[]
}
interface Summary {
  artist_id: number; created: boolean; fields_updated: number; links_updated: number
  contacts_added: number; contacts_updated: number; albums_created: number; albums_updated: number
  tracks_created: number; tracks_updated: number; featuring_linked: number; images_logged: number
  warnings: string[]
}

const EXAMPLE = `{
  "artist_patch": {
    "name": "Silvester Belt",
    "type": "solo_artist",
    "country": "Lietuva",
    "genre_group": "Pop, R&B muzika",
    "genres": ["Pop", "Dance pop"],
    "bio": "..."
  },
  "links": [{ "platform": "spotify", "url": "https://open.spotify.com/artist/..." }],
  "contacts": [],
  "albums": [],
  "tracks": [],
  "images": []
}`

function Pill({ text, color }: { text: string; color: 'green' | 'blue' | 'orange' | 'gray' | 'red' }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700 border-green-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    gray: 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--input-border)]',
    red: 'bg-red-100 text-red-700 border-red-200',
  }
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${colors[color]}`}>{text}</span>
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        {count !== undefined && <span className="text-xs text-[var(--text-muted)]">({count})</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default function ArtistImportPage() {
  const [jsonText, setJsonText] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string>('')
  const [errors, setErrors] = useState<string[]>([])
  // undefined = auto, 0 = kurti naują, number = pasirinktas atlikėjas
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined)

  async function call(apply: boolean, overrideId?: number | undefined) {
    setLoading(true); setError(''); setErrors([])
    if (!apply) setSummary(null)
    try {
      const idToSend = overrideId !== undefined ? overrideId : selectedId
      const res = await fetch('/api/admin/artist-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: jsonText, apply, artist_id: idToSend }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Klaida')
        if (data.errors) setErrors(data.errors)
        return
      }
      if (apply) { setSummary(data.summary); setPreview(null) }
      else setPreview(data.preview)
    } catch (e: any) {
      setError(e.message || 'Tinklo klaida')
    } finally {
      setLoading(false)
    }
  }

  function chooseTarget(id: number | undefined) {
    setSelectedId(id)
    call(false, id)
  }

  const canApply = preview && (preview.match.status !== 'multiple' || selectedId !== undefined)

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        {/* Header */}
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link href="/admin" className="hover:text-[var(--text-secondary)]">Admin</Link>
          <span className="text-[var(--text-faint)]">/</span>
          <span className="font-semibold text-[var(--text-secondary)]">JSON importas</span>
        </nav>
        <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">Atlikėjo JSON importas</h1>
        <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          Įklijuok GPT sugeneruotą JSON su info apie atlikėją. Sistema suras esamą atlikėją pagal vardą arba pasiūlys sukurti naują. Preview parodo pakeitimus prieš išsaugant.
        </p>

        {/* Input */}
        <div className="mt-4">
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="h-64 w-full resize-y rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-3 font-mono text-xs text-[var(--text-primary)] focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setSelectedId(undefined); call(false, undefined) }}
            disabled={loading || !jsonText.trim()}
            className="rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            {loading ? 'Kraunama…' : 'Preview import'}
          </button>
          <button
            onClick={() => call(true)}
            disabled={loading || !preview || !canApply}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            title={!canApply ? 'Pirma pasirink target atlikėją' : ''}
          >
            Apply import
          </button>
          {jsonText.trim() === '' && (
            <button onClick={() => setJsonText(EXAMPLE)} className="text-xs text-music-blue hover:underline">Įkelti pavyzdį</button>
          )}
        </div>

        {/* Errors */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠ {error}
            {errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
          </div>
        )}

        {/* Apply summary */}
        {summary && (
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
            <h3 className="text-sm font-bold text-green-800">✓ Importas pritaikytas</h3>
            <p className="mt-1 text-xs text-green-700">
              Atlikėjas {summary.created ? 'sukurtas' : 'atnaujintas'} (ID {summary.artist_id}).{' '}
              <Link href={`/admin/artists/${summary.artist_id}`} className="font-semibold underline">Atidaryti →</Link>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-green-800 sm:grid-cols-3">
              <span>Laukai: {summary.fields_updated}</span>
              <span>Linkai: {summary.links_updated}</span>
              <span>Kontaktai: +{summary.contacts_added} / ~{summary.contacts_updated}</span>
              <span>Albumai: +{summary.albums_created} / ~{summary.albums_updated}</span>
              <span>Dainos: +{summary.tracks_created} / ~{summary.tracks_updated}</span>
              <span>Featuring: {summary.featuring_linked}</span>
            </div>
            {summary.warnings.length > 0 && (
              <details className="mt-2 text-xs text-orange-700">
                <summary className="cursor-pointer font-semibold">{summary.warnings.length} įspėjimai</summary>
                <ul className="mt-1 list-inside list-disc">{summary.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            <div className="mt-3 border-t border-green-200 pt-3">
              <p className="mb-1.5 text-xs text-green-800">Užbaik profilį — paleisk YouTube video + peržiūras + dainų tekstus:</p>
              <FullEnrichButton artistId={summary.artist_id} />
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="mt-5">
            {/* Artist match */}
            <Section title="Atlikėjas">
              {preview.match.status === 'matched' && preview.match.artist && (
                <div className="flex items-center gap-2 text-sm">
                  <Pill text="Rastas" color="blue" />
                  <span className="font-semibold text-[var(--text-primary)]">{preview.match.artist.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{preview.match.artist.type} · {preview.match.artist.country || '—'} · ID {preview.match.artist.id}</span>
                </div>
              )}
              {preview.willCreateArtist && (
                <div className="flex items-center gap-2 text-sm">
                  <Pill text="Naujas" color="green" />
                  <span className="text-[var(--text-primary)]">Bus sukurtas naujas atlikėjas „{preview.fieldDiffs.find(f => f.field === 'name')?.new || ''}"</span>
                </div>
              )}
              {preview.match.status === 'multiple' && (
                <div>
                  <p className="mb-2 text-sm text-orange-700">Rasti keli panašūs — pasirink kurį atnaujinti:</p>
                  <div className="space-y-1.5">
                    {preview.match.candidates.map(c => (
                      <button
                        key={c.id}
                        onClick={() => chooseTarget(c.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selectedId === c.id ? 'border-blue-500 bg-blue-50' : 'border-[var(--input-border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'}`}
                      >
                        <span className="font-semibold text-[var(--text-primary)]">{c.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">{c.type} · {c.country || '—'} · ID {c.id}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => chooseTarget(0)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selectedId === 0 ? 'border-green-500 bg-green-50' : 'border-dashed border-[var(--input-border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'}`}
                    >
                      <Pill text="Naujas" color="green" />
                      <span className="text-[var(--text-primary)]">Sukurti naują atlikėją</span>
                    </button>
                  </div>
                </div>
              )}
              {preview.match.status === 'new' && preview.match.candidates.length > 0 && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Panašūs (ne match'as): {preview.match.candidates.map(c => c.name).join(', ')}</p>
              )}
            </Section>

            {/* Field diffs */}
            {preview.fieldDiffs.length > 0 && (
              <Section title="Laukų pakeitimai" count={preview.fieldDiffs.length}>
                <div className="space-y-1.5">
                  {preview.fieldDiffs.map((f, i) => (
                    <div key={i} className="grid grid-cols-[110px_1fr] items-start gap-2 text-xs">
                      <span className="font-semibold text-[var(--text-secondary)]">{f.label}</span>
                      <div className="min-w-0">
                        {f.changed ? (
                          <span>
                            {f.old != null && <span className="text-red-600 line-through">{String(f.old)}</span>}
                            {f.old != null && ' → '}
                            <span className="text-green-700">{String(f.new)}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">{String(f.new)} (be pakeitimų)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Links */}
            {preview.linkDiffs.length > 0 && (
              <Section title="Nuorodos" count={preview.linkDiffs.length}>
                <div className="space-y-1">
                  {preview.linkDiffs.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Pill text={l.action === 'unsupported' ? 'nepalaikoma' : l.action} color={l.action === 'add' ? 'green' : l.action === 'update' ? 'blue' : l.action === 'unsupported' ? 'red' : 'gray'} />
                      <span className="font-semibold text-[var(--text-secondary)]">{l.platform}</span>
                      <span className="truncate text-[var(--text-muted)]">{l.newUrl}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Contacts */}
            {preview.contactPlans.length > 0 && (
              <Section title="Kontaktai" count={preview.contactPlans.length}>
                <div className="space-y-1.5">
                  {preview.contactPlans.map((c, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill text={c.action} color={c.action === 'add' ? 'green' : 'blue'} />
                        <span className="font-semibold text-[var(--text-primary)]">{c.name || '(be pavadinimo)'}</span>
                        <Pill text={c.type} color="gray" />
                        {c.isPotential && <Pill text="lead" color="orange" />}
                        <span className="text-[var(--text-faint)]">{c.confidence}</span>
                      </div>
                      <div className="ml-1 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--text-muted)]">
                        {c.email && <span>✉ {c.email}</span>}
                        {c.phone && <span>☎ {c.phone}</span>}
                        {c.url && <span className="max-w-full truncate">🔗 {c.url}</span>}
                        {!c.email && !c.phone && !c.url && <span className="text-[var(--text-faint)]">be kontaktinių duomenų</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Albums */}
            {preview.albumPlans.length > 0 && (
              <Section title="Albumai" count={preview.albumPlans.length}>
                <div className="space-y-1">
                  {preview.albumPlans.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Pill text={a.action === 'create' ? 'naujas' : 'update'} color={a.action === 'create' ? 'green' : 'blue'} />
                      <span className="text-[var(--text-primary)]">{a.title}</span>
                      {a.year && <span className="text-[var(--text-muted)]">{a.year}</span>}
                      {a.type && <span className="text-[var(--text-faint)]">{a.type}</span>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Tracks */}
            {preview.trackPlans.length > 0 && (
              <Section title="Dainos" count={preview.trackPlans.length}>
                <div className="space-y-1">
                  {preview.trackPlans.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                      <Pill text={t.action === 'create' ? 'nauja' : 'update'} color={t.action === 'create' ? 'green' : 'blue'} />
                      <span className="text-[var(--text-primary)]">{t.title}</span>
                      {t.albumTitle && <span className={t.albumFound ? 'text-[var(--text-muted)]' : 'text-orange-600'}>💿 {t.albumTitle}{!t.albumFound && ' (nerastas)'}</span>}
                      {t.featuring.length > 0 && <span className="text-[var(--text-faint)]">feat. {t.featuring.join(', ')}</span>}
                      {t.featuringNew.length > 0 && <Pill text={`+${t.featuringNew.length} nauji`} color="orange" />}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Images */}
            {preview.imagePlans.length > 0 && (
              <Section title="Paveikslėliai" count={preview.imagePlans.length}>
                <div className="space-y-1">
                  {preview.imagePlans.map((img, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Pill text={img.hasLicense ? 'peržiūrai' : 'skip'} color={img.hasLicense ? 'blue' : 'red'} />
                      <span className="truncate text-[var(--text-muted)]">{img.url}</span>
                      {img.license && <span className="text-[var(--text-faint)]">{img.license}</span>}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-[var(--text-faint)]">Paveikslėliai neaplikuojami automatiškai — įkelk cover'į rankiniu būdu atlikėjo redagavime.</p>
              </Section>
            )}

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <Section title="⚠ Įspėjimai" count={preview.warnings.length}>
                <ul className="list-inside list-disc space-y-0.5 text-xs text-orange-700">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
