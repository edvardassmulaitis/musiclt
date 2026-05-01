// components/blog/post-types.ts
//
// Server-safe constants ir tipai. Atskiriam nuo PostTypeSelector.tsx, kad
// galėtume importuoti iš server component'ų be 'use client' grandinės.
//
// Visi tipai dalinasi pagrindiniu site accent (#f97316 orange) — atskira
// spalva paliekama tik subtle accent badge'uose feed card'uose, kad
// vizualiai ne triukšmautų.

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
  hint: string
}> = [
  { type: 'article',     label: 'Straipsnis',  hint: 'Ilgesnis tekstas' },
  { type: 'quick',       label: 'Quick',       hint: 'Tik nuoroda + 1-2 sakiniai' },
  { type: 'review',      label: 'Recenzija',   hint: 'Su balu ir music.lt įrašu' },
  { type: 'translation', label: 'Vertimas',    hint: 'Su nuoroda į originalą' },
  { type: 'creation',    label: 'Kūryba',      hint: 'Eilėraštis, esė, fiction' },
  { type: 'journal',     label: 'Dienoraštis', hint: 'Asmeninis įrašas' },
]
