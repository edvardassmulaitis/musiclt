// /pokalbiai navigacijos loaderis — bendras PageLoader (centrinis equalizer),
// kad perėjimas į Pokalbius rodytų vienodą loading state'ą.
import { PageLoader } from '@/components/PageLoader'

export default function Loading() {
  return <PageLoader variant="generic" />
}
