'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Comment = {
  id: number
  parent_id: number | null
  depth: number
  user_id: string | null
  author_name: string | null
  author_avatar: string | null
  is_archived: boolean
  body: string
  is_deleted: boolean
  like_count: number
  created_at: string
  edited_at: string | null
}

type CommentWithReplies = Comment & { replies: CommentWithReplies[] }

const EDIT_WINDOW_MS = 20 * 60 * 1000

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ką tik'
  if (mins < 60) return `prieš ${mins} min.`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `prieš ${hrs} val.`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `prieš ${days} d.`
  return new Date(dateStr).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
}

function buildTree(comments: Comment[]): CommentWithReplies[] {
  const map = new Map<number, CommentWithReplies>()
  const roots: CommentWithReplies[] = []
  for (const c of comments) map.set(c.id, { ...c, replies: [] })
  for (const c of comments) {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function Avatar({ name, src, size = 8 }: { name: string | null; src: string | null; size?: number }) {
  const initials = name?.slice(0, 2).toUpperCase() || '??'
  const sizeClass = `w-${size} h-${size}`
  if (src) return <img src={src} alt={name || ''} className={`${sizeClass} rounded-full object-cover flex-shrink-0`} />
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0`}
      style={{ background: 'var(--avatar-bg)', color: 'var(--avatar-text)' }}>
      {initials}
    </div>
  )
}

function ReportModal({ commentId, onClose }: { commentId: number; onClose: () => void }) {
  const [reason, setReason] = useState('spam')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    setSending(true)
    await fetch('/api/comments/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId, reason, note }),
    })
    setSent(true)
    setSending(false)
    setTimeout(onClose, 1500)
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)' }}>
        {sent ? (
          <p className="text-center text-green-400 py-4 font-bold">✓ Pranešta. Ačiū!</p>
        ) : (
          <>
            <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Pranešti apie komentarą</h3>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm mb-3 focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }}>
              <option value="spam">Spam</option>
              <option value="offensive">Įžeidžiantis turinys</option>
              <option value="misinformation">Dezinformacija</option>
              <option value="other">Kita</option>
            </select>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Papildoma informacija (nebūtina)..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm mb-3 resize-none focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }} />
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm transition-colors" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>Atšaukti</button>
              <button onClick={submit} disabled={sending}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white bg-red-600/80 hover:bg-red-600 transition-colors disabled:opacity-50">
                {sending ? '...' : 'Pranešti'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function CommentNode({
  comment,
  likedIds,
  onLike,
  onReply,
  onEdit,
  onDelete,
  currentUserId,
  isAdmin,
}: {
  comment: CommentWithReplies
  likedIds: number[]
  onLike: (id: number) => void
  onReply: (id: number, name: string) => void
  onEdit: (id: number, body: string) => void
  onDelete: (id: number) => void
  currentUserId: string | null
  isAdmin: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [localLikes, setLocalLikes] = useState(comment.like_count)
  const liked = likedIds.includes(comment.id)

  const canEdit = currentUserId === comment.user_id
    && !comment.is_archived
    && !comment.is_deleted
    && (Date.now() - new Date(comment.created_at).getTime()) < EDIT_WINDOW_MS

  const canDelete = (currentUserId === comment.user_id || isAdmin) && !comment.is_deleted

  const handleLike = () => {
    if (!liked) setLocalLikes(p => p + 1)
    else setLocalLikes(p => Math.max(0, p - 1))
    onLike(comment.id)
  }

  const indent = Math.min(comment.depth, 4)
  const indentStyle = indent > 0 ? { borderLeft: '2px solid var(--border-subtle)', marginLeft: `${indent * 20}px` } : {}

  return (
    <div style={indentStyle} className={indent > 0 ? 'pl-4' : ''}>
      <div className={`group py-3 ${comment.is_deleted ? 'opacity-50' : ''}`}>
        <div className="flex items-start gap-3">
          <Avatar name={comment.author_name} src={comment.author_avatar} size={7} />

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                {comment.is_deleted ? '[Pašalinta]' : (comment.author_name || 'Vartotojas')}
              </span>
              {comment.is_archived && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  Archyvinis
                </span>
              )}
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(comment.created_at)}</span>
              {comment.edited_at && (
                <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>(redaguota)</span>
              )}
            </div>

            {/* Body */}
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>
              {comment.body}
            </div>

            {/* Actions */}
            {!comment.is_deleted && (
              <div className="flex items-center gap-3 mt-2">
                {/* Like */}
                <button onClick={handleLike}
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: liked ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span>{localLikes > 0 ? localLikes : ''}</span>
                </button>

                {/* Reply */}
                {currentUserId && (
                  <button onClick={() => onReply(comment.id, comment.author_name || 'Vartotojas')}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    Atsakyti
                  </button>
                )}

                {/* Edit */}
                {canEdit && (
                  <button onClick={() => onEdit(comment.id, comment.body)}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    Redaguoti
                  </button>
                )}

                {/* Delete */}
                {canDelete && (
                  <button onClick={() => onDelete(comment.id)}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    Šalinti
                  </button>
                )}

                {/* Report */}
                {currentUserId && currentUserId !== comment.user_id && (
                  <button onClick={() => setShowReport(true)}
                    className="text-xs transition-colors ml-auto opacity-0 group-hover:opacity-100"
                    style={{ color: 'var(--text-faint)' }}>
                    Pranešti
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Collapse button */}
          {comment.replies.length > 0 && (
            <button onClick={() => setCollapsed(!collapsed)}
              className="text-xs transition-colors mt-1 flex-shrink-0"
              style={{ color: 'var(--text-faint)' }}>
              {collapsed ? `+${comment.replies.length}` : '−'}
            </button>
          )}
        </div>
      </div>

      {/* Replies */}
      {!collapsed && comment.replies.length > 0 && (
        <div>
          {comment.replies.map(reply => (
            <CommentNode
              key={reply.id}
              comment={reply}
              likedIds={likedIds}
              onLike={onLike}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {showReport && <ReportModal commentId={comment.id} onClose={() => setShowReport(false)} />}
    </div>
  )
}

function CommentForm({
  onSubmit,
  loading,
  placeholder,
  autoFocus,
  initialValue,
  onCancel,
}: {
  onSubmit: (text: string) => Promise<void>
  loading: boolean
  placeholder?: string
  autoFocus?: boolean
  initialValue?: string
  onCancel?: () => void
}) {
  const [text, setText] = useState(initialValue || '')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  const handleSubmit = async () => {
    if (!text.trim()) return
    await onSubmit(text)
    setText('')
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder || 'Rašyk komentarą...'}
        rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit() }}
        className="w-full px-4 py-3 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 transition-all"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Ctrl+Enter — siųsti</span>
        <div className="flex gap-2">
          {onCancel && (
            <button onClick={onCancel} className="px-3 py-1.5 text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>
              Atšaukti
            </button>
          )}
          <button onClick={handleSubmit} disabled={loading || !text.trim()}
            className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--accent-blue)', color: 'var(--text-primary)' }}>
            {loading ? '⏳' : 'Siųsti'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  entityType: string
  entityId: number | string
  title?: string
}

export default function CommentsSection({ entityType, entityId, title = 'Diskusija' }: Props) {
  const { data: session } = useSession()
  const [comments, setComments] = useState<Comment[]>([])
  const [likedIds, setLikedIds] = useState<number[]>([])
  const [sort, setSort] = useState<'popular' | 'newest' | 'oldest'>('popular')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<{ id: number; body: string } | null>(null)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const loadComments = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/comments?entity_type=${entityType}&entity_id=${entityId}&sort=${sort}&limit=100`)
    const data = await res.json()
    const commentList: Comment[] = data.comments || []
    setComments(commentList)

    // Gauti liked IDs
    if (commentList.length > 0) {
      const ids = commentList.map(c => c.id).join(',')
      const likesRes = await fetch(`/api/comments/likes?ids=${ids}`)
      const likesData = await likesRes.json()
      setLikedIds(likesData.liked_ids || [])
    }
    setLoading(false)
  }, [entityType, entityId, sort])

  useEffect(() => { loadComments() }, [loadComments])

  const handlePost = async (text: string) => {
    setPosting(true)
    setError('')
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, text }),
    })
    const data = await res.json()
    if (res.ok) {
      setComments(prev => [...prev, data.comment])
    } else {
      setError(data.error || 'Klaida')
    }
    setPosting(false)
  }

  const handleReply = async (text: string) => {
    if (!replyTo) return
    setPosting(true)
    setError('')
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, parent_id: replyTo.id, text }),
    })
    const data = await res.json()
    if (res.ok) {
      setComments(prev => [...prev, data.comment])
      setReplyTo(null)
    } else {
      setError(data.error || 'Klaida')
    }
    setPosting(false)
  }

  const handleEdit = async (text: string) => {
    if (!editTarget) return
    setPosting(true)
    const res = await fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editTarget.id, text }),
    })
    const data = await res.json()
    if (res.ok) {
      setComments(prev => prev.map(c => c.id === editTarget.id ? { ...c, body: data.comment.body, edited_at: data.comment.edited_at } : c))
      setEditTarget(null)
    }
    setPosting(false)
  }

  const handleLike = async (commentId: number) => {
    const wasLiked = likedIds.includes(commentId)
    setLikedIds(prev => wasLiked ? prev.filter(id => id !== commentId) : [...prev, commentId])
    await fetch('/api/comments/likes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId }),
    })
  }

  const handleDelete = async (commentId: number) => {
    if (!confirm('Pašalinti komentarą?')) return
    await fetch(`/api/comments?id=${commentId}`, { method: 'DELETE' })
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, is_deleted: true, body: '[Komentaras pašalintas]' } : c))
  }

  const tree = buildTree(comments)
  const commentCount = comments.filter(c => !c.is_deleted).length

  return (
    <section className="mt-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 group">
          <h2 className="text-lg font-black transition-colors" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          {commentCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              {commentCount}
            </span>
          )}
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{collapsed ? '▸' : '▾'}</span>
        </button>

        {!collapsed && commentCount > 0 && (
          <div className="flex gap-1">
            {(['popular', 'newest', 'oldest'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: sort === s ? 'var(--bg-hover)' : 'transparent',
                  color: sort === s ? 'var(--text-primary)' : 'var(--text-muted)'
                }}>
                {s === 'popular' ? 'Populiarūs' : s === 'newest' ? 'Nauji' : 'Seni'}
              </button>
            ))}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Write comment */}
          {session ? (
            <div className="flex items-start gap-3 mb-6">
              <Avatar name={session.user.name ?? null} src={session.user.image ?? null} size={8} />
              <div className="flex-1">
                {editTarget ? (
                  <CommentForm
                    onSubmit={handleEdit}
                    loading={posting}
                    placeholder="Redaguok komentarą..."
                    autoFocus
                    initialValue={editTarget.body}
                    onCancel={() => setEditTarget(null)}
                  />
                ) : replyTo ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">↩ Atsakymas į <span className="text-white font-semibold">{replyTo.name}</span></p>
                    <CommentForm
                      onSubmit={handleReply}
                      loading={posting}
                      placeholder={`Atsakyk ${replyTo.name}...`}
                      autoFocus
                      onCancel={() => setReplyTo(null)}
                    />
                  </div>
                ) : (
                  <CommentForm
                    onSubmit={handlePost}
                    loading={posting}
                    placeholder="Rašyk komentarą..."
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="mb-6 px-4 py-3 rounded-2xl text-sm"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <Link href="/auth/signin" className="font-bold transition-colors" style={{ color: 'var(--accent-link)' }}>
                Prisijunk
              </Link>
              <span style={{ color: 'var(--text-muted)' }}> kad galėtum komentuoti</span>
            </div>
          )}

          {error && (
            <p className="text-sm mb-3 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-orange)' }}>
              {error}
            </p>
          )}

          {/* Comments */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Dar nėra komentarų. Būk pirmas!</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y"
              style={{ borderColor: 'var(--border-subtle)' }}>
              {tree.map(c => (
                <CommentNode
                  key={c.id}
                  comment={c}
                  likedIds={likedIds}
                  onLike={handleLike}
                  onReply={(id, name) => { setReplyTo({ id, name }); setEditTarget(null) }}
                  onEdit={(id, body) => { setEditTarget({ id, body }); setReplyTo(null) }}
                  onDelete={handleDelete}
                  currentUserId={session?.user?.id || null}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
