// Loading UI client-side navigacijai (Link click).
// Tiesiogiai delegate į PageLoader — toks pats kaip Suspense fallback'as
// page.tsx viduje (vieningas vizualas: brand + equalizer + structural hints).
import { PageLoader } from '@/components/PageLoader'

export default function Loading() {
  return <PageLoader variant="artist" />
}
