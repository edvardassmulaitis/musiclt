// lib/tiptap-music-card.ts
//
// Custom Tiptap node music.lt entity'iams (atlikėjui/albumui/dainai).
// Be šios extension'os Tiptap StarterKit'as flattin'tų mūsų <a class="ml-card">
// struktūrą — Link extension'as <a> traktuoja kaip "link mark", ne block,
// tad inner spans virstų plain text'u.
//
// Su šituo node'u, music kortelės survive'ina parse-render ciklą ir lieka
// vientisa kortelė tiek editor'iaus view'e, tiek serializuotame HTML'e
// (kuris saugomas blog_posts.content). Naudojam background-image (NE <img>)
// kad Image extension'as nepradėtų hijackin'ti cover'io.

import { Node, mergeAttributes } from '@tiptap/core'

export type MusicCardAttrs = {
  type: 'grupe' | 'albumas' | 'daina' | null
  entityId: string | null
  slug: string | null
  title: string | null
  artist: string | null
  imageUrl: string | null
}

const TYPE_PATHS: Record<string, string> = {
  grupe: 'atlikejai',
  albumas: 'albumai',
  daina: 'dainos',
}

const TYPE_LABELS: Record<string, string> = {
  grupe: 'Atlikėjas',
  albumas: 'Albumas',
  daina: 'Daina',
}

export const MusicCard = Node.create({
  name: 'musicCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      type:      { default: null },
      entityId:  { default: null },
      slug:      { default: null },
      title:     { default: null },
      artist:    { default: null },
      imageUrl:  { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'a.ml-card',
      getAttrs: (el) => {
        const a = el as HTMLAnchorElement
        return {
          type: a.dataset.mlType || null,
          entityId: a.dataset.mlId || null,
          slug: a.dataset.mlSlug || null,
          title: a.dataset.mlTitle || null,
          artist: a.dataset.mlArtist || null,
          imageUrl: a.dataset.mlImg || null,
        }
      },
    }]
  },

  renderHTML({ node }) {
    const attrs = node.attrs as MusicCardAttrs
    const typePath = TYPE_PATHS[attrs.type || ''] || 'atlikejai'
    const url = `/${typePath}/${attrs.slug || attrs.entityId || ''}`
    const typeLabel = TYPE_LABELS[attrs.type || ''] || ''

    const coverStyle = attrs.imageUrl
      ? `display:inline-block;width:44px;height:44px;border-radius:6px;background-image:url('${attrs.imageUrl}');background-size:cover;background-position:center;flex-shrink:0`
      : `display:inline-block;width:44px;height:44px;border-radius:6px;background:rgba(255,255,255,0.05);flex-shrink:0`

    return [
      'a',
      mergeAttributes({
        href: url,
        class: 'ml-card',
        'data-ml-type': attrs.type || '',
        'data-ml-id': attrs.entityId || '',
        'data-ml-slug': attrs.slug || '',
        'data-ml-title': attrs.title || '',
        'data-ml-artist': attrs.artist || '',
        'data-ml-img': attrs.imageUrl || '',
        style: 'display:flex;gap:10px;align-items:center;padding:10px;margin:14px 0;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);text-decoration:none;color:inherit',
      }),
      ['span', { style: coverStyle }],
      ['span', { style: 'display:flex;flex-direction:column;gap:1px;min-width:0;flex:1' },
        ['span', { style: 'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#5e7290' }, typeLabel],
        ['span', { style: 'font-size:13px;font-weight:600;color:#dde8f8' }, attrs.title || ''],
        attrs.artist
          ? ['span', { style: 'font-size:11px;color:#5e7290' }, attrs.artist]
          : ['span', { style: 'display:none' }],
      ],
    ]
  },
})
