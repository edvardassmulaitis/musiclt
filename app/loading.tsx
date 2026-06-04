// Root route loader — rodomas kaip Suspense fallback per navigaciją / SSR
// streaming'ą. SVARBU: šis root-level loading.tsx taip pat veikia kaip Suspense
// boundary CSR-bailout puslapiams (useSearchParams() static prerender metu,
// pvz. /admin/artists/new) — be jo Vercel build krenta su
// „useSearchParams() should be wrapped in a suspense boundary".
//
// Anksčiau čia buvo HOME-formos skeleton'as → naviguojant į Pradžią atrodė
// kaip pilnas puslapio reload'as, o kiti meniu punktai persijungdavo smooth.
// Dabar — bendras PageLoader (centrinis equalizer), TOKS PAT kaip atlikėjo/
// albumo/dainos loading.tsx → vienodas, neįkyrus loading state'as visur.
import { PageLoader } from '@/components/PageLoader'

export default function Loading() {
  return <PageLoader variant="generic" />
}
