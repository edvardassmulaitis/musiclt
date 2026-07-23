// app/page.tsx — HOMEPAGE.
//
// 2026-07-23 CUTOVER: pagrindinis puslapis dabar rodo v2 layout'ą (app/v2/HomeView.tsx).
// Senas HomeClient variantas išeina iš naudojimo (pats HomeClient failas kol kas
// lieka — jį naudoja admin/feed ir cron). Svetainė dar nebuvo live, todėl staging'o
// nelaikom — v2 tampa main tiesiogiai. Indexable metadata paveldima iš layout.tsx
// (title/description/OG), noindex NEnustatom.

export { default } from './v2/HomeView'

// ISR — HTML cache'inamas 5 min, stale-while-revalidate.
export const revalidate = 300
