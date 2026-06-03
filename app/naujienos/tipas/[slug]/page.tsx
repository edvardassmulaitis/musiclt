// app/naujienos/tipas/[slug]/page.tsx
//
// SEO landing'as — naujienos pagal redakcinį tipą (Naujiena/Interviu/Recenzija/
// Foto/Topai/Koncertai/Klipas/Kita). AI-priskirtas (news_category stulpelis).
// dynamicParams=false → tikras 404.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { NEWS_TYPES, findTypeBySlug } from '@/lib/news-taxonomy'
import { SITE_URL } from '@/lib/artist-browse'
import NewsLanding from '@/components/naujienos/NewsLanding'

export const revalidate = 300
export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return NEWS_TYPES.map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const t = findTypeBySlug(slug)
  if (!t) return { title: 'Naujiena nerasta' }
  const title = `${t.labelPlural} — muzikos naujienos | music.lt`
  const url = `${SITE_URL}/naujienos/tipas/${t.slug}`
  return {
    title,
    description: t.blurb,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description: t.blurb, url, siteName: 'music.lt', locale: 'lt_LT' },
    twitter: { card: 'summary_large_image', title, description: t.blurb },
  }
}

export default async function TypeNewsPage({ params }: Props) {
  const { slug } = await params
  const t = findTypeBySlug(slug)
  if (!t) notFound()

  return (
    <NewsLanding
      h1={t.labelPlural}
      intro={t.blurb}
      path={`/naujienos/tipas/${t.slug}`}
      crumb={t.labelPlural}
      accent={t.accent}
      icon={t.icon}
      lockedCategory={t.key}
    />
  )
}
