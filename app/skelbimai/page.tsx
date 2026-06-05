import type { Metadata } from 'next'
import { SkelbimaiHubClient } from '@/components/skelbimai/SkelbimaiHubClient'
import { listListings, type ListingType, type Listing } from '@/lib/skelbimai'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Skelbimai — įrašai, instrumentai, paslaugos, muzikantai | music.lt',
  description: 'Nemokama muzikos bendruomenės skelbimų lenta. Vinilai ir CD, instrumentai, muzikos paslaugos, grupių nariai ir muzikantai — viskas vienoje vietoje.',
}

export default async function SkelbimaiHub() {
  const [ploksteles, instrumentai, paslaugos, rysiai, kita] = await Promise.all([
    listListings({ type: 'ploksteles', limit: 12, sort: 'newest' }),
    listListings({ type: 'instrumentai', limit: 12, sort: 'newest' }),
    listListings({ type: 'paslaugos', limit: 12, sort: 'newest' }),
    listListings({ type: 'rysiai', limit: 12, sort: 'newest' }),
    listListings({ type: 'kita', limit: 12, sort: 'newest' }),
  ])
  const itemsByType: Record<ListingType, Listing[]> = { ploksteles, instrumentai, paslaugos, rysiai, kita }

  return <SkelbimaiHubClient itemsByType={itemsByType} />
}
