'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createPortal } from 'react-dom'

type ThreadRow = {
  legacy_id: number
  slug: string | null
  source_url: string | null
  kind: string | null
  title: string | null
  post_count: number | null
  pagination_count: number | null
  first_post_at: string | null
  last_post_at: string | null
  like_count: number | null
  artist_id: number | null
}

type PostRow = {
  legacy_id: number
  page_number: number | null
  author_username: string | null
  author_numeric_id: number | null
  created_at: string | null
  content_html: string | null
  content_text: string | null
  like_count: number | null
}

type ArtistLink = { id: number; slug: string; name: string; cover_image_url: string | null }

type MusicAttachment = {
  type: 'daina' | 'albumas' | 'grupe'
  legacy_id: number
  title: string | null
  artist: string | null
  image_url: string | null
  fav_count: number | null
}

type ResolvedMap = Record<string, { slug: string; id: number }>

type CurrentUser = { email: string | null; name: string | null; image: string | null } | null

type Props = {
  thread: ThreadRow
  posts: PostRow[]
  avatars: Record<string, string>
  attachmentSlugs: ResolvedMap
  artist: ArtistLink | null
  isAdmin: boolean
  currentUser: CurrentUser
  sortParam: string
}

const LT_MONTHS = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
]

function formatLtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const m = LT_MONTHS[d.getUTCMonth()]
  const day = d.getUTCDate()
  const hh = d.getUTCHours().toString().padStart(2, '0')
  const mm = d.getUTCMinutes().toString().padStart(2, '0')
  return `${y} m. ${m} ${day} d. ${hh}:${mm}`
}

function strHash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function Avatar({ username, url, size = 40 }: { username: string; url?: string | null; size?: number }) {
  const initial = username[0]?.toUpperCase() || '?'
  if (url) {
    return (
      <img
        src={url}
        alt={username}
        referrerPolicy="no-referrer"
        style={{
          width: size, height: size, borderRadius: '50%',
          border: '1px solid var(--border-subtle)', objectFit: 'cover',
          flexShrink: 0, background: 'var(--bg-elevated)',
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `hsl(${strHash(username) % 360}, 40%, 22%)`,
        color: `hsl(${strHash(username) % 360}, 60%, 62%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: size * 0.42, fontWeight: 800,
        fontFamily: 'Outfit,sans-serif',
      }}
    >{initial}</div>
  )
}

function sanitizePostHtml(html: string): string {
  if (!html) return ''
  let s = html
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<form[\s\S]*?<\/form>/gi, '')
  s = s.replace(/<input[^>]*>/gi, '')
  s = s.replace(/<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi, (m, attrs: string) => {
    const srcMatch = attrs.match(/src="([^"]+)"/i)
    if (!srcMatch) return ''
    const src = srcMatch[1]
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//.test(src)) return ''
    return `<iframe src="${src}" width="560" height="315" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
  })
  s = s.replace(/\son\w+="[^"]*"/gi, '')
  s = s.replace(/\son\w+='[^']*'/gi, '')
  s = s.replace(/javascript:/gi, '')
  s = s.replace(/href="\/user\/([^"]+)"/g, 'href="/vartotojas/ghost/$1"')
  s = s.replace(/<div\s+class="post_actions"[\s\S]*?<\/div>/gi, '')
  return s
}

function splitAttachments(html: string): { cleanHtml: string; attachments: MusicAttachment[] } {
  if (!html) return { cleanHtml: '', attachments: [] }
  const match = html.match(/<div class="music-attachments" data-items='([^']*)'><\/div>/)
  if (!match) return { cleanHtml: html, attachments: [] }
  let items: MusicAttachment[] = []
  try {
    items = JSON.parse(match[1].replace(/&apos;/g, "'"))
  } catch {
    items = []
  }
  return { cleanHtml: html.replace(match[0], ''), attachments: items }
}

