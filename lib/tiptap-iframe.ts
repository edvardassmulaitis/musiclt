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

const YT_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/g
const SPOTIFY_REGEX = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/g
const SOUNDCLOUD_REGEX = /https?:\/\/soundcloud\.com\/[^\s]+/g

export const Iframe = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,        // Negali turėti vidinio turinio — tik attrs
  selectable: true,
  draggable: false,

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
      // YouTube
      nodePasteRule({
        find: YT_REGEX,
        type: this.type,
        getAttributes: (match) => ({
          src: `https://www.youtube.com/embed/${match[1]}`,
          width: '100%',
          height: '315',
          'data-type': 'youtube',
          'data-orig-url': match[0],
          style: 'aspect-ratio:16/9;border:0;border-radius:10px;margin:16px 0;width:100%;height:auto',
        }),
      }),
      // Spotify (track/album/playlist/episode)
      nodePasteRule({
        find: SPOTIFY_REGEX,
        type: this.type,
        getAttributes: (match) => {
          const kind = match[1]
          const id = match[2]
          const height = kind === 'track' ? '152' : '352'
          return {
            src: `https://open.spotify.com/embed/${kind}/${id}?theme=0`,
            width: '100%',
            height,
            'data-type': `spotify-${kind}`,
            'data-orig-url': match[0],
            style: 'border:0;border-radius:10px;margin:16px 0',
          }
        },
      }),
      // SoundCloud — paste'intas link'as virsta iframe player'iu
      nodePasteRule({
        find: SOUNDCLOUD_REGEX,
        type: this.type,
        getAttributes: (match) => ({
          src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(match[0])}&color=%23f97316&auto_play=false`,
          width: '100%',
          height: '166',
          'data-type': 'soundcloud',
          'data-orig-url': match[0],
          style: 'border:0;border-radius:10px;margin:16px 0',
        }),
      }),
    ]
  },
})
