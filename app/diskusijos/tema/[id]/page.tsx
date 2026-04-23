import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'

type Props = { params: Promise<{ id: string }> }

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

async function getThread(legacyId: number): Promise<ThreadRow | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_threads')
    .select('legacy_id,slug,source_url,kind,title,post_count,pagination_count,first_post_at,last_post_at')
    .eq('legacy_id', legacyId)
    .maybeSingle()
  return (data as ThreadRow | null) ?? null
}

async function getPosts(threadLegacyId: number): Promise<PostRow[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_posts')
    .select('legacy_id,page_number,author_username,author_numeric_id,created_at,content_html,content_text,like_count')
    .eq('thread_legacy_id', threadLegacyId)
    .order('created_at', { ascending: true })
  return (data as PostRow[] | null) ?? []
}

async function getGhostAvatars(usernames: string[]): Promise<Record<string, string>> {
  if (usernames.length === 0) return {}
  const sb = createAdminClient()
  const { data } = await sb
    .from('user_ghosts')
    .select('username,avatar_url')
    .in('username', usernames)
  const out: Record<string, string> = {}
  for (const row of (data as Array<{ username: string; avatar_url: string | null }> | null) ?? []) {
    if (row.avatar_url) out[row.username] = row.avatar_url
  }
  return out
}

function slugToTitle(slug: string | null): string {
  if (!slug) return ''
  return slug.replace(/\/$/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
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

export default async function LegacyDiscussionPage({ params }: Props) {
  const { id } = await params
  const legacyId = parseInt(id)
  if (!legacyId) notFound()
  const thread = await getThread(legacyId)
  if (!thread) notFound()

  const posts = await getPosts(legacyId)
  const usernames = Array.from(new Set(posts.map((p) => p.author_username).filter(Boolean))) as string[]
  const avatars = await getGhostAvatars(usernames)

  const title = thread.title || slugToTitle(thread.slug)
  const isNews = thread.kind === 'news'
  const kindLabel = isNews ? 'Naujiena' : 'Diskusija'
  const kindColor = isNews ? '#f97316' : '#3b82f6'

  const firstAt = thread.first_post_at
  const lastAt = thread.last_post_at
  const postCount = thread.post_count ?? posts.length

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Breadcrumbs */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 700, letterSpacing: '.04em', marginBottom: 20 }}>
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>music.lt</Link>
          {' / '}
          <Link href="/diskusijos" style={{ color: 'inherit', textDecoration: 'none' }}>Diskusijos</Link>
        </div>

        {/* Kind badge */}
        <div style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: 100,
          background: isNews ? 'rgba(249,115,22,.1)' : 'rgba(59,130,246,.1)',
          border: `1px solid ${isNews ? 'rgba(249,115,22,.3)' : 'rgba(59,130,246,.3)'}`,
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em',
          color: kindColor, fontFamily: 'Outfit,sans-serif', marginBottom: 14,
        }}>
          {kindLabel}
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'Outfit,sans-serif', fontSize: '2.2rem', fontWeight: 900,
          lineHeight: 1.15, letterSpacing: '-.02em', margin: '0 0 12px',
          color: 'var(--text-primary)',
        }}>
          {title}
        </h1>

        {/* Meta row */}
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
          fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 600,
          marginBottom: 32,
        }}>
          <span>music.lt #{thread.legacy_id}</span>
          {postCount > 0 && <span>· {postCount} komentarai</span>}
          {firstAt && <span>· Pradžia: {formatLtDate(firstAt)}</span>}
          {lastAt && firstAt !== lastAt && <span>· Paskutinė: {formatLtDate(lastAt)}</span>}
          {thread.source_url && (
            <a
              href={thread.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: kindColor, textDecoration: 'none', marginLeft: 'auto' }}
            >
              Originalas music.lt →
            </a>
          )}
        </div>

        {/* Comments list */}
        {posts.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '28px 26px', marginBottom: 24,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Šioje {isNews ? 'naujienoje' : 'diskusijoje'} kol kas nėra komentarų.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {posts.map((p) => (
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
                    style={{
                      fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)',
                      wordBreak: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizePostHtml(p.content_html ?? p.content_text ?? '') }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Server-side sanitizer: strips scripts, on*, iframe, form, input, style attributes
 * while preserving basic text formatting. music.lt original posts use minimal HTML
 * (bold/italic/linebreaks + rank;list links that we convert below).
 */
function sanitizePostHtml(html: string): string {
  if (!html) return ''
  let s = html
  // Strip script/style blocks
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  s = s.replace(/<form[\s\S]*?<\/form>/gi, '')
  // Strip javascript: hrefs + on* handlers
  s = s.replace(/\son\w+="[^"]*"/gi, '')
  s = s.replace(/\son\w+='[^']*'/gi, '')
  s = s.replace(/javascript:/gi, '')
  // Convert music.lt relative user links
  s = s.replace(/href="\/user\/([^"]+)"/g, 'href="/vartotojas/ghost/$1"')
  // Remove post_actions and reply buttons
  s = s.replace(/<div\s+class="post_actions"[\s\S]*?<\/div>/gi, '')
  // Remove trailing "____________________" signature separator artifacts
  return s
}