function AttachmentCard({ a, resolved }: { a: MusicAttachment; resolved?: { slug: string; id: number } }) {
  const kindLabel = a.type === 'daina' ? 'Daina' : a.type === 'albumas' ? 'Albumas' : 'Atlikėjas'
  const tint = a.type === 'daina' ? '#3b82f6' : a.type === 'albumas' ? '#f97316' : '#a855f7'
  const href = resolved
    ? a.type === 'daina'
      ? `/lt/daina/${resolved.slug}/${resolved.id}`
      : a.type === 'albumas'
      ? `/lt/albumas/${resolved.slug}/${resolved.id}`
      : `/atlikejai/${resolved.slug}`
    : null
  const body = (
    <>
      {a.image_url ? (
        <img
          src={a.image_url}
          alt={a.title || 'attachment'}
          referrerPolicy="no-referrer"
          style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }}
        />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 6, background: `${tint}22`, flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 9, color: tint, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'Outfit,sans-serif' }}>
          {kindLabel}
          {typeof a.fav_count === 'number' && a.fav_count > 0 && <> · ♥ {a.fav_count}</>}
          {!href && <span style={{ marginLeft: 6, color: 'var(--text-faint)', fontWeight: 600 }}>· archyvas</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.title || `#${a.legacy_id}`}
        </div>
        {a.artist && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {a.artist}
          </div>
        )}
      </div>
    </>
  )
  const baseStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 10,
    background: 'var(--card-bg)',
    border: '1px solid var(--border-subtle)',
    textDecoration: 'none', minWidth: 220, flex: '1 1 220px',
    opacity: href ? 1 : 0.6, cursor: href ? 'pointer' : 'default',
  }
  return href ? (
    <Link href={href} style={baseStyle}>{body}</Link>
  ) : (
    <div style={baseStyle}>{body}</div>
  )
}

