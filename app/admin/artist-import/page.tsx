'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import FullEnrichButton from '@/components/FullEnrichButton'
import { ARTIST_IMPORT_PROMPT } from '@/lib/artist-import-prompt'

// Tipai dubliuoti iš lib/artist-import.ts (client'e nenorim importuoti server lib).
interface MatchCandidate { id: number; name: string; slug: string; type: string | null; country: string | null }
interface FieldDiff { field: string; label: string; old: any; new: any; changed: boolean; selectable: boolean }
interface LinkDiff { index: number; platform: string; column: string | null; oldUrl: string | null; newUrl: string; action: string }
interface ContactPlan { index: number; name: string; type: string; email: string | null; phone: string | null; url: string | null; confidence: string; action: string; isPotential: boolean }
interface AlbumPlan { index: number; title: string; type: string | null; year: number | null; action: string; existingId: number | null; description: string | null; descriptionOld: string | null; descriptionChanged: boolean; descriptionOnly: boolean; notFound: boolean }
interface TrackPlan { index: number; title: string; albumTitle: string | null; type: string | null; action: string; existingId: number | null; albumFound: boolean; featuring: string[]; featuringNew: string[] }
interface ImagePlan { index: number; url: string; type: string | null; license: string | null; hasLicense: boolean; action: string }
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

const EXAMPLE_FULL = `{
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

const EXAMPLE_ALBUM_DESC = `{
  "artist": "Rokas Yan",
  "album": "Alkis",
  "description": "„Alkis" – trečiasis Roko Yan studijinis albumas ir vienas emociškai intensyviausių jo kūrybos etapų. Albume pop skambesys jungiamas su tamsesne vidine įtampa, santykių lūžiais, troškimu, savęs paieška ir dramatiškesne nuotaika."
}`

function Pill({ text, color }: { text: string; color: 'green' | 'blue' | 'orange' | 'gray' | 'red' }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700 border-green-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    gray: 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--input-border)]',
    red: 'bg-red-100 text-red-700 border-red-200',
  }
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[12.5px] font-bold ${colors[color]}`}>{text}</span>
}

