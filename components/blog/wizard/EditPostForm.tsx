'use client'
// components/blog/wizard/EditPostForm.tsx
//
// Redagavimo režimas (?id=...). Wizard'as skirtas KŪRIMUI — redaguojant
// rodom kompaktišką vieno ekrano formą su jau egzistuojančiais laukų
// komponentais. Tipas nebekeičiamas (jis fiksuotas po sukūrimo).

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BlogEditor } from '@/components/BlogEditor'
import { ImageUploadField } from '@/components/blog/ImageUploadField'
import { ReviewTargetField, type ReviewTarget } from '@/components/blog/ReviewTargetField'
import { TranslationField, type TranslationTarget } from '@/components/blog/TranslationField'
import { EventTargetField, type EventTarget } from '@/components/blog/EventTargetField'
import { ListEditorField, type ListItem } from '@/components/blog/ListEditorField'
import type { BlogPostType } from '@/components/blog/post-types'
import { cleanLegacyBlogHtml } from '@/lib/blog-html-clean'

type LoadedPost = {
  title?: string
  content?: string
  cover_image_url?: string
  post_type?: BlogPostType
  rating?: number | null
  target_artist_id?: number | null
  target_album_id?: number | null
  target_track_id?: number | null
  target_event_id?: string | null
  list_items?: ListItem[]
}

const TYPE_LABEL: Record<string, string> = {
  article: 'Įrašas', review: 'Recenzija', topas: 'Topas',
  translation: 'Vertimas', creation: 'Kūryba', event: 'Renginys',
}

export function EditPostForm({ editId }: { editId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [postType, setPostType] = useState<BlogPostType>('article')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>({ artist_id: null, album_id: null, track_id: null, display: null })
  const [translation, setTranslation] = useState<TranslationTarget>({ track_id: null, display: null })
  const [eventTarget, setEventTarget] = useState<EventTarget>({ event_id: null, display: null })
  const [listItems, setListItems] = useState<ListItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/blog/posts/${editId}`).then(r => r.json()).then((p: LoadedPost) => {
      setTitle(p.title || '')
      // Nuvalom seną legacy „šiukšlinį" turinį (favorite-widget, javascript:
      // nuorodos, sulūžę thumb'ai), kad redaktoriuje nebūtų [?] ir mirusių mygtukų.
      setContent(cleanLegacyBlogHtml(p.content || ''))
      setCoverUrl(p.cover_image_url || '')
      setPostType((p.post_type as BlogPostType) || 'article')
      setRating(p.rating ?? null)
      if (p.target_artist_id || p.target_album_id || p.target_track_id) {
        setReviewTarget({ artist_id: p.target_artist_id ?? null, album_id: p.target_album_id ?? null, track_id: p.target_track_id ?? null, display: null })
      }
      if (p.target_track_id && p.post_type === 'translation') setTranslation({ track_id: p.target_track_id, display: null })
      if (p.target_event_id) setEventTarget({ event_id: p.target_event_id, display: null })
      if (Array.isArray(p.list_items) && p.list_items.length > 0) setListItems(p.list_items)
    }).finally(() => setLoading(false))
  }, [editId])

  const save = useCallback(async (status: 'draft' | 'published') => {
    if (!title.trim()) { setError('Įvesk pavadinimą'); return }
    setSaving(true); setError('')
    const body: any = { title: title.trim(), content, cover_image_url: coverUrl || null, status, post_type: postType }
    if (postType === 'review') {
      body.rating = rating
      body.target_artist_id = reviewTarget.artist_id
      body.target_album_id = reviewTarget.album_id
      body.target_track_id = reviewTarget.track_id
      if (listItems.length > 0) body.list_items = listItems
    }
    if (postType === 'translation') body.target_track_id = translation.track_id
    if (postType === 'event') body.target_event_id = eventTarget.event_id
    if (postType === 'topas') body.list_items = listItems
    try {
      const res = await fetch(`/api/blog/posts/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) router.push('/blogas/mano')
      else { const d = await res.json().catch(() => ({})); setError(d?.error || 'Klaida saugant') }
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }, [editId, title, content, coverUrl, postType, rating, reviewTarget, translation, eventTarget, listItems, router])

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm" style={{ color: 'var(--text-faint)' }}>Kraunasi…</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <Link href="/blogas/mano" className="text-xs hover:opacity-80 transition" style={{ color: 'var(--text-muted)' }}>← Mano įrašai</Link>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
          Redaguoji · {TYPE_LABEL[postType] || postType}
        </span>
      </div>

      {error && <div className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>{error}</div>}

      {/* 1) Pavadinimas — pirmas, kaip įprasta dokumentų redaktoriuose */}
      <div className="mb-5">
        <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>Pavadinimas</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Įrašo pavadinimas…"
          className="w-full px-3 py-2.5 text-xl sm:text-2xl font-bold rounded-lg outline-none transition"
          style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.02em', color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        />
      </div>

      {/* 2) Tipui būdingas laukas (recenzija/vertimas/renginys/topas) */}
      {postType === 'review' && <ReviewTargetField target={reviewTarget} rating={rating} onTargetChange={setReviewTarget} onRatingChange={setRating} />}
      {postType === 'translation' && <TranslationField target={translation} onChange={setTranslation} />}
      {postType === 'event' && <EventTargetField target={eventTarget} onChange={setEventTarget} />}
      {postType === 'topas' && <ListEditorField items={listItems} onChange={setListItems} />}

      {/* 3) Tekstas */}
      <div className="mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
          {postType === 'topas' ? 'Įžanga' : postType === 'translation' ? 'Vertimas' : 'Tekstas'}
        </label>
        <BlogEditor value={content} onChange={setContent} />
      </div>

      {/* 4) Antraštės nuotrauka */}
      <div className="mt-6">
        <ImageUploadField value={coverUrl} onChange={setCoverUrl} label="Antraštės nuotrauka" />
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={() => save('draft')} disabled={saving} className="px-4 py-2 rounded-full text-xs font-bold transition disabled:opacity-40" style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          {saving ? '…' : 'Juodraštis'}
        </button>
        <button onClick={() => save('published')} disabled={saving} className="px-5 py-2 rounded-full text-xs font-bold text-white transition disabled:opacity-40" style={{ background: 'var(--accent-orange)' }}>
          {saving ? '…' : 'Išsaugoti'}
        </button>
      </div>
    </div>
  )
}