export default function ThreadPageClient({
  thread, posts, avatars, attachmentSlugs, artist, isAdmin, currentUser, sortParam,
}: Props) {
  const [sort, setSort] = useState<'asc' | 'desc'>(sortParam === 'asc' ? 'asc' : 'desc')
  const [adminModalOpen, setAdminModalOpen] = useState(false)

  const orderedPosts = useMemo(() => {
    const arr = [...posts]
    arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return sort === 'desc' ? tb - ta : ta - tb
    })
    return arr
  }, [posts, sort])

  const title = thread.title || (thread.slug || '').replace(/\/$/, '').replace(/-/g, ' ')
  const firstAt = thread.first_post_at
  const lastAt = thread.last_post_at
  const postCount = thread.post_count ?? posts.length
  const threadLikes = thread.like_count ?? 0

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        .post-body img { max-width: 100%; height: auto; border-radius: 6px; vertical-align: middle; }
        .post-body img[src*="/emotions/"], .post-body img[src*="/smiles/"] { display: inline-block; width: 20px; height: 20px; vertical-align: text-bottom; }
        .post-body iframe { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .post-body p { margin: 0 0 8px; }
        .post-body a { color: #f97316; }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Back-link to artist */}
        {artist && (
          <Link
            href={`/atlikejai/${artist.slug}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
              color: 'var(--text-muted)', textDecoration: 'none',
              padding: '6px 10px', borderRadius: 100,
              border: '1px solid var(--border-subtle)',
              marginBottom: 18, fontFamily: 'Outfit,sans-serif',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {artist.name}
          </Link>
        )}

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <h1 style={{
            flex: 1, fontFamily: 'Outfit,sans-serif', fontSize: '2.2rem', fontWeight: 900,
            lineHeight: 1.15, letterSpacing: '-.02em', margin: '0 0 10px',
            color: 'var(--text-primary)',
          }}>
            {title}
          </h1>
          {isAdmin && (
            <button
              onClick={() => setAdminModalOpen(true)}
              aria-label="Admin informacija"
              title="Admin info"
              style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                background: 'var(--card-bg)', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>
            </button>
          )}
        </div>

        {/* Meta: post count, likes, dates, sort */}
        <div style={{
          display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
          fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 600,
          marginBottom: 24,
        }}>
          {postCount > 0 && <span>{postCount} komentarai</span>}
          {threadLikes > 0 && (
            <span style={{ color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              ♥ {threadLikes} patinka
            </span>
          )}
          {firstAt && <span>Pradžia: {formatLtDate(firstAt)}</span>}
          {lastAt && firstAt !== lastAt && <span>Paskutinė: {formatLtDate(lastAt)}</span>}
        </div>

        {/* Reply form */}
        <ReplyForm currentUser={currentUser} threadLegacyId={thread.legacy_id} />

        {/* Sort toggle */}
        {orderedPosts.length > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12, fontFamily: 'Outfit,sans-serif',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Komentarai
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 100, overflow: 'hidden' }}>
              {(['desc', 'asc'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSort(v)}
                  style={{
                    padding: '5px 12px', fontSize: 10, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: sort === v ? '#f97316' : 'var(--card-bg)',
                    color: sort === v ? '#fff' : 'var(--text-secondary)',
                    fontFamily: 'Outfit,sans-serif',
                  }}
                >
                  {v === 'desc' ? 'Naujausi' : 'Seniausi'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comments list */}
        {orderedPosts.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '28px 26px',
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Šioje diskusijoje kol kas nėra komentarų.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {orderedPosts.map((p) => {
              const { cleanHtml, attachments } = splitAttachments(p.content_html ?? p.content_text ?? '')
              return (
                <div
                  key={p.legacy_id}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    padding: '16px 20px',
                    display: 'flex', gap: 14,
                  }}
                >
                  <Avatar username={p.author_username ?? '?'} url={avatars[p.author_username ?? ''] ?? null} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                      marginBottom: 6,
                    }}>
                      <Link
                        href={`/vartotojas/ghost/${encodeURIComponent(p.author_username ?? '')}`}
                        style={{
                          fontSize: 14, fontWeight: 800, color: '#f97316',
                          textDecoration: 'none', fontFamily: 'Outfit,sans-serif',
                        }}
                      >
                        {p.author_username ?? 'nežinomas'}
                      </Link>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {formatLtDate(p.created_at)}
                      </span>
                      {(p.like_count ?? 0) > 0 && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, color: '#f97316', fontWeight: 700,
                          padding: '2px 8px', borderRadius: 100,
                          background: 'rgba(249,115,22,.1)',
                        }}>
                          ♥ {p.like_count}
                        </span>
                      )}
                    </div>
                    <div
                      className="post-body"
                      style={{
                        fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)',
                        wordBreak: 'break-word',
                      }}
                      dangerouslySetInnerHTML={{ __html: sanitizePostHtml(cleanHtml) }}
                    />
                    {attachments.length > 0 && (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8,
                        marginTop: 10,
                      }}>
                        {attachments.map((a, idx) => (
                          <AttachmentCard
                            key={`${a.type}-${a.legacy_id}-${idx}`}
                            a={a}
                            resolved={attachmentSlugs[`${a.type}:${a.legacy_id}`]}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Admin meta modal */}
      {adminModalOpen && isAdmin && (
        <AdminInfoModal thread={thread} onClose={() => setAdminModalOpen(false)} />
      )}
    </div>
  )
}

function AdminInfoModal({ thread, onClose }: { thread: ThreadRow; onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 460,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 16, padding: 22, fontFamily: 'Outfit,sans-serif',
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: '#f97316', textTransform: 'uppercase', marginBottom: 4 }}>
          Admin info
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>
          music.lt #{thread.legacy_id}
        </div>
        <Row label="Rūšis" value={thread.kind ?? '—'} />
        <Row label="Slug" value={thread.slug ?? '—'} />
        <Row label="Posts" value={String(thread.post_count ?? 0)} />
        <Row label="Puslapiai" value={String(thread.pagination_count ?? 1)} />
        <Row label="Likes" value={String(thread.like_count ?? 0)} />
        {thread.source_url && (
          <div style={{ marginTop: 14 }}>
            <a href={thread.source_url} target="_blank" rel="noopener noreferrer"
               style={{ color: '#f97316', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Atidaryti originalą music.lt →
            </a>
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '9px 16px', borderRadius: 100,
            border: '1px solid var(--border-subtle)', background: 'var(--card-bg)',
            color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >Uždaryti</button>
      </div>
    </div>,
    document.body,
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '6px 0', borderBottom: '1px solid var(--border-subtle)',
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

type SearchHit = {
  type: 'daina' | 'albumas' | 'grupe'
  id: number
  legacy_id: number | null
  slug: string
  title: string
  artist: string | null
  image_url: string | null
}

function ReplyForm({ currentUser, threadLegacyId }: { currentUser: CurrentUser; threadLegacyId: number }) {
  const [text, setText] = useState('')
  const [attached, setAttached] = useState<SearchHit[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const runSearch = async (q: string) => {
    setSearchTerm(q)
    if (q.trim().length < 2) { setHits([]); return }
    setSearching(true)
    try {
      const r = await fetch(`/api/search-entities?q=${encodeURIComponent(q)}`)
      const data = await r.json()
      setHits((data.results as SearchHit[]) || [])
    } catch {
      setHits([])
    }
    setSearching(false)
  }

  const addAttachment = (h: SearchHit) => {
    if (attached.some((a) => a.type === h.type && a.id === h.id)) return
    setAttached((prev) => [...prev, h])
    setSearchTerm('')
    setHits([])
  }
  const removeAttachment = (h: SearchHit) => {
    setAttached((prev) => prev.filter((a) => !(a.type === h.type && a.id === h.id)))
  }

  const submit = async () => {
    if (!text.trim() && attached.length === 0) {
      setError('Įrašyk komentarą arba pridėk muziką.')
      return
    }
    setError('')
    setSending(true)
    try {
      const r = await fetch('/api/forum-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_legacy_id: threadLegacyId, text, attachments: attached }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Klaida')
      setSuccess(true)
      setText('')
      setAttached([])
      setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Klaida')
    }
    setSending(false)
  }

  if (!currentUser) {
    return (
      <div style={{
        padding: '14px 18px', borderRadius: 12,
        border: '1px dashed var(--border-subtle)',
        background: 'var(--bg-surface)',
        fontSize: 13, color: 'var(--text-muted)',
        marginBottom: 22, fontFamily: 'Outfit,sans-serif',
      }}>
        <Link href="/auth/signin" style={{ color: '#f97316', fontWeight: 700 }}>Prisijunk</Link>, kad galėtum komentuoti.
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 12, padding: '14px 16px',
      marginBottom: 22, fontFamily: 'Outfit,sans-serif',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {currentUser.image ? (
          <img
            src={currentUser.image}
            alt={currentUser.name || 'You'}
            referrerPolicy="no-referrer"
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }}
          />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Rašyk komentarą…"
            rows={3}
            style={{
              width: '100%', resize: 'vertical', minHeight: 72,
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-body)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: "'DM Sans',sans-serif", fontSize: 14,
              outline: 'none',
            }}
          />

          {/* Search */}
          <div style={{ marginTop: 10, position: 'relative' }}>
            <input
              value={searchTerm}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="+ Pridėk dainą / albumą / atlikėją…"
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                background: 'var(--bg-body)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                fontFamily: "'DM Sans',sans-serif",
              }}
            />
            {hits.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                marginTop: 4, background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                maxHeight: 260, overflowY: 'auto',
              }}>
                {hits.map((h) => (
                  <button
                    key={`${h.type}-${h.id}`}
                    onClick={() => addAttachment(h)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', border: 'none', background: 'transparent',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {h.image_url ? (
                      <img src={h.image_url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--card-bg)', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        {h.type === 'daina' ? 'Daina' : h.type === 'albumas' ? 'Albumas' : 'Atlikėjas'}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
                      {h.artist && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.artist}</div>
                      )}
                    </div>
                  </button>
                ))}
                {searching && <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}>Ieškau…</div>}
              </div>
            )}
          </div>

          {/* Attached chips */}
          {attached.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {attached.map((a) => (
                <div
                  key={`${a.type}-${a.id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', borderRadius: 100,
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ color: a.type === 'daina' ? '#3b82f6' : a.type === 'albumas' ? '#f97316' : '#a855f7', fontWeight: 800, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {a.type === 'daina' ? 'Daina' : a.type === 'albumas' ? 'Albumas' : 'Atlikėjas'}
                  </span>
                  <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title}
                  </span>
                  <button
                    onClick={() => removeAttachment(a)}
                    aria-label="Pašalinti"
                    style={{
                      width: 16, height: 16, borderRadius: '50%',
                      border: 'none', background: 'transparent',
                      color: 'var(--text-muted)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Submit bar */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            {error && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{error}</span>}
            {success && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>Išsiųsta ✓</span>}
            <button
              onClick={submit}
              disabled={sending}
              style={{
                padding: '7px 18px', borderRadius: 100,
                border: 'none', background: sending ? 'var(--card-bg)' : '#f97316',
                color: sending ? 'var(--text-muted)' : '#fff',
                fontSize: 12, fontWeight: 800, cursor: sending ? 'default' : 'pointer',
                fontFamily: 'Outfit,sans-serif',
              }}
            >
              {sending ? 'Siunčiu…' : 'Paskelbti'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