/** Atžymimas elementas — varnelė (default checked). Disabled = negalima taikyti (pvz. nepalaikoma). */
function Check({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

function Section({
  title, count, children, onAll, onNone,
}: { title: string; count?: number; children: React.ReactNode; onAll?: () => void; onNone?: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        {count !== undefined && <span className="text-xs text-[var(--text-muted)]">({count})</span>}
        {(onAll || onNone) && (
          <div className="ml-auto flex items-center gap-2 text-[13px]">
            {onAll && <button onClick={onAll} className="text-blue-600 hover:underline">Visi</button>}
            {onAll && onNone && <span className="text-[var(--text-faint)]">·</span>}
            {onNone && <button onClick={onNone} className="text-[var(--text-muted)] hover:underline">Nieko</button>}
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── Info modalas su sisteminiu promptu ─────────────────────────────────────────
function InfoModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ARTIST_IMPORT_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onClick={onClose}>
      <div
        className="my-auto w-full max-w-2xl rounded-2xl border border-[var(--input-border)] bg-[var(--bg-surface)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-3">
          <h2 className="text-base font-bold text-[var(--text-primary)]">Kaip generuoti importo JSON</h2>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="Uždaryti">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-[14px] text-[var(--text-secondary)]">
            Nukopijuok žemiau esantį sisteminį promptą ir įdėk jį į GPT, Claude ar kitą LLM. Tada tiesiog parašyk vieną iš formatų:
          </p>
          <ul className="space-y-1.5 text-[14.5px] text-[var(--text-secondary)]">
            <li><code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[13.5px]">Atlikėjas</code> — pilnas atlikėjo / grupės importas.</li>
            <li><code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[13.5px]">Atlikėjas - Albumas</code> — tik albumo duomenys, aprašymas ir tracklistas.</li>
            <li><code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[13.5px]">Atlikėjas - Albumas, tik aprašymas</code> — tik trumpas albumo aprašymas.</li>
            <li><code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[13.5px]">Atlikėjas, tik kontaktai</code> — tik kontaktai (booking / vadyba / label).</li>
          </ul>
          <p className="text-[14.5px] text-[var(--text-muted)]">
            Gautą JSON įklijuok į importo lauką, paspausk „Peržiūrėti", atžymėk ko nenori keisti ir paspausk „Taikyti".
          </p>

          <div className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-elevated)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Sisteminis promptas</span>
              <button
                onClick={copy}
                className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                {copied ? '✓ Nukopijuota' : 'Kopijuoti promptą'}
              </button>
            </div>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap px-3 py-3 font-mono text-[13px] leading-relaxed text-[var(--text-primary)]">{ARTIST_IMPORT_PROMPT}</pre>
          </div>
        </div>
      </div>
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
  const [showInfo, setShowInfo] = useState(false)
  // undefined = auto, 0 = kurti naują, number = pasirinktas atlikėjas
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined)

  // ── Pasirinkimo (varnelių) būsena ──
  const [selFields, setSelFields] = useState<Set<string>>(new Set())
  const [selLinks, setSelLinks] = useState<Set<number>>(new Set())
  const [selContacts, setSelContacts] = useState<Set<number>>(new Set())
  const [selAlbums, setSelAlbums] = useState<Set<number>>(new Set())
  const [selTracks, setSelTracks] = useState<Set<number>>(new Set())

  function initSelection(p: Preview) {
    setSelFields(new Set(p.fieldDiffs.filter(f => f.selectable).map(f => f.field)))
    setSelLinks(new Set(p.linkDiffs.filter(l => l.action !== 'unsupported').map(l => l.index)))
    setSelContacts(new Set(p.contactPlans.map(c => c.index)))
    setSelAlbums(new Set(p.albumPlans.filter(a => !a.notFound).map(a => a.index)))
    setSelTracks(new Set(p.trackPlans.map(t => t.index)))
  }

  function toggle<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, key: T) {
    setter(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  async function call(apply: boolean, overrideId?: number | undefined) {
    setLoading(true); setError(''); setErrors([])
    if (!apply) setSummary(null)
    try {
      const idToSend = overrideId !== undefined ? overrideId : selectedId
      const res = await fetch('/api/admin/artist-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: jsonText,
          apply,
          artist_id: idToSend,
          selection: apply ? {
            fields: [...selFields],
            links: [...selLinks],
            contacts: [...selContacts],
            albums: [...selAlbums],
            tracks: [...selTracks],
          } : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Klaida')
        if (data.errors) setErrors(data.errors)
        return
      }
      if (apply) { setSummary(data.summary); setPreview(null) }
      else { setPreview(data.preview); initSelection(data.preview) }
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
        <div className="flex items-start gap-2">
          <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">JSON importas</h1>
          <button
            onClick={() => setShowInfo(true)}
            className="mt-1 flex items-center gap-1.5 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            title="Kaip generuoti importo JSON"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            Info ir promptas
          </button>
        </div>
        <p className="mt-1 text-[14.5px] text-[var(--text-muted)]">
          Įklijuok GPT / LLM sugeneruotą JSON — pilną atlikėją, albumą arba vien albumo aprašymą (<code className="font-mono">{`{ artist, album, description }`}</code>). Peržiūra parodo pakeitimus; gali atžymėti, ko nenori keisti, prieš išsaugant.
        </p>

        {/* Input */}
        <div className="mt-4">
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            placeholder={EXAMPLE_FULL}
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
            {loading ? 'Kraunama…' : 'Peržiūrėti'}
          </button>
          <button
            onClick={() => call(true)}
            disabled={loading || !preview || !canApply}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            title={!canApply ? 'Pirma pasirink target atlikėją' : ''}
          >
            Taikyti
          </button>
          {jsonText.trim() === '' && (
            <>
              <button onClick={() => setJsonText(EXAMPLE_FULL)} className="text-xs text-music-blue hover:underline">Pavyzdys: pilnas atlikėjas</button>
              <button onClick={() => setJsonText(EXAMPLE_ALBUM_DESC)} className="text-xs text-music-blue hover:underline">Pavyzdys: tik albumo aprašymas</button>
            </>
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
            <p className="mb-3 text-[14px] text-[var(--text-muted)]">
              Pažymėti elementai bus taikomi. Atžymėk, ko nenori keisti esamoje informacijoje.
            </p>

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
              <Section
                title="Laukų pakeitimai"
                count={preview.fieldDiffs.length}
                onAll={() => setSelFields(new Set(preview.fieldDiffs.filter(f => f.selectable).map(f => f.field)))}
                onNone={() => setSelFields(new Set())}
              >
                <div className="space-y-1.5">
                  {preview.fieldDiffs.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Check
                        checked={f.selectable ? selFields.has(f.field) : false}
                        disabled={!f.selectable}
                        onChange={() => toggle(setSelFields, f.field)}
                      />
                      <div className="grid flex-1 grid-cols-[110px_1fr] items-start gap-2">
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
                          {!f.selectable && <span className="ml-1 text-[var(--text-faint)]">(vardas nekeičiamas)</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Links */}
            {preview.linkDiffs.length > 0 && (
              <Section
                title="Nuorodos"
                count={preview.linkDiffs.length}
                onAll={() => setSelLinks(new Set(preview.linkDiffs.filter(l => l.action !== 'unsupported').map(l => l.index)))}
                onNone={() => setSelLinks(new Set())}
              >
                <div className="space-y-1">
                  {preview.linkDiffs.map((l, i) => {
                    const unsupported = l.action === 'unsupported'
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Check checked={!unsupported && selLinks.has(l.index)} disabled={unsupported} onChange={() => toggle(setSelLinks, l.index)} />
                        <Pill text={unsupported ? 'nepalaikoma' : l.action} color={l.action === 'add' ? 'green' : l.action === 'update' ? 'blue' : unsupported ? 'red' : 'gray'} />
                        <span className="font-semibold text-[var(--text-secondary)]">{l.platform}</span>
                        <span className="truncate text-[var(--text-muted)]">{l.newUrl}</span>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Contacts */}
            {preview.contactPlans.length > 0 && (
              <Section
                title="Kontaktai"
                count={preview.contactPlans.length}
                onAll={() => setSelContacts(new Set(preview.contactPlans.map(c => c.index)))}
                onNone={() => setSelContacts(new Set())}
              >
                <div className="space-y-1.5">
                  {preview.contactPlans.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Check checked={selContacts.has(c.index)} onChange={() => toggle(setSelContacts, c.index)} />
                      <div className="flex-1">
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
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Albums */}
            {preview.albumPlans.length > 0 && (
              <Section
                title="Albumai"
                count={preview.albumPlans.length}
                onAll={() => setSelAlbums(new Set(preview.albumPlans.filter(a => !a.notFound).map(a => a.index)))}
                onNone={() => setSelAlbums(new Set())}
              >
                <div className="space-y-2">
                  {preview.albumPlans.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Check checked={!a.notFound && selAlbums.has(a.index)} disabled={a.notFound} onChange={() => toggle(setSelAlbums, a.index)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill text={a.notFound ? 'nerastas' : a.action === 'create' ? 'naujas' : 'update'} color={a.notFound ? 'red' : a.action === 'create' ? 'green' : 'blue'} />
                          <span className="text-[var(--text-primary)]">{a.title}</span>
                          {a.year && <span className="text-[var(--text-muted)]">{a.year}</span>}
                          {a.type && <span className="text-[var(--text-faint)]">{a.type}</span>}
                          {a.descriptionChanged && <Pill text="aprašymas" color="orange" />}
                        </div>
                        {a.notFound && <p className="ml-0.5 mt-0.5 text-[var(--text-faint)]">Albumas nerastas pas atlikėją — aprašymas nebus išsaugotas.</p>}
                        {a.description && a.descriptionChanged && (
                          <details className="ml-0.5 mt-1">
                            <summary className="cursor-pointer text-[var(--text-muted)]">Peržiūrėti aprašymą</summary>
                            {a.descriptionOld && (
                              <p className="mt-1 text-red-600 line-through">{a.descriptionOld}</p>
                            )}
                            <p className="mt-1 text-green-700">{a.description}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Tracks */}
            {preview.trackPlans.length > 0 && (
              <Section
                title="Dainos"
                count={preview.trackPlans.length}
                onAll={() => setSelTracks(new Set(preview.trackPlans.map(t => t.index)))}
                onNone={() => setSelTracks(new Set())}
              >
                <div className="space-y-1">
                  {preview.trackPlans.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                      <Check checked={selTracks.has(t.index)} onChange={() => toggle(setSelTracks, t.index)} />
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
                <p className="mt-2 text-[13px] text-[var(--text-faint)]">Paveikslėliai neaplikuojami automatiškai — įkelk cover'į rankiniu būdu atlikėjo redagavime.</p>
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

            {/* Apply (apačioje, patogu po ilgu preview) */}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => call(true)}
                disabled={loading || !canApply}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                title={!canApply ? 'Pirma pasirink target atlikėją' : ''}
              >
                {loading ? 'Kraunama…' : 'Taikyti pažymėtus'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}
