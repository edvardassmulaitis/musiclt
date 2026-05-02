// lib/tiptap-iframe.ts
//
// Tiptap extension'as kuris (1) leidžia iframe'us schemoje (kad išliktų
// per parse-render ciklą), ir (2) automatiškai konvertuoja paste'intas
// YouTube / Spotify / SoundCloud nuorodas į embed iframe'ą. Kitos nuorodos
// lieka kaip standartiniai Link mark'ai (Tiptap default'as).
//
// Be šios extension'os Tiptap StarterKit nepalaiko iframe — bet koks
// editor.commands.insertContent('<iframe ...>') stripp'inamas pirmu pat
// re-render'u. Taip pat — `nodePasteRule` leidžia switch'inti į embed
// nodavimą paste laiku, vietoj rankinio handlePaste chaining.

import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core'

// Pratęsiam regex'us iki URL pabaigos (whitespace) — kitaip nodePasteRule
// nutraukia rungtynes po video ID'o, ir likę params (?v=...&list=...) lieka
// kaip tekstas po embed'o.
const YT_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})\S*/g
const SPOTIFY_REGEX = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)\S*/g
const SOUNDCLOUD_REGEX = /https?:\/\/(?:www\.)?soundcloud\.com\/\S+/g

export const Iframe = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,        // Negali turėti vidinio turinio — tik attrs
  selectable: true,
  draggable: true,   // Galim drag'inti tarp paragrafų editor'iuje

  addAttributes() {
    return {
      src: { default: null },
      width: { default: '100%' },
      height: { default: '400' },
      frameborder: { default: '0' },
      allow: { default: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' },
      allowfullscreen: { default: true },
      'data-type': { default: null },     // 'youtube' | 'spotify' | etc — paskui CSS aspect ratio'ams
      'data-orig-url': { default: null }, // originalo URL — kad galėtum vėliau re-detectinti
      style: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'iframe' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes)]
  },

  addPasteRules() {
    return [
      // YouTube — 480px max-width, aspect-ratio 16:9 (kad embed neimt'u
      // visos straipsnio juostos, bet liktų atpažįstamas)
      nodePasteRule({
        find: YT_REGEX,
        type: this.type,
        getAttributes: (match) => ({
          src: `https://www.youtube.com/embed/${match[1]}`,
          width: '480',
          height: '270',
          'data-type': 'youtube',
          'data-orig-url': match[0],
          style: 'border:0;border-radius:10px;margin:16px 0;max-width:100%;aspect-ratio:16/9;width:480px;height:auto',
        }),
      }),
      // Spotify (track/album/playlist/episode) — siauresnis player'is
      nodePasteRule({
        find: SPOTIFY_REGEX,
        type: this.type,
        getAttributes: (match) => {
          const kind = match[1]
          const id = match[2]
          const height = kind === 'track' ? '152' : '352'
          return {
            src: `https://open.spotify.com/embed/${kind}/${id}?theme=0`,
            width: '480',
            height,
            'data-type': `spotify-${kind}`,
            'data-orig-url': match[0],
            style: `border:0;border-radius:10px;margin:16px 0;max-width:100%;width:480px;height:${height}px`,
          }
        },
      }),
      // SoundCloud
      nodePasteRule({
        find: SOUNDCLOUD_REGEX,
        type: this.type,
        getAttributes: (match) => ({
          src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(match[0])}&color=%23f97316&auto_play=false`,
          width: '480',
          height: '166',
          'data-type': 'soundcloud',
          'data-orig-url': match[0],
          style: 'border:0;border-radius:10px;margin:16px 0;max-width:100%;width:480px;height:166px',
        }),
      }),
    ]
  },
})
