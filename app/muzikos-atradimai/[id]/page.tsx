// app/muzikos-atradimai/[id]/page.tsx
// Atradimo detalė: pilnas komentaras, veikiantis embed/player, atsakymai, like.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/artist-browse'
import { proxyImg } from '@/lib/img-proxy'
import { getDiscovery, relativeLt } from '@/lib/discoveries'
import { DetailMedia, DetailLike } from './detail-client'

export const revalidate = 600
type Props = { params: Promise<{ id: string }> }

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Avatar({ src, name, size = 38 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.42, flexShrink: 0, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,64%)` }}>{nm.charAt(0).toUpperCase()}</div>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const res = await getDiscovery(parseInt(id))
  if (!res) return { title: 'Atradimas — music.lt' }
  const d = res.discovery
  const who = d.author?.username || 'narys'
  const title = `${d.artist_name || 'Muzikos atradimas'}${d.track_name ? ' — ' + d.track_name : ''} | Atradimas | music.lt`
  const desc = (d.body || '').slice(0, 160)
  return {
    title,
    description: desc,
    alternates: { canonical: `${SITE_URL}/muzikos-atradimai/${id}` },
    openGraph: { title, description: desc, url: `${SITE_URL}/muzikos-atradimai/${id}`, type: 'article' },
  }
}

export default async function DiscoveryDetailPage({ params }: Props) {
  const { id } = await params
  const res = await getDiscovery(parseInt(id))
  if (!res) notFound()
  const { discovery: d, replies } = res
  const uname = d.author?.username
  const when = relativeLt(d.created_at)

  return (
    <div className="page-shell" style={{ maxWidth: 760 }}>
      <Link href="/muzikos-atradimai" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        Visi atradimai
      </Link>

      <article style={{ background: 'var(--card-surface)', border: '1px solid var(--card-border-default)', borderRadius: 16, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar src={d.author?.avatar_url} name={uname} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            {uname ? <Link href={`/@${uname}`} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{uname}</Link> : <span style={{ fontSize: 15, fontWeight: 700 }}>Narys</span>}
            {when && <span style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>{when}</span>}
          </div>
        </div>

        {(d.artist_name || d.track_name) && (
          <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: '16px 0 6px', lineHeight: 1.2 }}>
            {d.artist_name && (d.artist_slug ? <Link href={`/atlikejai/${d.artist_slug}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{d.artist_name}</Link> : <span>{d.artist_name}</span>)}
            {d.artist_name && d.track_name && <span style={{ color: 'var(--text-faint)' }}> — </span>}
            {d.track_name && <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{d.track_name}</span>}
          </h1>
        )}

        <DetailMedia d={d} />

        {d.track_slug && (
          <Link href={`/dainos/${d.track_slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: 'var(--accent-orange)', textDecoration: 'none', marginBottom: 8 }}>
            ♪ Klausyti music.lt grotuve →
          </Link>
        )}

        {d.body && <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: '12px 0 16px' }}>{d.body}</p>}

        {d.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
            {d.tags.map(t => <span key={t} style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12.5, padding: '3px 10px', borderRadius: 14 }}>{t}</span>)}
          </div>
        )}

        <DetailLike commentId={d.comment_id} count={d.like_count} />
      </article>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>
          Atsakymai{replies.length > 0 ? ` (${replies.length})` : ''}
        </h2>
        {replies.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14.5 }}>Atsakymų dar nėra.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {replies.map(r => {
              const rn = r.author?.username
              const rw = relativeLt(r.created_at)
              return (
                <div key={r.id} style={{ display: 'flex', gap: 11, padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                  <Avatar src={r.author?.avatar_url} name={rn} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      {rn ? <Link href={`/@${rn}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{rn}</Link> : <span style={{ fontSize: 14, fontWeight: 700 }}>Narys</span>}
                      {rw && <span style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>{rw}</span>}
                    </div>
                    {r.body && <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-secondary)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
