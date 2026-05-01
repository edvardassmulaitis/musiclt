'use client'
// app/blogas/rasyti/page.tsx
//
// Multi-modal blog editor'ius — supaprastintas UI matching /blogas/mano
// stiliaus. Vienas accent (orange), minimalūs spalvoti box'ai, paprastesnis
// flow.

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BlogEditor } from '@/components/BlogEditor'
import { PostTypeSelector } from '@/components/blog/PostTypeSelector'
import type { BlogPostType } from '@/components/blog/post-types'
import { TagInput } from '@/components/blog/TagInput'
import { ImageUploadField } from '@/components/blog/ImageUploadField'
import { QuickEmbedField, type QuickEmbed } from '@/components/blog/QuickEmbedField'
import { ReviewTargetField, type ReviewTarget } from '@/components/blog/ReviewTargetField'
import { TranslationField, type TranslationMeta } from '@/components/blog/TranslationField'
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
  original_url?: string | null
  original_author?: string | null
  original_lang?: string | null
  embed_url?: string | null
  embed_type?: string | null
  embed_thumbnail_url?: string | null
  embed_title?: string | null
  embed_html?: string | null
  tags?: string[]
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
  const [summary, setSummary] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const [embed, setEmbed] = useState<QuickEmbed | null>(null)

  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>({
    artist_id: null, album_id: null, track_id: null, display: null,
  })
  const [rating, setRating] = useState<number | null>(null)

  const [translation, setTranslation] = useState<TranslationMeta>({
    original_url: '', original_author: '', original_lang: '',
  })

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
      if (!p?.title && !p?.embed_url) return
      setTitle(p.title || '')
      setContent(p.content || '')
      setSummary(p.summary || '')
      setCoverUrl(p.cover_image_url || '')
      setPostType((p.post_type as BlogPostType) || 'article')
      setTags(p.tags || [])
      setRating(p.rating ?? null)

      if (p.embed_url) {
        setEmbed({
          embed_url: p.embed_url,
          embed_type: p.embed_type || 'other',
          embed_title: p.embed_title || null,
          embed_thumbnail_url: p.embed_thumbnail_url || null,
          embed_html: p.embed_html || null,
        })
      }

      if (p.target_artist_id || p.target_album_id || p.target_track_id) {
        setReviewTarget({
          artist_id: p.target_artist_id ?? null,
          album_id: p.target_album_id ?? null,
          track_id: p.target_track_id ?? null,
          display: null,
        })
      }

      if (p.original_url || p.original_author || p.original_lang) {
        setTranslation({
          original_url: p.original_url || '',
          original_author: p.original_author || '',
          original_lang: p.original_lang || '',
        })
      }
    })
  }, [editId])

  const validate = useCallback((status: 'draft' | 'published'): string | null => {
    if (postType === 'quick') {
      if (!embed?.embed_url) return 'Įklijuok video/audio nuorodą'
    } else {
      if (!title.trim()) return 'Įvesk pavadinimą'
    }
    if (status === 'published' && postType === 'review') {
      const hasTarget = reviewTarget.artist_id || reviewTarget.album_id || reviewTarget.track_id
      if (!hasTarget) return 'Recenzijai pasirink atlikėją, albumą arba dainą'
      if (rating === null) return 'Recenzijai nustatyk balą'
    }
    if (status === 'published' && postType === 'translation') {
      if (!translation.original_url.trim()) return 'Vertimui pridėk nuorodą į originalą'
    }
    return null
  }, [postType, embed, title, reviewTarget, rating, translation])

  async function handleSave(publishStatus: 'draft' | 'published') {
    const err = validate(publishStatus)
    if (err) { setError(err); return }
    setSaving(true); setError('')

    const body: any = {
      title: title.trim(),
      content,
      summary: summary.trim() || null,
      cover_image_url: coverUrl || null,
      status: publishStatus,
      post_type: postType,
      tags,
    }

    if (postType === 'quick' && embed) {
      body.embed_url = embed.embed_url
      body.embed_type = embed.embed_type
      body.embed_title = embed.embed_title
      body.embed_thumbnail_url = embed.embed_thumbnail_url
      body.embed_html = embed.embed_html
      if (!title.trim()) body.title = embed.embed_title || ''
    }

    if (postType === 'review') {
      body.rating = rating
      body.target_artist_id = reviewTarget.artist_id
      body.target_album_id = reviewTarget.album_id
      body.target_track_id = reviewTarget.track_id
    }

    if (postType === 'translation') {
      body.original_url = translation.original_url.trim() || null
      body.original_author = translation.original_author.trim() || null
      body.original_lang = translation.original_lang || null
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

      {postType === 'quick' ? (
        <>
          <QuickEmbedField value={embed} onChange={setEmbed} />

          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={embed?.embed_title || 'Trumpas pavadinimas (neprivaloma)'}
            className="w-full text-lg font-bold bg-transparent border-none outline-none mb-3"
            style={{ fontFamily: "'Outfit', sans-serif", color: '#f2f4f8' }}
          />

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            placeholder="1-2 sakiniai (neprivaloma)..."
            className="w-full text-sm bg-transparent border-none outline-none resize-none mb-6"
            style={{ color: '#b0bdd4' }}
          />
        </>
      ) : (
        <>
          {postType === 'review' && (
            <ReviewTargetField
              target={reviewTarget}
              rating={rating}
              onTargetChange={setReviewTarget}
              onRatingChange={setRating}
            />
          )}

          {postType === 'translation' && (
            <TranslationField value={translation} onChange={setTranslation} />
          )}

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

          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
              Santrauka <span className="font-normal text-[#334058] normal-case">(neprivaloma — rodoma feed sąraše)</span>
            </label>
            <input
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="1-2 sakiniai apie ką šis įrašas"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none focus:border-[#f97316]/30 transition"
              style={{ color: '#dde8f8', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          </div>

          <div className="mb-6">
            <ImageUploadField value={coverUrl} onChange={setCoverUrl} />
          </div>

          <BlogEditor
            value={content}
            onChange={setContent}
            placeholder={contentPlaceholder(postType)}
          />
        </>
      )}

      <div className="mt-8">
        <TagInput value={tags} onChange={setTags} />
      </div>
    </div>
  )
}

function titlePlaceholder(type: BlogPostType): string {
  switch (type) {
    case 'review':      return 'Recenzijos pavadinimas'
    case 'translation': return 'Vertimo pavadinimas'
    case 'creation':    return 'Kūrinio pavadinimas'
    case 'journal':     return 'Dienoraščio antraštė'
    case 'article':
    default:            return 'Straipsnio pavadinimas'
  }
}

function contentPlaceholder(type: BlogPostType): string {
  switch (type) {
    case 'review':      return 'Įspūdžiai apie albumą/dainą...'
    case 'translation': return 'Lietuviškas vertimas...'
    case 'creation':    return 'Pradėk kurti...'
    case 'journal':     return 'Kas šiandien nutiko...'
    case 'article':
    default:            return 'Pradėk rašyti...'
  }
}

export default function BlogEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm" style={{ color: '#334058' }}>Kraunasi...</div>}>
      <EditorInner />
    </Suspense>
  )
}
