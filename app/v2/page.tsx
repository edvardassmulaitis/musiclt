// app/v2/page.tsx — PREVIEW alias to the main homepage view (same as „/").
// Laikomas testavimui; noindex. Turinys — app/v2/HomeView.tsx.
export { default } from './HomeView'

export const revalidate = 300
export const metadata = {
  title: 'Music.lt v2 — peržiūra',
  robots: { index: false, follow: false },
}
