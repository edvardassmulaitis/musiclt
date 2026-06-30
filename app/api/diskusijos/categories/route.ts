import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Kategorijų sąrašas + įrašų skaičius (Reddit-stiliaus šoninei juostai).
// Kategorija saugoma discussions.tag (text). Skaičiuojam tik realias
// diskusijas (legacy_kind null arba 'discussion'), ne news/events.
const CATEGORIES = [
  'Grupės ir atlikėjai',
  'Dainos',
  'Albumai',
  'Koncertai',
  'Stiliai ir žanrai',
  'TV ir kinas',
  'Sportas',
  'Technika',
  'Pagalba',
  'Kita',
] as const

export async function GET() {
  const supabase = createAdminClient()

  const base = () =>
    supabase
      .from('discussions')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .or('legacy_kind.is.null,legacy_kind.eq.discussion')
      // Tas pats filtras kaip /api/diskusijos — slepiam tuščius legacy stub'us,
      // kad sidebar skaičiai sutaptų su realiai rodomu sąrašu.
      .or('comment_count.gt.0,user_id.not.is.null')

  const [totalRes, ...catResults] = await Promise.all([
    base(),
    ...CATEGORIES.map(c => base().eq('tag', c)),
  ])

  const categories = CATEGORIES.map((key, i) => ({
    key,
    count: catResults[i].count || 0,
  })).filter(c => c.count > 0)

  return NextResponse.json(
    { total: totalRes.count || 0, categories },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    },
  )
}
