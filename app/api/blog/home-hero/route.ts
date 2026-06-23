import { NextResponse } from 'next/server'
import { getHomeHeroPosts } from '@/lib/supabase-blog'
import { resolveBlogThumbs } from '@/lib/blog-thumb'

// Admine pažymėti vartotojų įrašai (blog_posts.home_hero=true) — rodomi
// pradžios hero feede tarp naujienų. Grąžinam jau paruoštą hero-slide formą.

const KIND: Record<string, { label: string; color: string }> = {
  apzvalga:  { label: 'Muzikos apžvalga', color: '#ef4444' },
  koncertai: { label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  topas:     { label: 'Topas', color: '#f59e0b' },
  atradimas: { label: 'Atradimas', color: '#f97316' },
  kuryba:    { label: 'Kūryba', color: '#ec4899' },
  vertimas:  { label: 'Vertimas', color: '#10b981' },
  irasas:    { label: 'Įrašas', color: '#94a3b8' },
}

function kindKey(postType: string | null, editorialType: string | null): string {
  if (postType === 'topas') return 'topas'
  if (postType === 'review' || editorialType === 'recenzija') return 'apzvalga'
  if (editorialType === 'koncertai') return 'koncertai'
  if (editorialType === 'atradimas') return 'atradimas'
  if (postType === 'creation') return 'kuryba'
  if (postType === 'translation') return 'vertimas'
  return 'irasas'
}

export async function GET() {
  try {
    const rows = await getHomeHeroPosts(8)
    const thumbs = await resolveBlogThumbs(rows as any[])
    const posts = (rows as any[]).map((p) => {
      const blogs = Array.isArray(p.blogs) ? p.blogs[0] : p.blogs
      const prof = Array.isArray(blogs?.profiles) ? blogs.profiles[0] : blogs?.profiles
      const blogSlug = blogs?.slug || prof?.username || null
      const k = KIND[kindKey(p.post_type, p.editorial_type)] || KIND.irasas
      return {
        id: p.id,
        title: p.title,
        href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
        cover: p.cover_image_url || thumbs.get(p.id) || null,
        chip: k.label,
        chipBg: k.color,
        published_at: p.published_at,
        author: prof?.username || prof?.full_name || null,
      }
    })
    return NextResponse.json({ posts }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ posts: [], error: e.message }, { status: 200 })
  }
}
