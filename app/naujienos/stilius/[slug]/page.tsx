// app/naujienos/stilius/[slug]/page.tsx
//
// SEO landing'as — naujienos pagal muzikos stilių (top-level žanrą). Slug'as
// sutampa su /zanrai/[slug] (ltSlugify). dynamicParams=false → nežinomi slug'ai
// duoda tikrą 404.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { NEWS_STYLES, findStyleBySlug } from '@/lib/news-taxonomy'
import { SITE_URL } from '@/lib/artist-browse'
import NewsLanding from '@/components/naujienos/NewsLanding'

export const revalidate = 300
export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return NEWS_STYLES.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const style = findStyleBySlug(slug)
  if (!style) return { title: 'Naujiena nerasta' }
  const title = `${style.name} naujienos — albumai, koncertai, scena | music.lt`
  const desc = `Naujausios ${style.name.toLowerCase()} naujienos: nauji išleidimai, koncertai, turai ir atlikėjų scena Lietuvoje ir pasaulyje.`
  const url = `${SITE_URL}/naujienos/stilius/${style.slug}`
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description: desc, url, siteName: 'music.lt', locale: 'lt_LT' },
    twitter: { card: 'summary_large_image', title, description: desc },
  }
}

export default async function StyleNewsPage({ params }: Props) {
  const { slug } = await params
  const style = findStyleBySlug(slug)
  if (!style) notFound()

  return (
    <NewsLanding
      h1={`${style.name} naujienos`}
      intro={`Naujausios ${style.name.toLowerCase()} naujienos — nauji albumai ir singlai, koncertai, turai bei scenos įvykiai. Sek mėgstamą stilių vienoje vietoje.`}
      path={`/naujienos/stilius/${style.slug}`}
      crumb={style.name}
      accent={style.accent}
      icon={style.icon}
      lockedStyle={style.id}
    />
  )
}
