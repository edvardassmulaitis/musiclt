'use client'
// app/blogas/rasyti/page.tsx
//
// Turinio pridėjimo WIZARD'as — mobile-first, žingsnis po žingsnio. Kiekvienas
// tipas turi savo pritaikytą srautą:
//   review  — ką recenzuoji → (albumui) bendrai/per dainas → balas/turinys → final
//   topas   — iš ko → kiek → įrašai po vieną → final
//   article — tekstas → final
//   translation — daina → vertimas → final
//   creation — žanras → tekstas → final
//   event   — renginys → įspūdžiai → final
//   mood    — nuotaikos daina (1 žingsnis, ne blog įrašas)
//   daily   — dienos dainos pasiūlymas (daina → komentaras)
//
// Redagavimas (?id=) — atskira kompaktiška forma (EditPostForm).

import { useState, useEffect, Suspense, useCallback, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BlogEditor } from '@/components/BlogEditor'
import { ListEditorField, type ListItem } from '@/components/blog/ListEditorField'
import { ImageUploadField } from '@/components/blog/ImageUploadField'
import { EventTargetField, type EventTarget } from '@/components/blog/EventTargetField'
import { UsernameSetupGate } from '@/components/blog/UsernameSetupGate'
import { VoiceRecorder } from '@/components/blog/VoiceRecorder'
import type { BlogPostType } from '@/components/blog/post-types'
import type { AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'
import { WizardChrome } from '@/components/blog/wizard/WizardChrome'
import { EntityPicker, SelectedEntityCard } from '@/components/blog/wizard/EntityPicker'
import { RatingControl } from '@/components/blog/wizard/RatingControl'
import { ChoiceCards, CountChips, FieldLabel, type Choice } from '@/components/blog/wizard/WizardControls'
import { EditPostForm } from '@/components/blog/wizard/EditPostForm'

type WizType = BlogPostType | 'mood' | 'daily'

type TrackReview = {
  entity_id: number | null
  entity_slug: string | null
  title: string
  artist: string | null
  image_url: string | null
  rating: number | null
  comment: string
}

const sv = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

// ── Tipo pasirinkimo landing'as (kai nėra ?type) ────────────────────────────
// Tvarka pagal svarbą — kaip /atrasti ir QuickCreate: dalinimosi turinys
// (koncertas → recenzija → topas → atradimas) pirmiau, kūryba ir profilis po.
// 'atradimas' — ne wizard tipas, navigacija į /muzikos-atradimai/pasidalink.
const TYPE_TILES: Array<{ type: WizType | 'atradimas'; label: string; desc: string; icon: ReactNode }> = [
  { type: 'event',       label: 'Koncerto įspūdžiai', desc: 'Koncerto ar festivalio apžvalga', icon: sv(<path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />) },
  { type: 'review',      label: 'Recenzija',     desc: 'Įvertink dainą, albumą ar atlikėją', icon: sv(<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />) },
  { type: 'topas',       label: 'Topas',         desc: 'Numeruotas sąrašas su komentarais', icon: sv(<><path d="M10 6h11" /><path d="M10 12h11" /><path d="M10 18h11" /><path d="M4 6h1v4" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>) },
  { type: 'atradimas',   label: 'Atradimas',     desc: 'Pasidalink rasta muzika', icon: sv(<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />) },
  { type: 'creation',    label: 'Kūryba',        desc: 'Eilėraštis, esė, tavo kūrinys', icon: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
  { type: 'translation', label: 'Vertimas',      desc: 'Dainos žodžių vertimas į lietuvių', icon: sv(<><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></>) },
  { type: 'article',     label: 'Įrašas',        desc: 'Straipsnis, mintis, naujiena', icon: sv(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>) },
  { type: 'daily',       label: 'Dienos daina',  desc: 'Pasiūlyk dienos dainai', icon: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>) },
  { type: 'mood',        label: 'Nuotaikos daina', desc: 'Daina tavo profiliui', icon: sv(<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />) },
]

const CREATION_SUBTYPES: Choice[] = [
  { value: 'eilerastis', label: 'Eilėraštis' },
  { value: 'ese',        label: 'Esė' },
  { value: 'proza',      label: 'Proza / apsakymas' },
  { value: 'kita',       label: 'Kita' },
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function EditorInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const initialType = searchParams.get('type') as WizType | null

  // ── Auth / profile gate ────────────────────────────────────────────────
  const [profileLoading, setProfileLoading] = useState(true)
  const [hasUsername, setHasUsername] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [authError, setAuthError] = useState('')

  // ── Wizard state ───────────────────────────────────────────────────────
  const [type, setType] = useState<WizType | null>(initialType)
  const [stepIdx, setStepIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // common
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coverUrl, setCoverUrl] = useState('')

  // review
  const [target, setTarget] = useState<AttachmentHit | null>(null)
  const [reviewMode, setReviewMode] = useState<'overall' | 'tracks' | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [trackReviews, setTrackReviews] = useState<TrackReview[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)

  // topas
  const [topasKind, setTopasKind] = useState<'artist' | 'album' | 'track' | 'mixed' | null>(null)
  const [topasCount, setTopasCount] = useState<number | null>(null)
  const [topasItems, setTopasItems] = useState<ListItem[]>([])
  const [topasOutro, setTopasOutro] = useState('')

  // translation / mood / daily song target
  const [songTarget, setSongTarget] = useState<AttachmentHit | null>(null)
  const [dailyComment, setDailyComment] = useState('')

  // event
  const [eventTarget, setEventTarget] = useState<EventTarget>({ event_id: null, display: null })

  // creation
  const [creationSubtype, setCreationSubtype] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(async r => {
      if (r.status === 401) { setAuthError('Prisijunk, kad galėtum kurti'); return }
      const p = await r.json()
      setHasUsername(!!p?.username)
      setUsername(p?.username || null)
    }).catch(() => setAuthError('Klaida kraunant profilį'))
      .finally(() => setProfileLoading(false))
  }, [])

  const next = useCallback(() => setStepIdx(i => i + 1), [])

  // Uždaryti overlay — grįžti ten, iš kur atėjom (app-like)
  const close = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/srautas')
  }, [router])

  // ── Album tracks fetch (review per-track mode) ──────────────────────────
  const loadAlbumTracks = useCallback(async (albumId: number, albumCover: string | null, albumArtist: string | null) => {
    setTracksLoading(true)
    try {
      const r = await fetch(`/api/albums/${albumId}/details`)
      const d = await r.json()
      const cover = d?.album?.cover_image_url || albumCover || null
      const artist = d?.artist?.name || albumArtist || null
      const items: TrackReview[] = (Array.isArray(d?.tracks) ? d.tracks : []).map((t: any) => ({
        entity_id: t.id ?? null,
        entity_slug: t.slug ?? null,
        title: t.title || '',
        artist,
        image_url: cover,
        rating: null,
        comment: '',
      })).filter((t: TrackReview) => t.title)
      setTrackReviews(items)
    } catch {
      setTrackReviews([])
    } finally {
      setTracksLoading(false)
    }
  }, [])

  // ── Pick handlers ───────────────────────────────────────────────────────
  function pickReviewTarget(hit: AttachmentHit) {
    setTarget(hit)
    setReviewMode(null)
    setRating(null)
    setTrackReviews([])
    setTitle(prev => prev || `Recenzija: ${hit.title}`)
    next()
  }

  function pickReviewMode(mode: string) {
    const m = mode as 'overall' | 'tracks'
    setReviewMode(m)
    if (m === 'tracks' && target) {
      loadAlbumTracks(target.id, target.image_url, target.artist)
    }
    next()
  }


  function pickTranslationTrack(hit: AttachmentHit) {
    setSongTarget(hit)
    setTitle(prev => prev || `${hit.title}${hit.artist ? ` — ${hit.artist}` : ''} (vertimas)`)
    next()
  }

  // ── Voice ────────────────────────────────────────────────────────────────
  function buildVoiceContext(): string {
    if (type === 'review' && target) {
      const what = target.type === 'grupe' ? 'atlikėją' : target.type === 'albumas' ? 'albumą' : 'dainą'
      return `Muzikos recenzija apie ${what} „${target.title}"${target.artist ? ` (${target.artist})` : ''}. Lietuvių kalba.`
    }
    if (type === 'event' && eventTarget.display) {
      return `Renginio apžvalga: „${eventTarget.display.title}"${eventTarget.display.city ? `, ${eventTarget.display.city}` : ''}. Lietuvių kalba.`
    }
    return 'Muzikos turinys lietuvių kalba.'
  }
  function appendVoiceText(text: string) {
    const html = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`).join('')
    if (html) setContent(prev => (prev || '') + html)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submitBlog(status: 'draft' | 'published') {
    setBusy(true); setError(null)
    const body: any = { title: title.trim() || autoTitle(), content, cover_image_url: coverUrl || null, status, post_type: type }

    if (type === 'review') {
      if (reviewMode === 'tracks' && target) {
        body.target_album_id = target.id
        body.rating = rating // optional overall
        body.list_items = trackReviews
          .filter(t => t.rating !== null || t.comment.trim())
          .map(t => ({ type: 'track', entity_id: t.entity_id, entity_slug: t.entity_slug, title: t.title, artist: t.artist, image_url: t.image_url, comment: t.comment.trim() || null, rating: t.rating }))
      } else if (target) {
        body.rating = rating
        body.target_artist_id = target.type === 'grupe' ? target.id : null
        body.target_album_id = target.type === 'albumas' ? target.id : null
        body.target_track_id = target.type === 'daina' ? target.id : null
      }
    }
    if (type === 'translation' && songTarget) body.target_track_id = songTarget.id
    if (type === 'event') body.target_event_id = eventTarget.event_id
    if (type === 'topas') {
      body.list_items = topasItems.map(it => ({
        type: it.type, entity_id: it.entity_id, entity_slug: it.entity_slug,
        title: it.title, artist: it.artist, image_url: it.image_url, comment: (it.comment || '').trim() || null,
      }))
      body.topas_meta = { outro: topasOutro.trim() || null }
    }
    if (type === 'creation' && creationSubtype) body.creation_subtype = creationSubtype

    try {
      const res = await fetch('/api/blog/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) router.push('/blogas/mano')
      else { const d = await res.json().catch(() => ({})); setError(d?.error || 'Klaida saugant'); setBusy(false) }
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  async function submitMood() {
    if (!songTarget) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/profile/mood-song', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id: songTarget.id }) })
      if (res.ok) router.push(username ? `/vartotojas/${username}` : '/blogas/mano')
      else { const d = await res.json().catch(() => ({})); setError(d?.error || 'Klaida'); setBusy(false) }
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  async function submitDaily() {
    if (!songTarget) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/dienos-daina/nominations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id: songTarget.id, comment: dailyComment.trim() || undefined }) })
      if (res.ok) router.push('/dienos-daina')
      else { const d = await res.json().catch(() => ({})); setError(d?.error || 'Klaida'); setBusy(false) }
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  function autoTitle(): string {
    if (type === 'review' && target) return `Recenzija: ${target.title}`
    if (type === 'translation' && songTarget) return `${songTarget.title} (vertimas)`
    if (type === 'event' && eventTarget.display) return eventTarget.display.title
    return 'Be pavadinimo'
  }

  // ════════ STEP BUILDER ════════
  type Step = { id: string; title: string; subtitle?: string; valid: boolean; node: ReactNode; primaryLabel?: string; secondary?: boolean }
  function buildSteps(): Step[] {
    if (!type) return []
    const steps: Step[] = []

    if (type === 'review') {
      steps.push({
        id: 'pick', title: 'Ką recenzuoji?',
        subtitle: 'Pasirink atlikėją, albumą arba dainą — iš neseniai pamėgtų ar per paiešką.',
        valid: !!target,
        node: target
          ? <div className="wz-stack"><SelectedEntityCard hit={target} onClear={() => { setTarget(null); setReviewMode(null) }} /></div>
          : <EntityPicker kind="all" allowFilterChips onPick={pickReviewTarget} autoFocus />,
      })
      if (target?.type === 'albumas') {
        steps.push({
          id: 'mode', title: 'Kaip vertinsi albumą?',
          subtitle: 'Gali įvertinti visą albumą bendrai arba kiekvieną dainą atskirai.',
          valid: !!reviewMode,
          node: <ChoiceCards
            value={reviewMode}
            onSelect={pickReviewMode}
            choices={[
              { value: 'overall', label: 'Visą albumą bendrai', desc: 'Vienas balas + tekstas apie albumą', icon: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>) },
              { value: 'tracks', label: 'Dainą po dainos', desc: 'Įvertink ir aprašyk atskiras dainas', icon: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
            ]}
          />,
        })
      }
      const perTrack = target?.type === 'albumas' && reviewMode === 'tracks'
      if (perTrack) {
        steps.push({
          id: 'tracks', title: 'Įvertink dainas',
          subtitle: 'Bakstelėk balą prie kiekvienos dainos. Komentaras — neprivalomas.',
          valid: trackReviews.some(t => t.rating !== null),
          node: <TrackReviewList items={trackReviews} loading={tracksLoading} onChange={setTrackReviews} />,
        })
      } else {
        steps.push({
          id: 'rate', title: 'Tavo įvertinimas',
          subtitle: 'Nustatyk balą ir parašyk įspūdžius.',
          valid: rating !== null,
          node: <div className="wz-stack">
            <div><FieldLabel>Balas</FieldLabel><RatingControl value={rating} onChange={setRating} /></div>
            <div>
              <FieldLabel optional>Įspūdžiai</FieldLabel>
              <VoiceRecorder context={buildVoiceContext()} onResult={appendVoiceText} />
              <div className="wz-editor-wrap"><BlogEditor value={content} onChange={setContent} placeholder="Kuo patiko, kuo ne… (neprivaloma)" /></div>
            </div>
          </div>,
        })
      }
      steps.push({
        id: 'final', title: 'Beveik baigta',
        subtitle: 'Pavadinimas ir, jei nori, antraštės nuotrauka.',
        valid: !!title.trim() || !!autoTitle(),
        node: <FinalStep
          title={title} onTitle={setTitle} titlePlaceholder="Recenzijos pavadinimas"
          coverUrl={coverUrl} onCover={setCoverUrl}
          extra={perTrack ? <div>
            <FieldLabel optional>Bendras albumo balas</FieldLabel>
            <RatingControl value={rating} onChange={setRating} />
            <div className="wz-editor-wrap" style={{ marginTop: 14 }}>
              <FieldLabel optional>Įžanga apie albumą</FieldLabel>
              <BlogEditor value={content} onChange={setContent} placeholder="Bendras įspūdis apie albumą (neprivaloma)" />
            </div>
          </div> : null}
        />,
      })
    }

    else if (type === 'topas') {
      steps.push({
        id: 'source', title: 'Iš ko topas?',
        subtitle: 'Ką rikiuosi šiame sąraše.',
        valid: !!topasKind,
        node: <ChoiceCards
          value={topasKind}
          onSelect={(v) => { setTopasKind(v as any); next() }}
          choices={[
            { value: 'track', label: 'Dainos', icon: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
            { value: 'album', label: 'Albumai', icon: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>) },
            { value: 'artist', label: 'Atlikėjai', icon: sv(<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /></>) },
            { value: 'mixed', label: 'Mišrus', desc: 'Įvairūs įrašai viename tope', icon: sv(<><path d="M10 6h11" /><path d="M10 12h11" /><path d="M10 18h11" /><path d="M4 6h1v4" /></>) },
          ]}
        />,
      })
      steps.push({
        id: 'count', title: 'Kiek įrašų?',
        subtitle: 'Galėsi keisti vėliau — tai tik orientyras.',
        valid: !!topasCount,
        node: <CountChips options={[3, 5, 10, 20]} value={topasCount} onChange={setTopasCount} onPick={() => next()} />,
      })
      steps.push({
        id: 'entries', title: 'Sudaryk sąrašą',
        subtitle: topasCount ? `Pridėta ${topasItems.length} iš ${topasCount}. Tvarka = vieta tope.` : `Pridėta ${topasItems.length}.`,
        valid: topasItems.length >= 2,
        node: <ListEditorField items={topasItems} onChange={setTopasItems} />,
      })
      steps.push({
        id: 'final', title: 'Pavadink topą',
        subtitle: 'Pridėk pavadinimą ir, jei nori, įžangą.',
        valid: !!title.trim(),
        node: <FinalStep
          title={title} onTitle={setTitle} titlePlaceholder="Pvz. Mano TOP 10 LT albumų 2025"
          coverUrl={coverUrl} onCover={setCoverUrl}
          extra={<div className="wz-editor-wrap">
            <FieldLabel optional>Įžanga</FieldLabel>
            <BlogEditor value={content} onChange={setContent} placeholder="Konteksto paaiškinimas (neprivaloma)" />
            <div style={{ marginTop: 16 }}>
              <FieldLabel optional>Apibendrinimas</FieldLabel>
              <BlogEditor value={topasOutro} onChange={setTopasOutro} placeholder="Apibendrinimas po sąrašo (neprivaloma)" />
            </div>
          </div>}
        />,
      })
    }

    else if (type === 'article') {
      steps.push({
        id: 'write', title: 'Rašyk įrašą',
        subtitle: 'Įklijuok YouTube/Spotify nuorodą — pavirs embed\'u. Numesk nuotrauką — įsikels.',
        valid: !!title.trim() && !!content.trim(),
        node: <div className="wz-stack">
          <TitleInput value={title} onChange={setTitle} placeholder="Įrašo pavadinimas" />
          <div className="wz-editor-wrap"><BlogEditor value={content} onChange={setContent} placeholder="Pradėk rašyti…" /></div>
        </div>,
      })
      steps.push({
        id: 'final', title: 'Antraštės nuotrauka', subtitle: 'Neprivaloma — bet padaro įrašą patrauklesnį.',
        valid: true,
        node: <ImageUploadField value={coverUrl} onChange={setCoverUrl} label="Antraštės nuotrauka" />,
      })
    }

    else if (type === 'translation') {
      steps.push({
        id: 'pick', title: 'Kurią dainą verti?',
        subtitle: 'Pasirink dainą iš music.lt.',
        valid: !!songTarget,
        node: songTarget
          ? <SelectedEntityCard hit={songTarget} onClear={() => setSongTarget(null)} />
          : <EntityPicker kind="track" onPick={pickTranslationTrack} autoFocus placeholder="Ieškok dainos…" />,
      })
      steps.push({
        id: 'write', title: 'Vertimas',
        subtitle: 'Įrašyk lietuvišką vertimą.',
        valid: !!content.trim(),
        node: <div className="wz-stack">
          <TitleInput value={title} onChange={setTitle} placeholder="Vertimo pavadinimas" />
          <div className="wz-editor-wrap"><BlogEditor value={content} onChange={setContent} placeholder="Lietuviškas vertimas…" /></div>
        </div>,
      })
      steps.push({
        id: 'final', title: 'Antraštės nuotrauka', subtitle: 'Neprivaloma.',
        valid: true,
        node: <ImageUploadField value={coverUrl} onChange={setCoverUrl} label="Antraštės nuotrauka" />,
      })
    }

    else if (type === 'creation') {
      steps.push({
        id: 'subtype', title: 'Kūrybos rūšis',
        subtitle: 'Pasirink, jei tinka (neprivaloma).',
        valid: true,
        node: <ChoiceCards value={creationSubtype} onSelect={setCreationSubtype} choices={CREATION_SUBTYPES} />,
      })
      steps.push({
        id: 'write', title: 'Tavo kūrinys',
        subtitle: 'Pavadinimas ir tekstas.',
        valid: !!title.trim() && !!content.trim(),
        node: <div className="wz-stack">
          <TitleInput value={title} onChange={setTitle} placeholder="Kūrinio pavadinimas" />
          <div className="wz-editor-wrap"><BlogEditor value={content} onChange={setContent} placeholder="Pradėk kurti…" /></div>
        </div>,
      })
      steps.push({
        id: 'final', title: 'Antraštės nuotrauka', subtitle: 'Neprivaloma.',
        valid: true,
        node: <ImageUploadField value={coverUrl} onChange={setCoverUrl} label="Antraštės nuotrauka" />,
      })
    }

    else if (type === 'event') {
      steps.push({
        id: 'pick', title: 'Koks renginys?',
        subtitle: 'Pasirink renginį, kurį nori apžvelgti.',
        valid: !!eventTarget.event_id,
        node: <EventTargetField target={eventTarget} onChange={(t) => { setEventTarget(t); if (t.display) setTitle(prev => prev || t.display!.title) }} />,
      })
      steps.push({
        id: 'write', title: 'Tavo įspūdžiai',
        subtitle: 'Atmosfera, atlikėjai, garsas, publika…',
        valid: !!content.trim(),
        node: <div className="wz-stack">
          <VoiceRecorder context={buildVoiceContext()} onResult={appendVoiceText} />
          <div className="wz-editor-wrap"><BlogEditor value={content} onChange={setContent} placeholder="Aprašyk renginį…" /></div>
        </div>,
      })
      steps.push({
        id: 'final', title: 'Beveik baigta',
        subtitle: 'Pavadinimas ir nuotrauka.',
        valid: !!title.trim(),
        node: <FinalStep title={title} onTitle={setTitle} titlePlaceholder="Pvz. Mamontovo koncertas Žalgirio arenoje" coverUrl={coverUrl} onCover={setCoverUrl} />,
      })
    }

    else if (type === 'mood') {
      steps.push({
        id: 'pick', title: 'Nuotaikos daina',
        subtitle: 'Pasirink dainą, kuri rodysis tavo profilyje.',
        valid: !!songTarget,
        primaryLabel: 'Nustatyti',
        node: songTarget
          ? <SelectedEntityCard hit={songTarget} onClear={() => setSongTarget(null)} clearLabel="Keisti" />
          : <EntityPicker kind="track" onPick={(h) => setSongTarget(h)} autoFocus placeholder="Ieškok dainos…" />,
      })
    }

    else if (type === 'daily') {
      steps.push({
        id: 'pick', title: 'Dienos daina',
        subtitle: 'Pasiūlyk dainą šiandienos balsavimui.',
        valid: !!songTarget,
        node: songTarget
          ? <SelectedEntityCard hit={songTarget} onClear={() => setSongTarget(null)} clearLabel="Keisti" />
          : <EntityPicker kind="track" onPick={(h) => { setSongTarget(h); next() }} autoFocus placeholder="Ieškok dainos…" />,
      })
      steps.push({
        id: 'comment', title: 'Komentaras',
        subtitle: 'Kodėl siūlai šią dainą? (neprivaloma)',
        valid: true,
        primaryLabel: 'Pasiūlyti',
        node: <div className="wz-stack">
          {songTarget && <SelectedEntityCard hit={songTarget} onClear={() => { setSongTarget(null); setStepIdx(0) }} clearLabel="Keisti" />}
          <textarea
            value={dailyComment}
            onChange={e => setDailyComment(e.target.value)}
            placeholder="Trumpas komentaras…"
            rows={3}
            className="wz-textarea"
          />
        </div>,
      })
    }

    return steps
  }

  // ── Render gates ────────────────────────────────────────────────────────
  if (editId) {
    if (profileLoading) return <Loading />
    if (authError) return <AuthGate msg={authError} />
    if (!hasUsername) return <BootShell><UsernameSetupGate onReady={() => setHasUsername(true)} /></BootShell>
    return <EditPostForm editId={editId} />
  }

  if (profileLoading) return <Loading />
  if (authError) return <AuthGate msg={authError} />
  if (!hasUsername) return <UsernameSetupGate onReady={() => setHasUsername(true)} />

  // Type picker — pirmas overlay ekranas
  if (!type) {
    return (
      <WizardChrome stepIndex={0} totalSteps={1} title="Ką nori pridėti?" subtitle="Pasirink turinio tipą." onClose={close}>
        <div className="tp-grid">
          {TYPE_TILES.map(t => (
            <button key={t.type} type="button" className="tp-tile" onClick={() => { if (t.type === 'atradimas') { router.push('/muzikos-atradimai/pasidalink'); return } setType(t.type as WizType); setStepIdx(0); setError(null) }}>
              <span className="tp-ico">{t.icon}</span>
              <span className="tp-label">{t.label}</span>
              <span className="tp-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <style jsx>{`
          .tp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .tp-tile {
            display: flex; flex-direction: column; gap: 4px; text-align: left;
            padding: 16px; border-radius: 16px; cursor: pointer;
            background: var(--bg-elevated); border: 1px solid var(--border-subtle);
            transition: border-color .12s, transform .08s; -webkit-tap-highlight-color: transparent;
          }
          .tp-tile:active { transform: scale(.98); }
          .tp-tile:hover { border-color: var(--border-strong); }
          .tp-ico { color: var(--accent-orange); margin-bottom: 4px; }
          .tp-ico :global(svg) { width: 24px; height: 24px; }
          .tp-label { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 16px; color: var(--text-primary); }
          .tp-desc { font-size: 12px; color: var(--text-muted); line-height: 1.35; }
        `}</style>
      </WizardChrome>
    )
  }

  const steps = buildSteps()
  const safeIdx = Math.min(stepIdx, steps.length - 1)
  const step = steps[safeIdx]
  if (!step) return <Loading />
  const isLast = safeIdx === steps.length - 1
  const isBlog = !['mood', 'daily'].includes(type)

  const finalLabel = type === 'mood' ? 'Nustatyti' : type === 'daily' ? 'Pasiūlyti' : 'Publikuoti'
  const primaryLabel = step.primaryLabel || (isLast ? finalLabel : 'Toliau')

  const handlePrimary = () => {
    if (!step.valid) {
      setError('Užpildyk šį žingsnį, kad tęstum.')
      return
    }
    setError(null)
    if (!isLast) { next(); return }
    if (type === 'mood') submitMood()
    else if (type === 'daily') submitDaily()
    else submitBlog('published')
  }

  const handleBack = () => {
    setError(null)
    if (safeIdx > 0) setStepIdx(i => i - 1)
    else { setType(null); setStepIdx(0) }   // visada grįžtam į tipo pasirinkimą
  }

  return (
    <WizardChrome
      stepIndex={safeIdx}
      totalSteps={steps.length}
      title={step.title}
      subtitle={step.subtitle}
      onBack={handleBack}
      onClose={close}
      primaryLabel={primaryLabel}
      onPrimary={handlePrimary}
      primaryDisabled={!step.valid}
      primaryBusy={busy}
      secondaryLabel={isLast && isBlog ? 'Juodraštis' : undefined}
      onSecondary={isLast && isBlog ? () => submitBlog('draft') : undefined}
      error={error}
    >
      {step.node}
      <style jsx global>{`
        .wz-stack { display: flex; flex-direction: column; gap: 18px; }
        .wz-editor-wrap { margin-top: 8px; }
        .wz-textarea {
          width: 100%; border-radius: 12px; padding: 12px 14px; resize: vertical;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          color: var(--text-primary); font-size: 16px; outline: none; font-family: inherit;
        }
        .wz-textarea:focus { border-color: var(--accent-orange); }
      `}</style>
    </WizardChrome>
  )
}

// ── Small shared pieces ────────────────────────────────────────────────────
function TitleInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="wz-title-input"
      style={{
        width: '100%', padding: '10px 0', fontFamily: "'Outfit', sans-serif",
        fontSize: 'clamp(1.3rem,4.5vw,1.7rem)', fontWeight: 800, letterSpacing: '-.02em',
        color: 'var(--text-primary)', background: 'transparent', border: 'none',
        borderBottom: '2px solid var(--border-subtle)', outline: 'none',
      }}
    />
  )
}

function FinalStep({
  title, onTitle, titlePlaceholder, coverUrl, onCover, extra,
}: {
  title: string; onTitle: (v: string) => void; titlePlaceholder: string
  coverUrl: string; onCover: (v: string) => void; extra?: ReactNode
}) {
  return (
    <div className="wz-stack">
      <div>
        <FieldLabel>Pavadinimas</FieldLabel>
        <TitleInput value={title} onChange={onTitle} placeholder={titlePlaceholder} />
      </div>
      {extra}
      <div>
        <ImageUploadField value={coverUrl} onChange={onCover} label="Antraštės nuotrauka (neprivaloma)" />
      </div>
    </div>
  )
}

// ── Per-track review list (album review) ────────────────────────────────────
function TrackReviewList({
  items, loading, onChange,
}: { items: TrackReview[]; loading: boolean; onChange: (items: TrackReview[]) => void }) {
  if (loading) return <p style={{ color: 'var(--text-faint)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Kraunamos dainos…</p>
  if (items.length === 0) return <p style={{ color: 'var(--text-faint)', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Šio albumo dainų nerasta.</p>

  const set = (idx: number, patch: Partial<TrackReview>) => onChange(items.map((it, i) => i === idx ? { ...it, ...patch } : it))

  return (
    <div className="trl">
      {items.map((t, idx) => (
        <div key={idx} className="trl-row">
          <div className="trl-head">
            {t.image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={proxyImg(t.image_url)} alt="" className="trl-cover" />
              : <span className="trl-cover trl-cover-ph">🎵</span>}
            <div className="trl-meta">
              <span className="trl-num">{idx + 1}</span>
              <span className="trl-title">{t.title}</span>
            </div>
            {t.rating !== null && <span className="trl-badge">{t.rating}</span>}
          </div>
          <RatingControl value={t.rating} onChange={(v) => set(idx, { rating: v })} compact />
          <input
            value={t.comment}
            onChange={e => set(idx, { comment: e.target.value })}
            placeholder="Komentaras (neprivaloma)"
            className="trl-comment"
          />
        </div>
      ))}
      <style jsx>{`
        .trl { display: flex; flex-direction: column; gap: 10px; }
        .trl-row { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 12px; }
        .trl-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .trl-cover { width: 38px; height: 38px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .trl-cover-ph { display: flex; align-items: center; justify-content: center; background: var(--cover-placeholder); font-size: 16px; }
        .trl-meta { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
        .trl-num { font-family: 'Outfit', sans-serif; font-weight: 800; color: var(--text-faint); font-size: 14px; }
        .trl-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .trl-badge { flex-shrink: 0; background: var(--accent-orange); color: #fff; border-radius: 8px; padding: 2px 8px; font-weight: 800; font-size: 14px; font-family: 'Outfit', sans-serif; }
        .trl-comment {
          width: 100%; margin-top: 10px; border-radius: 9px; padding: 8px 11px;
          background: var(--bg-body); border: 1px solid var(--border-subtle); color: var(--text-secondary);
          font-size: 14px; outline: none;
        }
        .trl-comment:focus { border-color: var(--accent-orange); }
      `}</style>
    </div>
  )
}

// ── Topas entries (add one-by-one + reorder + comment) ──────────────────────
// Opaque full-screen shell — naudojamas boot/loading/gate būsenoms, kad nuo
// PIRMO kadro overlay dengtų svetainės chrome (jokio footerio mirktelėjimo).
function BootShell({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg-body)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <BootShell>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%',
          border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-orange)',
          animation: 'wzspin .7s linear infinite',
        }} />
      </div>
      <style jsx>{`@keyframes wzspin { to { transform: rotate(360deg); } }`}</style>
    </BootShell>
  )
}

function AuthGate({ msg }: { msg: string }) {
  return (
    <BootShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <p className="text-sm" style={{ color: '#fca5a5' }}>{msg}</p>
        <Link href="/auth/signin" className="text-xs font-bold" style={{ color: 'var(--accent-orange)' }}>Prisijungti →</Link>
      </div>
    </BootShell>
  )
}

export default function BlogEditorPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EditorInner />
    </Suspense>
  )
}
