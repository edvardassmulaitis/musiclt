import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jessica Shy — Lietuvos pop žvėris',
  description:
    'Jessica Shy — viena klausomiausių Lietuvos pop atlikėjų. Keturi #1 albumai, rekordiniai stadionų koncertai, dešimtys MAMA apdovanojimų. Klausyk naujausios muzikos.',
  openGraph: {
    title: 'Jessica Shy',
    description: 'Viena klausomiausių Lietuvos pop atlikėjų. Klausyk naujausios muzikos.',
    images: ['/landing/jessicashy/hero.jpg'],
    type: 'profile',
  },
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children
}
