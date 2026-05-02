import { redirect } from 'next/navigation'

// Senas /topas URL'as suskeldintas į tris naujus puslapius:
//   /topai  — overview hub (visi topai vienoje vietoje)
//   /top40  — pasaulinis topas (atskira chart vykdomoji vieta)
//   /top30  — lietuviškas topas
// Senas link'as redirect'ina į hub'ą.
export default function TopasRedirect() {
  redirect('/topai')
}
