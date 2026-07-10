// app/zaidimai/gilyn/page.tsx
//
// GILYN — kasdienis muzikos atradimo žaidimas.
// 20 plokštelių. Viena vieta. Kur šiandien nusikasi?

import { Metadata } from 'next'
import GilynClient from './GilynClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gilyn — dienos dėžė | music.lt',
  description: '20 plokštelių. Viena vieta. Pasirink dienos vinilą ir kaskis gilyn per muzikos pasaulį — kiekvienas pasirinkimas atidengia tavo asmeninį muzikos žemėlapį.',
}

export default function GilynPage() {
  return <GilynClient />
}
