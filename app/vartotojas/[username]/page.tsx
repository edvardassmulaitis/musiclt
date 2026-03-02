// app/vartotojas/[username]/page.tsx
import { notFound } from 'next/navigation'
import { getProfileByUsername, getProfileFavoriteArtists, getBlogByUserId, getLatestBlogPosts } from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Metadata } from 'next'

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)
  if (!profile) return { title: 'Nerastas — music.lt' }
  return { title: `${profile.full_name || profile.username} — music.lt`, description: profile.bio || `${profile.full_name || username} profilis music.lt` }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const profile = await getProfileByUsername(username)
  if (!profile || !profile.is_public) notFound()

  const [favoriteArtists, blog] = await Promise.all([
    getProfileFavoriteArtists(profile.id),
    getBlogByUserId(profile.id),
  ])

  // Get user's blog posts if they have a blog
  let blogPosts: any[] = []
  if (blog) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('blog_posts')
      .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, like_count')
      .eq('blog_id', blog.id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(5)
    blogPosts = data || []
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long' })

  return <ProfileView profile={profile} favoriteArtists={favoriteArtists} blog={blog} blogPosts={blogPosts} memberSince={memberSince} />
}

function ProfileView({ profile, favoriteArtists, blog, blogPosts, memberSince }: any) {
  const socials = [
    profile.social_instagram && { name: 'Instagram', url: profile.social_instagram },
    profile.social_twitter && { name: 'X / Twitter', url: profile.social_twitter },
    profile.social_spotify && { name: 'Spotify', url: profile.social_spotify },
    profile.social_youtube && { name: 'YouTube', url: profile.social_youtube },
    profile.social_tiktok && { name: 'TikTok', url: profile.social_tiktok },
    profile.website && { name: 'Svetainė', url: profile.website },
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      {/* Hero */}
      <div className="relative h-48 bg-gradient-to-br from-[#111822] to-[#080c12]">
        {profile.cover_image_url && <img src={profile.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080c12] to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-6 -mt-16 relative">
        {/* Avatar + Name */}
        <div className="flex items-end gap-4 mb-6">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="w-28 h-28 rounded-full border-4 border-[#080c12] object-cover" />
          ) : (
            <div className="w-28 h-28 rounded-full border-4 border-[#080c12] bg-[#111822] flex items-center justify-center text-3xl font-bold text-[#334058]">
              {(profile.full_name || profile.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="pb-2">
            <h1 className="text-2xl font-extrabold" style={{ fontFamily: "'Outfit', sans-serif" }}>{profile.full_name || profile.username}</h1>
            <p className="text-sm text-[#5e7290]">@{profile.username} · narys nuo {memberSince}</p>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && <p className="text-sm text-[#b0bdd4] leading-relaxed mb-6 max-w-xl">{profile.bio}</p>}

        {/* Socials */}
        {socials.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {socials.map((s: any) => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener" className="text-xs font-semibold text-[#b0bdd4] bg-white/[.04] border border-white/[.06] rounded-full px-3 py-1.5 hover:bg-white/[.07] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {s.name}
              </a>
            ))}
          </div>
        )}

        {/* Favorite Artists */}
        {favoriteArtists.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>Mėgstami atlikėjai</h2>
            <div className="flex flex-wrap gap-2">
              {favoriteArtists.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="flex items-center gap-2 bg-white/[.03] border border-white/[.06] rounded-lg px-3 py-2 hover:border-white/[.1] transition text-sm font-semibold">
                  {a.cover_image_url ? <img src={a.cover_image_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-[#111822]" />}
                  {a.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Blog Posts */}
        {blog && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {blog.title}
              </h2>
              <Link href={`/blogas/${blog.slug}`} className="text-xs text-[#f97316] font-semibold hover:underline">Visi straipsniai →</Link>
            </div>
            {blogPosts.length > 0 ? (
              <div className="space-y-3">
                {blogPosts.map((p: any) => (
                  <Link key={p.id} href={`/blogas/${blog.slug}/${p.slug}`} className="flex gap-4 p-3 rounded-lg border border-white/[.04] bg-white/[.02] hover:border-white/[.08] transition group">
                    {p.cover_image_url && <img src={p.cover_image_url} alt="" className="w-20 h-14 rounded object-cover flex-shrink-0" />}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#f0f2f5] group-hover:text-[#f97316] transition truncate">{p.title}</h3>
                      {p.summary && <p className="text-xs text-[#5e7290] mt-0.5 line-clamp-2">{p.summary}</p>}
                      <div className="text-[10px] text-[#334058] mt-1">
                        {new Date(p.published_at).toLocaleDateString('lt-LT')} · {p.reading_time_min || 1} min · ♥ {p.like_count}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#334058]">Dar nėra straipsnių</p>
            )}
          </section>
        )}

        {/* Stats */}
        <div className="text-xs text-[#334058] pb-12">
          {blogPosts.length > 0 && <span>{blogPosts.length} straipsniai · </span>}
          <span>Narys nuo {memberSince}</span>
        </div>
      </div>
    </div>
  )
}
