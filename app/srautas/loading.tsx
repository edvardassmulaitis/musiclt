// /srautas navigacijos loaderis — bendras PageLoader (centrinis equalizer),
// toks pat kaip visur kitur. Shell'as (header + apatinis baras) lieka matomas.
import { PageLoader } from '@/components/PageLoader'

export default function Loading() {
  return <PageLoader variant="generic" />
}
