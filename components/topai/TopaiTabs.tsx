'use client'

/**
 * TopaiTabs — viršutiniai tab'ai topų zonai (toks pat SegTabs stilius kaip
 * /srautas Sekami|Tau ir Pokalbiai). Route-based: kiekvienas tab'as = Link.
 * Aktyvus nustatomas pagal pathname.
 *
 *   Pasaulio topai (/topai) · Music.lt TOP 40 (/top40) · LT TOP 30 (/top30)
 */

import { usePathname } from 'next/navigation'
import { SegTabs } from '@/components/ui/SegTabs'

export function TopaiTabs() {
  const pathname = usePathname() || '/topai'
  const value = pathname.startsWith('/top40') ? 'top40'
    : pathname.startsWith('/top30') ? 'top30'
    : 'topai'

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 16px' }}>
      <SegTabs
        value={value}
        items={[
          { key: 'topai', label: 'Pasaulio topai', href: '/topai' },
          { key: 'top40', label: 'Music.lt TOP 40', href: '/top40' },
          { key: 'top30', label: 'LT TOP 30', href: '/top30' },
        ]}
      />
    </div>
  )
}
