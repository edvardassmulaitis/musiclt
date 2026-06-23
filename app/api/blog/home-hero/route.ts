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

function ytId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|vi\/|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(url) ? url : null)
}
function plain(html: string | null | undefined, max = 400): string {
  if (!html) return ''
  const t = String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
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
      const cover = p.cover_image_url || thumbs.get(p.id) || null
      // Muzika: embed YouTube ARBA (jei viršelis = YouTube kadras) iš jo ištrauktas id.
      const videoId = (p.embed_type === 'youtube' ? ytId(p.embed_url) : null) || ytId(p.embed_thumbnail_url) || ytId(cover) || null
      return {
        id: p.id,
        title: p.title,
        href: blogSlug ? `/blogas/${blogSlug}/${p.slug}` : '/blogas',
        cover,
        chip: k.label,
        chipBg: k.color,
        published_at: p.published_at,
        author: prof?.username || prof?.full_name || null,
        // Reader (mobile reels) — pilnesnis atvaizdavimas: tekstas + muzika.
        excerpt: p.summary ? plain(p.summary, 400) : plain(p.content, 400),
        videoId,
        songTitle: p.embed_title || null,
        songArtist: null,
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
