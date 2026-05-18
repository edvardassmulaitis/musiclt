'use client'
import { useState } from 'react'

type Comment = {
  id: string
  content: string
  content_html?: string | null   // legacy komentarai turi rich HTML
  created_at: string
  profiles: any
  source?: 'modern' | 'legacy'   // discriminator iš getPostComments
  like_count?: number
}

export default function PostInteractions({ postId, initialLikeCount, initialComments }: { postId: string; initialLikeCount: number; initialComments: Comment[] }) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(initialLikeCount || 0)
  const [comments, setComments] = useState<Comment[]>(initialComments || [])
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)

  const getProfile = (c: Comment) => {
    const p = c.profiles
    if (Array.isArray(p)) return p[0] || {}
    return p || {}
  }

  async function handleLike() {
    const res = await fetch(`/api/blog/posts/${postId}/like`, { method: 'POST' })
    if (res.ok) {
      const { liked: isLiked } = await res.json()
      setLiked(isLiked)
      setLikeCount(c => isLiked ? c + 1 : c - 1)
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim() || posting) return
    setPosting(true)
    try {
      const res = await fetch(`/api/blog/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      })
      if (res.ok) {
        const comment = await res.json()
        setComments(c => [...c, comment])
        setNewComment('')
      } else {
        const { error } = await res.json()
        alert(error || 'Klaida')
      }
    } finally {
      setPosting(false)
    }
  }

  const copyLink = () => { navigator.clipboard.writeText(window.location.href); alert('Nuoroda nukopijuota!') }

  return (
    <div className="mt-10">
      {/* Actions bar */}
      <div className="flex items-center gap-3 py-4 border-t border-b border-white/[.06]">
        <button onClick={handleLike} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${liked ? 'bg-[#f97316]/20 text-[#f97316] border border-[#f97316]/30' : 'bg-white/[.04] text-[#5e7290] border border-white/[.06] hover:bg-white/[.06]'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
          <span>{liked ? '♥' : '♡'}</span>
          <span>{likeCount}</span>
        </button>
        <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[#5e7290] bg-white/[.04] border border-white/[.06] hover:bg-white/[.06] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
          🔗 Kopijuoti nuorodą
        </button>
        <span className="text-xs text-[#334058] ml-auto">💬 {comments.length} komentarai</span>
      </div>

      {/* Comments */}
      <div className="mt-6">
        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058] mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>Komentarai</h3>
        
        <form onSubmit={handleComment} className="mb-6">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Parašyk komentarą..."
            rows={3}
            className="w-full rounded-lg bg-white/[.03] border border-white/[.06] px-3 py-2 text-sm text-[#f0f2f5] placeholder:text-[#334058] focus:outline-none focus:border-[#f97316]/30 resize-none"
          />
          <div className="flex justify-end mt-2">
            <button type="submit" disabled={posting || !newComment.trim()} className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40 disabled:cursor-not-allowed transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {posting ? 'Siunčiama...' : 'Komentuoti'}
            </button>
          </div>
        </form>

        {comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map(c => {
              const profile = getProfile(c)
              return (
                <div key={c.id} className="flex gap-3">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#111822] flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-[#334058]">
                      {(profile?.full_name || '?')[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {profile?.username ? (
                        <a href={`/vartotojas/${profile.username}`} className="text-xs font-bold text-[#b0bdd4] hover:text-[#f97316] transition">
                          {profile?.full_name || profile?.username || 'Vartotojas'}
                        </a>
                      ) : (
                        <span className="text-xs font-bold text-[#b0bdd4]">{profile?.full_name || profile?.username || 'Vartotojas'}</span>
                      )}
                      <span className="text-[10px] text-[#334058]">{new Date(c.created_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      {c.source === 'legacy' && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#5e7290] bg-white/[.04] border border-white/[.06] rounded-full px-1.5 py-0.5" title="Importuota iš senos music.lt">archyvas</span>
                      )}
                      {!!c.like_count && c.like_count > 0 && (
                        <span className="text-[10px] text-[#5e7290]">♥ {c.like_count}</span>
                      )}
                    </div>
                    {c.content_html ? (
                      <div
                        className="text-sm text-[#b0bdd4] mt-1 leading-relaxed legacy-comment"
                        dangerouslySetInnerHTML={{ __html: c.content_html }}
                      />
                    ) : (
                      <p className="text-sm text-[#5e7290] mt-0.5 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-[#334058] text-center py-4">Būk pirmas — palik komentarą!</p>
        )}
      </div>
    </div>
  )
}
