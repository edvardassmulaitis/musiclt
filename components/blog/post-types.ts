// components/blog/post-types.ts
//
// Server-safe konstanos. Po 2026-05-02 supaprastinimo:
//   - Drop'inom quick (paste-and-go logika dabar gyvena pačiame editor'iuje)
//   - Drop'inom journal (nesiskyrė nuo article)
//   - Pridedam event (renginio apžvalga su target_event_id)
//
// `article` lieka default'inis tipas — kvietėjas neturi rinkti, jis
// matomas selectoriuje pasyviai aktyvus.

export type BlogPostType =
  | 'article'
  | 'review'
  | 'translation'
  | 'creation'
  | 'event'
  | 'topas'

export const POST_TYPE_OPTIONS: Array<{
  type: BlogPostType
  label: string
  hint: string
}> = [
  { type: 'article',     label: 'Įrašas',     hint: 'Tekstas + nuotraukos + embed\'ai' },
  { type: 'review',      label: 'Recenzija',  hint: 'Su balu ir music.lt įrašu' },
  { type: 'topas',       label: 'Topas',      hint: 'Numeruotas sąrašas — atlikėjai/albumai/dainos' },
  { type: 'translation', label: 'Vertimas',   hint: 'LT vertimas pasirinktos dainos' },
  { type: 'creation',    label: 'Kūryba',     hint: 'Eilėraštis, esė, fiction' },
  { type: 'event',       label: 'Renginys',   hint: 'Renginio apžvalga' },
]
