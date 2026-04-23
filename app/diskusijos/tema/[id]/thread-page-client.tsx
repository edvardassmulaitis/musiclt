'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import LikesModal, { type LikeUser } from '@/components/LikesModal'

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
  author_avatar_url: string | null
  created_at: string | null
  content_html: string | null
  content_text: string | null
  like_count: number | null
  parent_post_legacy_id: number | null
}

type ArtistLink = {
  id: number
  slug: string
  name: string
  cover_image_url: string | null
  cover_image_wide_url: string | null
  legacy_id: number | null
}

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
  threadLikers: LikeUser[]
  postLikers: Record<number, LikeUser[]>
  isAdmin: boolean
  currentUser: CurrentUser
  sortParam: string
}

/** Unambiguous Lithuanian relative time — full words so "m." (minučių?) can't be confused with "m." (metų). */
function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'ką tik'
  const m = Math.floor(s / 60)
  if (m < 60) return `prieš ${m} ${plural(m, ['minutę', 'minutes', 'minučių'])}`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} ${plural(h, ['valandą', 'valandas', 'valandų'])}`
  const d = Math.floor(h / 24)
  if (d < 30) return `prieš ${d} ${plural(d, ['dieną', 'dienas', 'dienų'])}`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `prieš ${mo} ${plural(mo, ['mėnesį', 'mėnesius', 'mėnesių'])}`
  const y = Math.floor(d / 365)
  return `prieš ${y} ${plural(y, ['metus', 'metus', 'metų'])}`
}

/** Lithuanian noun declension: ends in 1 → singular, ends in 2..9 → dual (except 11..19), else plural-gen. */
function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 10 || mod100 > 20)) return forms[1]
  return forms[2]
}

function fullDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function strHash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function Avatar({ username, url, size = 32 }: { username: string; url?: string | null; size?: number }) {
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
          style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }}
        />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 5, background: `${tint}22`, flexShrink: 0 }} />
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
    padding: '6px 10px', borderRadius: 10,
    background: 'var(--card-bg)',
    border: '1px solid var(--border-subtle)',
    textDecoration: 'none', minWidth: 200, flex: '1 1 200px',
    opacity: href ? 1 : 0.6, cursor: href ? 'pointer' : 'default',
  }
  return href ? (
    <Link href={href} style={baseStyle}>{body}</Link>
  ) : (
    <div style={baseStyle}>{body}</div>
  )
}

/** Build a threaded tree: posts w/o parent at root; nested under their parent_post_legacy_id. */
type TreeNode = { post: PostRow; children: TreeNode[] }

function buildTree(posts: PostRow[]): TreeNode[] {
  const byId = new Map<number, TreeNode>()
  for (const p of posts) byId.set(p.legacy_id, { post: p, children: [] })
  const roots: TreeNode[] = []
  for (const p of posts) {
    const node = byId.get(p.legacy_id)!
    const parent = p.parent_post_legacy_id ? byId.get(p.parent_post_legacy_id) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function sortTree(nodes: TreeNode[], mode: 'desc' | 'asc' | 'top'): TreeNode[] {
  const cmp = (a: TreeNode, b: TreeNode) => {
    if (mode === 'top') {
      return (b.post.like_count ?? 0) - (a.post.like_count ?? 0)
        || new Date(b.post.created_at ?? 0).getTime() - new Date(a.post.created_at ?? 0).getTime()
    }
    const ta = new Date(a.post.created_at ?? 0).getTime()
    const tb = new Date(b.post.created_at ?? 0).getTime()
    return mode === 'desc' ? tb - ta : ta - tb
  }
  const walk = (arr: TreeNode[]): TreeNode[] => {
    arr.sort(cmp)
    for (const n of arr) n.children = walk(n.children)
    return arr
  }
  return walk(nodes.slice())
}

export default function ThreadPageClient({
  thread, posts, avatars, attachmentSlugs, artist, threadLikers, postLikers,
  isAdmin, currentUser, sortParam,
}: Props) {
  const [sort, setSort] = useState<'desc' | 'asc' | 'top'>(
    sortParam === 'asc' ? 'asc' : sortParam === 'top' ? 'top' : 'desc',
  )
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [threadLikesOpen, setThreadLikesOpen] = useState(false)
  const [postLikesModal, setPostLikesModal] = useState<{ post: PostRow } | null>(null)
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Scroll to #comment-<id> on load if present
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#comment-')) {
      const el = document.querySelector(hash)
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
      }
    }
  }, [])

  const tree = useMemo(() => sortTree(buildTree(posts), sort), [posts, sort])

  const title = thread.title || (thread.slug || '').replace(/\/$/, '').replace(/-/g, ' ')
  const firstAt = thread.first_post_at
  const postCount = thread.post_count ?? posts.length
  const threadLikes = thread.like_count ?? 0
  const artistThumb = artist?.cover_image_url || null

  const copyPermalink = async (legacyId: number) => {
    const url = `${window.location.origin}${window.location.pathname}#comment-${legacyId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(legacyId)
      setTimeout(() => setCopiedId((c) => (c === legacyId ? null : c)), 1500)
    } catch {
      window.prompt('Kopijuok nuorodą ranka:', url)
    }
  }

  const renderPost = (node: TreeNode, depth: number) => {
    const p = node.post
    const { cleanHtml, attachments } = splitAttachments(p.content_html ?? p.content_text ?? '')
    const likers = postLikers[p.legacy_id] || []
    const avatarUrl = p.author_avatar_url || (avatars[p.author_username ?? ''] ?? null)
    return (
      <div
        key={p.legacy_id}
        id={`comment-${p.legacy_id}`}
        style={{
          marginLeft: depth * 24,
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          borderLeft: depth > 0 ? '2px solid var(--border-subtle)' : 'none',
          background: depth > 0 ? 'var(--bg-hover)' : 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <Avatar username={p.author_username ?? '?'} url={avatarUrl} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
              marginBottom: 4, fontFamily: 'Outfit,sans-serif',
            }}>
              <Link
                href={`/vartotojas/ghost/${encodeURIComponent(p.author_username ?? '')}`}
                style={{ fontSize: 13, fontWeight: 800, color: '#f97316', textDecoration: 'none' }}
              >
                {p.author_username ?? 'nežinomas'}
              </Link>
              <span title={fullDate(p.created_at)} style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                · {timeAgo(p.created_at)}
              </span>
            </div>
            <div
              className="post-body"
              style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)', wordBreak: 'break-word' }}
              dangerouslySetInnerHTML={{ __html: sanitizePostHtml(cleanHtml) }}
            />
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {attachments.map((a, idx) => (
                  <AttachmentCard
                    key={`${a.type}-${a.legacy_id}-${idx}`}
                    a={a}
                    resolved={attachmentSlugs[`${a.type}:${a.legacy_id}`]}
                  />
                ))}
              </div>
            )}
            {/* Action row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
              fontSize: 11, fontWeight: 700, fontFamily: 'Outfit,sans-serif',
              color: 'var(--text-muted)',
            }}>
              <button
                onClick={() => (p.like_count ?? 0) > 0 && setPostLikesModal({ post: p })}
                disabled={(p.like_count ?? 0) === 0}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  border: 'none', background: 'transparent',
                  color: (p.like_count ?? 0) > 0 ? '#f97316' : 'var(--text-faint)',
                  cursor: (p.like_count ?? 0) > 0 ? 'pointer' : 'default', padding: 0,
                  fontWeight: 700, fontSize: 11,
                }}
              >
                ♥ {p.like_count ?? 0}
              </button>
              {currentUser && (
                <button
                  onClick={() => setReplyTo((r) => (r === p.legacy_id ? null : p.legacy_id))}
                  style={{
                    border: 'none', background: 'transparent',
                    color: replyTo === p.legacy_id ? '#f97316' : 'var(--text-muted)',
                    cursor: 'pointer', padding: 0,
                    fontWeight: 700, fontSize: 11, fontFamily: 'Outfit,sans-serif',
                  }}
                >
                  Atsakyti
                </button>
              )}
              <button
                onClick={() => copyPermalink(p.legacy_id)}
                title="Kopijuoti nuorodą į šį komentarą"
                style={{
                  border: 'none', background: 'transparent',
                  color: copiedId === p.legacy_id ? '#22c55e' : 'var(--text-muted)',
                  cursor: 'pointer', padding: 0,
                  fontWeight: 700, fontSize: 11, fontFamily: 'Outfit,sans-serif',
                }}
              >
                {copiedId === p.legacy_id ? '✓ nukopijuota' : 'Nuoroda'}
              </button>
            </div>

            {/* Inline reply form */}
            {replyTo === p.legacy_id && currentUser && (
              <div style={{ marginTop: 10, padding: '10px', borderRadius: 8, background: 'var(--bg-body)', border: '1px solid var(--border-subtle)' }}>
                <ReplyComposer
                  currentUser={currentUser}
                  threadLegacyId={thread.legacy_id}
                  parentPostLegacyId={p.legacy_id}
                  compact
                  onSent={() => setReplyTo(null)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Child replies */}
        {node.children.map((child) => renderPost(child, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        .post-body img { max-width: 100%; height: auto; border-radius: 6px; vertical-align: middle; }
        .post-body img[src*="/emotions/"], .post-body img[src*="/smiles/"] { display: inline-block; width: 20px; height: 20px; vertical-align: text-bottom; }
        .post-body iframe { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .post-body p { margin: 0 0 8px; }
        .post-body a { color: #f97316; }
        .wysiwyg { min-height: 72px; padding: 10px 12px; border-radius: 8px; background: var(--bg-body); border: 1px solid var(--border-subtle); font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; line-height: 1.55; }
        .wysiwyg:focus { border-color: #f97316; }
        .wysiwyg:empty:before { content: attr(data-placeholder); color: var(--text-faint); pointer-events: none; }
        .wysiwyg iframe { max-width: 100%; border-radius: 6px; margin: 6px 0; border: 1px solid var(--border-subtle); }
        .wysiwyg img { max-width: 100%; height: auto; border-radius: 6px; }
        .wysiwyg a { color: #f97316; }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Compact header: artist thumb + title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {artist && (
            <Link
              href={`/atlikejai/${artist.slug}`}
              title={`Atgal į ${artist.name}`}
              style={{
                flexShrink: 0, textDecoration: 'none',
              }}
            >
              {artistThumb ? (
                <img
                  src={artistThumb}
                  alt={artist.name}
                  referrerPolicy="no-referrer"
                  style={{
                    width: 56, height: 56, borderRadius: 10,
                    objectFit: 'cover', objectPosition: 'center',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: 10,
                  background: 'linear-gradient(135deg,#f97316,#dc2626)',
                }} />
              )}
            </Link>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {artist && (
              <Link
                href={`/atlikejai/${artist.slug}`}
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '.05em',
                  color: 'var(--text-muted)', textDecoration: 'none',
                  fontFamily: 'Outfit,sans-serif',
                }}
              >
                {artist.name} ›
              </Link>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <h1 style={{
                flex: 1, fontFamily: 'Outfit,sans-serif', fontSize: '1.8rem',
                fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.02em',
                margin: '2px 0 0', color: 'var(--text-primary)',
              }}>
                {title}
              </h1>
              {isAdmin && (
                <button
                  onClick={() => setAdminModalOpen(true)}
                  aria-label="Admin info" title="Admin info"
                  style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--card-bg)', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', marginTop: 4,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 600,
          marginTop: 10, marginBottom: 18,
        }}>
          <span title={fullDate(firstAt)}>sukurta {timeAgo(firstAt)}</span>
          <span>· {postCount} {plural(postCount, ['komentaras', 'komentarai', 'komentarų'])}</span>
          <button
            onClick={() => threadLikes > 0 && setThreadLikesOpen(true)}
            disabled={threadLikes === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 100,
              background: threadLikes > 0 ? 'rgba(249,115,22,.12)' : 'transparent',
              border: threadLikes > 0 ? '1px solid rgba(249,115,22,.25)' : '1px solid var(--border-subtle)',
              color: threadLikes > 0 ? '#f97316' : 'var(--text-muted)',
              cursor: threadLikes > 0 ? 'pointer' : 'default',
              fontSize: 12, fontWeight: 700, fontFamily: 'Outfit,sans-serif',
            }}
          >
            ♥ {threadLikes}
          </button>
        </div>

        {/* Reply composer (top-level) */}
        {replyTo === null && <ReplyComposer currentUser={currentUser} threadLegacyId={thread.legacy_id} />}

        {/* Sort toggle */}
        {posts.length > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 16, marginBottom: 4, fontFamily: 'Outfit,sans-serif',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {posts.length} {plural(posts.length, ['komentaras', 'komentarai', 'komentarų'])}
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 100, overflow: 'hidden' }}>
              {(['desc', 'top', 'asc'] as const).map((v) => (
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
                  {v === 'desc' ? 'Naujausi' : v === 'top' ? 'Populiariausi' : 'Seniausi'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comments tree */}
        {posts.length === 0 ? (
          <div style={{
            marginTop: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '20px 22px',
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Šioje diskusijoje kol kas nėra komentarų.
            </div>
          </div>
        ) : (
          <div>
            {tree.map((node) => renderPost(node, 0))}
          </div>
        )}
      </div>

      {/* Modals */}
      <LikesModal
        open={threadLikesOpen}
        onClose={() => setThreadLikesOpen(false)}
        title={`„${title}" patinka`}
        count={threadLikes}
        users={threadLikers}
      />
      {postLikesModal && (
        <LikesModal
          open={!!postLikesModal}
          onClose={() => setPostLikesModal(null)}
          title={`@${postLikesModal.post.author_username} komentarą patinka`}
          count={postLikesModal.post.like_count ?? 0}
          users={postLikers[postLikesModal.post.legacy_id] || []}
        />
      )}
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

function ReplyComposer({
  currentUser, threadLegacyId, parentPostLegacyId, compact, onSent,
}: {
  currentUser: CurrentUser
  threadLegacyId: number
  parentPostLegacyId?: number
  compact?: boolean
  onSent?: () => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [attached, setAttached] = useState<SearchHit[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const runSearch = async (q: string) => {
    setSearchTerm(q)
    if (q.trim().length < 2) { setHits([]); return }
    setSearching(true)
    try {
      const r = await fetch(`/api/search-entities?q=${encodeURIComponent(q)}`)
      const data = await r.json()
      setHits((data.results as SearchHit[]) || [])
    } catch { setHits([]) }
    setSearching(false)
  }

  const exec = (cmd: string, arg?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, arg)
  }
  const addLink = () => {
    const url = prompt('Įklijuok nuorodą (URL):')
    if (!url) return
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
    if (yt) {
      const iframe = `<iframe src="https://www.youtube.com/embed/${yt[1]}" width="560" height="315" frameborder="0" allowfullscreen></iframe><p></p>`
      document.execCommand('insertHTML', false, iframe)
    } else {
      exec('createLink', url)
    }
  }

  const addAttachment = (h: SearchHit) => {
    if (attached.some((a) => a.type === h.type && a.id === h.id)) return
    setAttached((prev) => [...prev, h])
    setSearchTerm('')
    setHits([])
    setSearchOpen(false)
  }
  const removeAttachment = (h: SearchHit) => {
    setAttached((prev) => prev.filter((a) => !(a.type === h.type && a.id === h.id)))
  }

  useEffect(() => {
    if (!searchOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const submit = async () => {
    const html = editorRef.current?.innerHTML || ''
    const text = editorRef.current?.innerText?.trim() || ''
    if (!text && attached.length === 0) {
      setError('Įrašyk komentarą arba pridėk muziką.')
      return
    }
    setError(''); setSending(true)
    try {
      const r = await fetch('/api/forum-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_legacy_id: threadLegacyId,
          parent_post_legacy_id: parentPostLegacyId,
          text, html,
          attachments: attached,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Klaida')
      if (editorRef.current) editorRef.current.innerHTML = ''
      setAttached([])
      if (onSent) onSent()
      setTimeout(() => window.location.reload(), 400)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Klaida')
    }
    setSending(false)
  }

  if (!currentUser) {
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 12,
        border: '1px dashed var(--border-subtle)',
        background: 'var(--bg-surface)',
        fontSize: 13, color: 'var(--text-muted)',
        fontFamily: 'Outfit,sans-serif',
      }}>
        <Link href="/auth/signin" style={{ color: '#f97316', fontWeight: 700 }}>Prisijunk</Link>, kad galėtum komentuoti.
      </div>
    )
  }

  return (
    <div style={{
      background: compact ? 'transparent' : 'var(--bg-surface)',
      border: compact ? 'none' : '1px solid var(--border-subtle)',
      borderRadius: 12, fontFamily: 'Outfit,sans-serif',
    }}>
      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <ToolBtn title="Paryškinta (Ctrl+B)" onClick={() => exec('bold')}><b>B</b></ToolBtn>
          <ToolBtn title="Kursyvas (Ctrl+I)" onClick={() => exec('italic')}><i>I</i></ToolBtn>
          <ToolBtn title="Pabraukta" onClick={() => exec('underline')}><u>U</u></ToolBtn>
          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />
          <ToolBtn title="Sąrašas" onClick={() => exec('insertUnorderedList')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm3 .5h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14v-2H7z" /></svg>
          </ToolBtn>
          <ToolBtn title="Citata" onClick={() => exec('formatBlock', 'blockquote')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z" /></svg>
          </ToolBtn>
          <ToolBtn title="Nuoroda / YouTube" onClick={addLink}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" /></svg>
          </ToolBtn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-faint)', padding: '0 6px' }}>
            YouTube nuoroda automatiškai tampa embed'u
          </span>
        </div>
      )}
      <div style={{ padding: compact ? 0 : '8px 10px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {!compact && (
            currentUser.image ? (
              <img src={currentUser.image} alt="" referrerPolicy="no-referrer"
                   style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--card-bg)', flexShrink: 0, marginTop: 2 }} />
            )
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              ref={editorRef}
              className="wysiwyg"
              contentEditable
              suppressContentEditableWarning
              data-placeholder={parentPostLegacyId ? 'Atsakyk…' : 'Rašyk komentarą…'}
            />
            {attached.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {attached.map((a) => (
                  <div
                    key={`${a.type}-${a.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 4px 3px 8px', borderRadius: 100,
                      background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                      fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ color: a.type === 'daina' ? '#3b82f6' : a.type === 'albumas' ? '#f97316' : '#a855f7', fontWeight: 800, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {a.type === 'daina' ? 'Daina' : a.type === 'albumas' ? 'Albumas' : 'Atlikėjas'}
                    </span>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                    <button
                      onClick={() => removeAttachment(a)}
                      aria-label="Pašalinti"
                      style={{
                        width: 18, height: 18, borderRadius: '50%',
                        border: 'none', background: 'var(--bg-hover)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <button
                onClick={() => setSearchOpen((o) => !o)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 100,
                  background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'Outfit,sans-serif',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v2.12c-.76-.18-1.56-.18-2.4 0v-1.9H7v2.82c-2.34 1.57-3.88 4.24-3.88 7.28 0 4.85 3.95 8.8 8.8 8.8s8.8-3.95 8.8-8.8c0-3.04-1.54-5.71-3.88-7.28V3H12zm1.86 11.37L12 18l-1.86-3.63L6 13l3.63-2.74L12 6l2.37 4.26L18 13l-4.14 1.37z" /></svg>
                Pridėti muziką
              </button>
              {searchOpen && (
                <div style={{
                  position: 'absolute', left: 0, top: '100%', zIndex: 50,
                  marginTop: 6, width: 'min(420px, 100%)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,.28)',
                  overflow: 'hidden',
                }}>
                  <input
                    autoFocus
                    value={searchTerm}
                    onChange={(e) => runSearch(e.target.value)}
                    placeholder="Ieškok dainos, albumo, atlikėjo…"
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: 'none', borderBottom: '1px solid var(--border-subtle)',
                      background: 'var(--bg-body)', color: 'var(--text-primary)',
                      outline: 'none', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                    }}
                  />
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {searching && <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>Ieškau…</div>}
                    {!searching && hits.length === 0 && searchTerm.length >= 2 && (
                      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>Nieko nerasta</div>
                    )}
                    {hits.map((h) => (
                      <button
                        key={`${h.type}-${h.id}`}
                        onClick={() => addAttachment(h)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', border: 'none', background: 'transparent',
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
                          <div style={{ fontSize: 9, color: h.type === 'daina' ? '#3b82f6' : h.type === 'albumas' ? '#f97316' : '#a855f7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            {h.type === 'daina' ? 'Daina' : h.type === 'albumas' ? 'Albumas' : 'Atlikėjas'}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
                          {h.artist && <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.artist}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ flex: 1 }} />
              {error && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{error}</span>}
              <button
                onClick={submit}
                disabled={sending}
                style={{
                  padding: '5px 16px', borderRadius: 100,
                  border: 'none', background: sending ? 'var(--card-bg)' : '#f97316',
                  color: sending ? 'var(--text-muted)' : '#fff',
                  fontSize: 12, fontWeight: 800, cursor: sending ? 'default' : 'pointer',
                  fontFamily: 'Outfit,sans-serif',
                }}
              >
                {sending ? 'Siunčiu…' : parentPostLegacyId ? 'Atsakyti' : 'Paskelbti'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      style={{
        width: 28, height: 26, border: 'none', background: 'transparent',
        color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontFamily: 'Outfit,sans-serif',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >{children}</button>
  )
}
