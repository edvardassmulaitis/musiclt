// app/naujienos/kategorija/[slug]/page.tsx
//
// SEO landing'as — naujienos pagal kategoriją (AI-priskirta: release/tour/
// performance/career_step/other). dynamicParams=false → tikras 404.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { NEWS_BROWSE_CATEGORIES, findCategoryBySlug } from '@/lib/news-taxonomy'
import { SITE_URL } from '@/lib/artist-browse'
import NewsLanding from '@/components/naujienos/NewsLanding'

export const revalidate = 300
export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return NEWS_BROWSE_CATEGORIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cat = findCategoryBySlug(slug)
  if (!cat) return { title: 'Naujiena nerasta' }
  const title = `${cat.label} — muzikos naujienos | music.lt`
  const url = `${SITE_URL}/naujienos/kategorija/${cat.slug}`
  return {
    title,
    description: cat.blurb,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description: cat.blurb, url, siteName: 'music.lt', locale: 'lt_LT' },
    twitter: { card: 'summary_large_image', title, description: cat.blurb },
  }
}

export default async function CategoryNewsPage({ params }: Props) {
  const { slug } = await params
  const cat = findCategoryBySlug(slug)
  if (!cat) notFound()

  return (
    <NewsLanding
      h1={cat.label}
      intro={cat.blurb}
      path={`/naujienos/kategorija/${cat.slug}`}
      crumb={cat.label}
      accent={cat.accent}
      icon={cat.icon}
      lockedCategory={cat.key}
    />
  )
}
