// components/blog/post-types.ts
//
// Server-safe constants ir tipai. Atskiriam nuo PostTypeSelector.tsx, kad
// galėtume importuoti iš server component'ų be 'use client' grandinės.

export type BlogPostType =
  | 'article'
  | 'quick'
  | 'review'
  | 'translation'
  | 'creation'
  | 'journal'

export const POST_TYPE_OPTIONS: Array<{
  type: BlogPostType
  label: string
  icon: string
  hint: string
  accent: string
}> = [
  { type: 'article',     label: 'Straipsnis',  icon: '📝', hint: 'Ilgesnis tekstas su formatavimu', accent: '#3b82f6' },
  { type: 'quick',       label: 'Quick',       icon: '⚡', hint: 'Įklijuok video/audio nuorodą + 1-2 sakiniai', accent: '#f97316' },
  { type: 'review',      label: 'Recenzija',   icon: '⭐', hint: 'Recenzuok albumą ar dainą su balu', accent: '#eab308' },
  { type: 'translation', label: 'Vertimas',    icon: '🌐', hint: 'Versta iš kitos kalbos su kreditu', accent: '#22c55e' },
  { type: 'creation',    label: 'Kūryba',      icon: '✍️', hint: 'Eilėraštis, esė, beletristika', accent: '#a855f7' },
  { type: 'journal',     label: 'Dienoraštis', icon: '📔', hint: 'Asmeninis įrašas, koncerto patirtis', accent: '#ec4899' },
]
