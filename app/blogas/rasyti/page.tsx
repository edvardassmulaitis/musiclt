'use client'
// app/blogas/rasyti/page.tsx
//
// Multi-modal blog editor'ius — antra iteracija:
//   - Default'inis tipas: 'article' (Įrašas)
//   - Drop'inom 'quick' ir 'journal' — main idėjimas dabar pakankamai easy
//     pačiu Tiptap'u (URL paste virsta embed'u)
//   - Pridedam 'event' (Renginio apžvalga)
//   - Vertimas — tik dainos picker, jokio author/lang
//   - Tagai pašalinti iš UI (DB stulpelis lieka migration use'ui)
//   - Cover nuotrauka — perkelta į patį galą, optional, pervadinta

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BlogEditor } from '@/components/BlogEditor'
import { PostTypeSelector } from '@/components/blog/PostTypeSelector'
import type { BlogPostType } from '@/components/blog/post-types'
import { ImageUploadField } from '@/components/blog/ImageUploadField'
import { ReviewTargetField, type ReviewTarget } from '@/components/blog/ReviewTargetField'
import { TranslationField, type TranslationTarget } from '@/components/blog/TranslationField'
import { EventTargetField, type EventTarget } from '@/components/blog/EventTargetField'
import { ListEditorField, type ListItem } from '@/components/blog/ListEditorField'
import { UsernameSetupGate } from '@/components/blog/UsernameSetupGate'

type LoadedPost = {
  title?: string
  content?: string
  summary?: string
  cover_image_url?: string
  status?: 'draft' | 'published'
  post_type?: BlogPostType
  rating?: number | null
  target_artist_id?: number | null
  target_album_id?: number | null
  target_track_id?: number | null
  target_event_id?: string | null
  list_items?: ListItem[]
}

function EditorInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const initialType = searchParams.get('type') as BlogPostType | null

  const [profileLoading, setProfileLoading] = useState(true)
  const [hasUsername, setHasUsername] = useState(false)
  const [authError, setAuthError] = useState('')

  const [postType, setPostType] = useState<BlogPostType>(initialType || 'article')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coverUrl, setCoverUrl] = useState('')

  // Review state
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>({
    artist_id: null, album_id: null, track_id: null, display: null,
  })
  const [rating, setRating] = useState<number | null>(null)

  // Translation state — tik track picker
  const [translation, setTranslation] = useState<TranslationTarget>({
    track_id: null, display: null,
  })

  // Event state
  const [eventTarget, setEventTarget] = useState<EventTarget>({
    event_id: null, display: null,
  })

  // Topas state
  const [listItems, setListItems] = useState<ListItem[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/profile').then(async r => {
      if (r.status === 401) { setAuthError('Prisijunk, kad galėtum rašyti'); return }
      const p = await r.json()
      setHasUsername(!!p?.username)
    }).catch(() => setAuthError('Klaida kraunant profilį'))
      .finally(() => setProfileLoading(false))
  }, [])

  useEffect(() => {
    if (!editId) return
    fetch(`/api/blog/posts/${editId}`).then(r => r.json()).then((p: LoadedPost) => {
      if (!p?.title) return
      setTitle(p.title || '')
      setContent(p.content || '')
      setCoverUrl(p.cover_image_url || '')
      setPostType((p.post_type as BlogPostType) || 'article')
      setRating(p.rating ?? null)

      if (p.target_artist_id || p.target_album_id || p.target_track_id) {
        setReviewTarget({
          artist_id: p.target_artist_id ?? null,
          album_id: p.target_album_id ?? null,
          track_id: p.target_track_id ?? null,
          display: null,
        })
      }
      if (p.target_track_id && p.post_type === 'translation') {
        setTranslation({ track_id: p.target_track_id, display: null })
      }
      if (p.target_event_id) {
        setEventTarget({ event_id: p.target_event_id, display: null })
      }
      if (Array.isArray(p.list_items) && p.list_items.length > 0) {
        setListItems(p.list_items)
      }
    })
  }, [editId])

  const validate = useCallback((status: 'draft' | 'published'): string | null => {
    if (!title.trim()) return 'Įvesk pavadinimą'
    if (status === 'published' && postType === 'review') {
      const hasTarget = reviewTarget.artist_id || reviewTarget.album_id || reviewTarget.track_id
      if (!hasTarget) return 'Recenzijai pasirink atlikėją, albumą arba dainą'
      if (rating === null) return 'Recenzijai nustatyk balą'
    }
    if (status === 'published' && postType === 'translation') {
      if (!translation.track_id) return 'Vertimui pasirink dainą'
    }
    if (status === 'published' && postType === 'event') {
      if (!eventTarget.event_id) return 'Renginio apžvalgai pasirink renginį'
    }
    if (status === 'published' && postType === 'topas') {
      if (listItems.length < 2) return 'Topui pridėk bent 2 įrašus'
    }
    return null
  }, [postType, title, reviewTarget, rating, translation, eventTarget, listItems])

  async function handleSave(publishStatus: 'draft' | 'published') {
    const err = validate(publishStatus)
    if (err) { setError(err); return }
    setSaving(true); setError('')

    const body: any = {
      title: title.trim(),
      content,
      cover_image_url: coverUrl || null,
      status: publishStatus,
      post_type: postType,
    }

    if (postType === 'review') {
      body.rating = rating
      body.target_artist_id = reviewTarget.artist_id
      body.target_album_id = reviewTarget.album_id
      body.target_track_id = reviewTarget.track_id
    }

    if (postType === 'translation') {
      body.target_track_id = translation.track_id
    }

    if (postType === 'event') {
      body.target_event_id = eventTarget.event_id
    }

    if (postType === 'topas') {
      body.list_items = listItems
    }

    try {
      let res: Response
      if (editId) {
        res = await fetch(`/api/blog/posts/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/blog/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (res.ok) {
        router.push('/blogas/mano')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Klaida saugant')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (profileLoading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm" style={{ color: '#334058' }}>Kraunasi...</div>
  }

  if (authError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-400">{authError}</p>
        <Link href="/auth/signin" className="text-xs font-bold text-[#f97316] hover:underline">Prisijungti →</Link>
      </div>
    )
  }

  if (!hasUsername) {
    return <UsernameSetupGate onReady={() => setHasUsername(true)} />
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <Link href="/blogas/mano" className="text-xs hover:text-white transition" style={{ color: '#5e7290' }}>← Mano įrašai</Link>
        <div className="flex gap-2">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-3 py-1 rounded-full text-xs font-bold transition disabled:opacity-40"
            style={{ color: '#b0bdd4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {saving ? '...' : 'Juodraštis'}
          </button>
          <button
            onClick={() => handleSave('published')}
            disabled={saving}
            className="px-3 py-1 rounded-full text-xs font-bold text-white bg-[#f97316] hover:bg-[#ea580c] transition disabled:opacity-40"
          >
            {saving ? '...' : 'Publikuoti'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      <PostTypeSelector value={postType} onChange={setPostType} />

      {/* Tipo specifinė forma */}
      {postType === 'review' && (
        <ReviewTargetField
          target={reviewTarget}
          rating={rating}
          onTargetChange={setReviewTarget}
          onRatingChange={setRating}
        />
      )}

      {postType === 'translation' && (
        <TranslationField target={translation} onChange={setTranslation} />
      )}

      {postType === 'event' && (
        <EventTargetField target={eventTarget} onChange={setEventTarget} />
      )}

      {postType === 'topas' && (
        <ListEditorField items={listItems} onChange={setListItems} />
      )}

      {/* Pavadinimas */}
      <div className="mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
          Pavadinimas
        </label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={titlePlaceholder(postType)}
          className="w-full px-3 py-2.5 text-2xl font-bold rounded-lg outline-none focus:border-[#f97316]/30 transition"
          style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.02em', color: '#f2f4f8', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        />
      </div>

      {/* Content */}
      <BlogEditor
        value={content}
        onChange={setContent}
        placeholder={contentPlaceholder(postType)}
      />

      {/* Antraštės nuotrauka — perkelta į galą, optional */}
      <div className="mt-8">
        <ImageUploadField value={coverUrl} onChange={setCoverUrl} label="Antraštės nuotrauka" />
      </div>
    </div>
  )
}

function titlePlaceholder(type: BlogPostType): string {
  switch (type) {
    case 'review':      return 'Recenzijos pavadinimas'
    case 'translation': return 'Vertimo pavadinimas'
    case 'creation':    return 'Kūrinio pavadinimas'
    case 'event':       return 'Pvz. Andriaus Mamontovo koncertas Žalgirio arenoje'
    case 'topas':       return 'Pvz. Mano TOP 10 LT albumų 2025'
    case 'article':
    default:            return 'Įrašo pavadinimas'
  }
}

function contentPlaceholder(type: BlogPostType): string {
  switch (type) {
    case 'review':      return 'Įspūdžiai apie albumą/dainą...'
    case 'translation': return 'Lietuviškas vertimas...'
    case 'creation':    return 'Pradėk kurti...'
    case 'event':       return 'Aprašyk renginį — atmosferą, atlikėjus, įspūdžius...'
    case 'topas':       return 'Įžanga ir konteksto paaiškinimas (neprivaloma)...'
    case 'article':
    default:            return 'Įklijuok YouTube/Spotify nuorodą — auto-embed. Numesk nuotrauką — auto-upload.'
  }
}

export default function BlogEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm" style={{ color: '#334058' }}>Kraunasi...</div>}>
      <EditorInner />
    </Suspense>
  )
}
