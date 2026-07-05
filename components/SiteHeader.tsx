'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HeaderAuth } from '@/components/HeaderAuth'
import { NotificationsBell } from '@/components/NotificationsBell'
import { MessagesBell } from '@/components/MessagesBell'
import { MasterSearch } from '@/components/MasterSearch'
import { RadarSweepMini } from '@/components/RadarSweepMini'
import { openQuickCreate } from '@/components/QuickCreate'
import { useSite } from '@/components/SiteContext'
import { proxyImg } from '@/lib/img-proxy'
import { GENRE_COLORS, GENRE_COLOR_BY_NAME } from '@/lib/genre-colors'
import { NEWS_STYLES, NEWS_TYPES, NEWS_SCOPES } from '@/lib/news-taxonomy'
import { LISTING_TYPES, LISTING_TYPE_ORDER } from '@/lib/skelbimai'

// Stilių išdėstymo tvarka nav dropdown'e (2 eilutės po 4 — Edvardo prašymu 2026-05-31).
// 1 eilutė: Rokas, Sunkioji, Klasika, Alternatyva · 2 eilutė: Pop, Hip-hop, Elektronika, Kiti.
// NETvarkom global GENRE_COLORS array'aus (getGenreColor naudoja indeksą), tik display order.
const STYLE_NAV_ORDER = [
  'Roko muzika', 'Sunkioji muzika', 'Rimtoji muzika', 'Alternatyvioji muzika',
  'Pop, R&B muzika', "Hip-hop'o muzika", 'Elektroninė, šokių muzika', 'Kitų stilių muzika',
]
const STYLES_ORDERED = STYLE_NAV_ORDER
  .map(n => GENRE_COLOR_BY_NAME[n])
  .filter(Boolean) as typeof GENRE_COLORS

/* ──────────────────────────────────────────────────────────────────
 * Top meniu — 5 sekcijos su DINAMINIAIS rich preview dropdown'ais.
 *
 * Desktop hover atveria didelį panel'ą su realiais atlikėjais,
 * albumais, renginiais ar naujienomis (fetch'inta iš /api/nav-preview).
 *
 * Mobile drawer: 5 didelės gradient kortelės.
 * ────────────────────────────────────────────────────────────────── */

type NavItem = {
  key: 'muzika' | 'topai' | 'renginiai' | 'naujienos' | 'atradimai' | 'skelbimai' | 'bendruomene'
  label: string
  href: string
  match: string[]
  desc: string
  accent: string
  icon: React.ReactNode
}

type NavPreview = {
  radar?:       { id: number; slug: string; name: string; image: string | null }[]
  artistsLt:    { id: number; slug: string; name: string; image: string | null }[]
  artistsWorld: { id: number; slug: string; name: string; image: string | null }[]
  albums:       { id: number; slug: string; title: string; image: string | null; year: number | null; artist: string; artistSlug: string }[]
  albumsLt?:    { id: number; slug: string; title: string; image: string | null; year: number | null; artist: string; artistSlug: string }[]
  albumsWorld?: { id: number; slug: string; title: string; image: string | null; year: number | null; artist: string; artistSlug: string }[]
  songsLt?:     { id: number; slug: string | null; title: string; image: string | null; artist: string; artistSlug: string }[]
  songsWorld?:  { id: number; slug: string | null; title: string; image: string | null; artist: string; artistSlug: string }[]
  memberTops?:  { id: number; title: string; image: string | null; author: string; href: string }[]
  eventsHome?:   { href: string; title: string; image: string | null; meta: string; collage?: string[]; flag?: string }[]
  eventsAbroad?: { href: string; title: string; image: string | null; meta: string; collage?: string[]; flag?: string }[]
  festivals?:    { href: string; title: string; image: string | null; meta: string; collage?: string[]; flag?: string }[]
  recordings?:   { href: string; title: string; image: string | null; meta: string }[]
  reportages?:   { href: string; title: string; image: string | null; meta: string }[]
  members?:      { href: string; name: string; avatar: string | null; taste?: string | null }[]
  discussions?:  { href: string; title: string; image: string | null; meta: string }[]
  reviewPosts?:  { href: string; title: string; image: string | null; meta: string; tag?: string | null }[]
  discoveries?:  { href: string; title: string; image: string | null; meta: string }[]
  chartLtSongs?:    { href: string; title: string; artist: string; image: string | null }[]
  chartLtAlbums?:   { href: string; title: string; artist: string; image: string | null }[]
  chartWorldSongs?: { href: string; title: string; artist: string; image: string | null }[]
  chartWorldAlbums?:{ href: string; title: string; artist: string; image: string | null }[]
  chartsLt?:    { id: number; source: string; chartKey: string; title: string; subtitle: string | null; scope: string; country: string | null; accent: string; image: string | null; period: string; size: number }[]
  chartsWorld?: { id: number; source: string; chartKey: string; title: string; subtitle: string | null; scope: string; country: string | null; accent: string; image: string | null; period: string; size: number }[]
  tracks:       { id: number; title: string; image: string | null; year: number | null; artist: string; artistSlug: string }[]
  events:       { id: number; slug: string; title: string; date: string; venue: string | null; image: string | null }[]
  eventsLt?:    { id: number; slug: string; title: string; date: string; venue: string | null; image: string | null }[]
  eventsWorld?: { id: number; slug: string; title: string; date: string; venue: string | null; image: string | null }[]
  news:         { id: number; slug: string; title: string; image: string | null; date: string }[]
  newsLt?:      { id: string | number; slug: string; title: string; image: string | null; date: string | null; category?: string | null }[]
  newsWorld?:   { id: string | number; slug: string; title: string; image: string | null; date: string | null; category?: string | null }[]
  dailySongs?:  { slug: string; title: string; artist: string; image: string | null; date: string | null }[]
  discoveryPosts?: { id: number; slug: string; title: string; blogSlug: string | null; postType: string; image: string | null; author: string }[]
  listings?:    { id: string; type: string; title: string; image: string | null; price: string | null; city: string | null }[]
  /** name → cover_image_url map (admin'as nustato per /admin/genres) */
  genres?:      Record<string, string | null>
  /** žanro name → atlikėjų skaičius (stilių chip'ų rikiavimui) */
  genreCounts?: Record<string, number>
  /** Total atlikėjų skaičiai DB'je — naudojama Daugiau tile'ui */
  counts?: {
    artistsLt:    number
    artistsWorld: number
  }
  /** Topai dropdown'ui — pagrindiniai voting topai inline pozicijos */
  topChart?: {
    top30: TopMini[]
    top40: TopMini[]
  }
  /** „Kiti topai" plytelės (featured išoriniai, admin-managed vizualai) */
  featuredCharts?: {
    id: number; source: string; chartKey: string; title: string; subtitle: string | null
    scope: string; country: string | null; accent: string; image: string | null; period: string; size: number
  }[]
  /** Apdovanojimai / rinkimai — voting kanalai (MAMA, Grammy ir kt.) */
  votings?: { id: number; slug: string; name: string; image: string | null }[]
}
type TopMini = { position: number; title: string; artist: string; artistSlug: string; trackSlug: string | null; image: string | null }

const I = {
  music: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>,
  fun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/></svg>,
  vote: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>,
  award: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11"/></svg>,
  song: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  community: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  market: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18l-2 13H5L3 3z"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>,
  boombox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/></svg>,
  game: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/><path d="M17.32 5H6.68A4.68 4.68 0 0 0 2 9.68V14a4 4 0 0 0 6.7 2.95l.6-.55h5.4l.6.55A4 4 0 0 0 22 14V9.68A4.68 4.68 0 0 0 17.32 5Z"/></svg>,
  quiz: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 4A9 9 0 0 1 21 12Z"/></svg>,
  forum: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h2a2 2 0 0 1 2 2v9l-3-3h-7a2 2 0 0 1-2-2v-1"/><path d="M3 13V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6l-3 3Z"/></svg>,
  blog: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v6h6"/><path d="M19 9v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z"/><path d="M9 13h6M9 17h4"/></svg>,
  vinyl: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>,
  news: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>,
  trending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  /* ── Genre / žanro ikonos ── */
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  headphones: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14a9 9 0 0 1 18 0"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>,
  equalizer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/><line x1="3" y1="9" x2="9" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="15" y1="6" x2="21" y2="6"/></svg>,
  piano: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="1.5"/><line x1="9" y1="6" x2="9" y2="14"/><line x1="15" y1="6" x2="15" y2="14"/><rect x="7" y="6" width="2" height="6" fill="currentColor"/><rect x="13" y="6" width="2" height="6" fill="currentColor"/></svg>,
  flame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>,
  shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  guitar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15"/><path d="m9 9 5 5L15 9 9 9z"/><path d="m22 2-9 9"/><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12"/></svg>,
  festival: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/><circle cx="12" cy="9" r="1.5"/></svg>,
  gallery: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>,
  plane: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>,
  video: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4V8z"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
}

const NAV: NavItem[] = [
  {
    key: 'muzika',
    label: 'Muzika',
    href: '/muzika',
    match: ['/muzika', '/atlikejai', '/albumai', '/zanrai', '/dainos', '/lt', '/nauji-atlikejai', '/muzikos-atradimai'],
    desc: 'Atlikėjai, albumai, dainos',
    accent: '#f59e0b',
    icon: I.music,
  },
  {
    key: 'topai',
    label: 'Topai',
    href: '/topai',
    match: ['/topai', '/topas', '/top40', '/top30', '/balsavimai', '/apdovanojimai'],
    desc: 'Reitingai, balsavimai, apdovanojimai',
    accent: '#ef4444',
    icon: I.trophy,
  },
  {
    key: 'naujienos',
    label: 'Naujienos',
    href: '/naujienos',
    match: ['/naujienos', '/news'],
    desc: 'Releases, interviu, recenzijos',
    accent: '#0ea5e9',
    icon: I.news,
  },
  {
    key: 'renginiai',
    label: 'Koncertai',
    href: '/koncertai',
    match: ['/koncertai', '/renginiai', '/festivaliai', '/galerija', '/verta-keliones', '/koncertu-irasai'],
    desc: 'Koncertai, turai, festivaliai',
    accent: '#3b82f6',
    icon: I.calendar,
  },
  // Skelbimai laikinai paslėpti iš nav (Edvardo prašymu 2026-06-26) — route veikia,
  // tik nerodom meniu. Grįšim vėliau.
  {
    key: 'bendruomene',
    label: 'Bendruomenė',
    href: '/bendruomene',
    match: ['/bendruomene', '/atrasti', '/vartotojai', '/diskusijos', '/pokalbiai', '/boombox', '/zaidimai', '/pramogos', '/dienos-daina', '/blogas', '/feed', '/srautas'],
    desc: 'Nariai, diskusijos, kūryba',
    accent: '#8b5cf6',
    icon: I.users,
  },
]

/* Mobile flat-meniu sub-nuorodos — chip'ai TIK ten, kur yra atskiros sritys,
   kurių nepamatai iš skyriaus pagrindinio puslapio (Koncertai, Bendruomenė).
   Muzika/Topai/Naujienos/Skelbimai hub'ai patys viską parodo → be pills.
   Tik patvirtinti route'ai (kad nebūtų 404). */
const NAV_SUBLINKS: Partial<Record<NavItem['key'], { href: string; label: string; dot?: boolean }[]>> = {
  muzika: [
    { href: '/muzika/lietuviska', label: '🇱🇹 Lietuviška' },
    { href: '/muzika/uzsienio', label: 'Pasaulio' },
    { href: '/nauji-atlikejai', label: 'Naujų atlikėjų radaras', dot: true },
  ],
  topai: [
    { href: '/top30', label: '🇱🇹 LT TOP 30' },
    { href: '/top40', label: 'TOP 40' },
    { href: '/balsavimai', label: 'Balsavimai ir rinkimai' },
  ],
  naujienos: [
    { href: '/naujienos/lietuva', label: '🇱🇹 Lietuvoje' },
    { href: '/naujienos/pasaulis', label: 'Pasaulyje' },
  ],
  renginiai: [
    { href: '/koncertu-irasai', label: 'Įrašai' },
    { href: '/galerija', label: 'Nuotraukos' },
    { href: '/festivaliai', label: 'Festivaliai' },
    { href: '/verta-keliones', label: 'Kelionės' },
  ],
  skelbimai: [
    { href: '/skelbimai/irasai', label: 'Vinilai, kiti įrašai' },
    { href: '/skelbimai/instrumentai', label: 'Instrumentai' },
    { href: '/skelbimai/muzikantai', label: 'Grupės ir nariai' },
  ],
  bendruomene: [
    { href: '/diskusijos', label: 'Diskusijos' },
    { href: '/atradimai', label: 'Atradimai' },
    { href: '/dienos-daina', label: 'Dienos dainos' },
    { href: '/nariai', label: 'Nariai' },
  ],
}

/* ── Header chrome icons ── */
const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const SearchIcon = ({ size = 16 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso)
    const months = ['saus', 'vas', 'kov', 'bal', 'geg', 'birž', 'liep', 'rugp', 'rugs', 'spal', 'lapk', 'gruod']
    return `${d.getDate()} ${months[d.getMonth()]}`
  } catch { return '' }
}

/* Image slot su gražiu fallback'u — gradient su accent + glyph ikona centre.
   Naudojama, kai arba nėra duomenų, arba paveiksliukas dar nesisukrovė. */
function ImageBox({
  src, accent, glyph, className, children,
}: {
  src?: string | null
  accent: string
  glyph?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  const proxied = src ? proxyImg(src) : null
  const rgb = hexToRgb(accent)
  const fallbackBg = `
    radial-gradient(circle at 30% 20%, rgba(${rgb}, 0.55) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(${rgb}, 0.30) 0%, transparent 60%),
    linear-gradient(135deg, rgba(${rgb}, 0.40) 0%, rgba(${rgb}, 0.15) 100%)
  `
  return (
    <span
      className={className}
      style={proxied ? { backgroundImage: `url(${proxied})` } : { background: fallbackBg }}
    >
      {!proxied && glyph && <span className="sh-fallback-glyph">{glyph}</span>}
      {children}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Per-section dropdown content components
 * ──────────────────────────────────────────────────────────────── */

/* LT vėliavos / pasaulio mėlynos juostelės indikatorius eilutės pradžiai. */
function RowStripe({ kind }: { kind: 'lt' | 'world' | 'radar' }) {
  if (kind === 'lt') {
    return (
      <span className="sh-stripe sh-stripe-lt" aria-hidden>
        <span style={{ flex: 1, background: '#FDBA12' }} />
        <span style={{ flex: 1, background: '#006A44' }} />
        <span style={{ flex: 1, background: '#C1272D' }} />
      </span>
    )
  }
  if (kind === 'radar') {
    // Žalia juosta — radaro akcentas (NE LT vėliava, NE mėlyna)
    return <span className="sh-stripe sh-stripe-world" style={{ background: 'var(--accent-green)' }} aria-hidden />
  }
  return <span className="sh-stripe sh-stripe-world" aria-hidden />
}


function MuzikaPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  // Šoninė rinkmena (rail): Atlikėjai default; užvedus (hover/focus) keičiasi
  // dešinė vitrina. Kai pelė palieka panelį — reset į Atlikėjai, kad kiekvienas
  // atidarymas iškart parodytų ir LT, ir užsienio atlikėjus (Edvardo prašymas).
  const [sec, setSec] = useState<'atlikejai' | 'albumai' | 'dainos' | 'stiliai' | 'radaras'>('atlikejai')

  const artistsLt    = data?.artistsLt    || []
  const artistsWorld = data?.artistsWorld || []
  const radar        = data?.radar        || []

  // Stiliai — rikiuojami pagal atlikėjų kiekį (populiariausi pirma); „Kitų
  // stilių muzika" visada paskutinė. Cache fallback → STYLE_NAV_ORDER.
  const gc = data?.genreCounts || {}
  const styles = [...STYLES_ORDERED].sort((a, b) => {
    const ka = a.name === 'Kitų stilių muzika' ? 1 : 0
    const kb = b.name === 'Kitų stilių muzika' ? 1 : 0
    if (ka !== kb) return ka - kb
    return (gc[b.name] || 0) - (gc[a.name] || 0)
  })

  const albumsLt    = data?.albumsLt    || data?.albums || []
  const albumsWorld = data?.albumsWorld || []
  const songsLt     = data?.songsLt     || []
  const songsWorld  = data?.songsWorld  || []
  const genres      = data?.genres || {}

  // Radaro rail indikatorius — žalias pulsuojantis taškas (vietoj ikonos).
  const radarDot = <span className="sh-pulse-dot" aria-hidden />
  // Rail tvarka: pažįstami (atlikėjai→albumai→dainos→stiliai), radaras apačioje.
  // href → kiekviena skiltis navigaciška (paspaudus atveria pilną puslapį).
  const RAIL: { k: typeof sec; icon: React.ReactNode; label: string; href: string }[] = [
    { k: 'atlikejai', icon: I.mic,       label: 'Atlikėjai ir grupės', href: '/atlikejai' },
    { k: 'albumai',   icon: I.vinyl,     label: 'Albumai',             href: '/albumai' },
    { k: 'dainos',    icon: I.song,      label: 'Dainos',              href: '/dainos' },
    { k: 'stiliai',   icon: I.equalizer, label: 'Stiliai',             href: '/zanrai' },
    { k: 'radaras',   icon: radarDot,    label: 'Radaras',             href: '/nauji-atlikejai' },
  ]

  // Juostos antraštė — „liepsna" ikona (= trending, be žodžio) + pavadinimas + Daugiau.
  const head = (label: string, href: string, hot = false) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
        {hot ? <span className="sh-hot-ic" aria-hidden>{I.flame}</span> : null}
        {label}
      </span>
      <Link href={href} className="sh-more-link">Daugiau →</Link>
    </div>
  )

  // Atlikėjų juosta (LT arba užsienio) — flag stripe + „Daugiau" su country filtru.
  const artistRow = (list: typeof artistsLt, kind: 'lt' | 'world', label: string, href: string) => (
    <div>
      {head(label, href, true)}
      <div className="sh-strip-wrap">
        <RowStripe kind={kind} />
        <div className="sh-strip">
          {(list.length > 0 ? list : Array(6).fill(null)).map((a, i) => (
            <Link key={a?.id || `${kind}-${i}`} href={a ? `/atlikejai/${a.slug}` : '/atlikejai'} className="sh-mini sh-mini-xl">
              <ImageBox src={a?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{a?.name || <span style={{ opacity: 0.45 }}>Atlikėjas</span>}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  // Albumų juosta — su atlikėjo meta (kompaktiškas tarpas, sh-mini--meta).
  const albumRow = (list: typeof albumsLt, kind: 'lt' | 'world', label: string, href: string) => (
    <div>
      {head(label, href, true)}
      <div className="sh-strip-wrap">
        <RowStripe kind={kind} />
        <div className="sh-strip">
          {(list.length > 0 ? list : Array(6).fill(null)).map((a, i) => (
            <Link key={a?.id || `${kind}-${i}`} href={a ? `/albumai/${a.artistSlug ? `${a.artistSlug}-` : ''}${a.slug}-${a.id}` : '/albumai'} className="sh-mini sh-mini-xl sh-mini--meta">
              <ImageBox src={a?.image} accent={accent} glyph={I.vinyl} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-1">{a?.title || <span style={{ opacity: 0.45 }}>Albumas</span>}</span>
              {a?.artist ? <span className="sh-mini-meta">{a.artist}</span> : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  // Dainų juosta — agreguoti trending lyderiai iš visų chartų (su atlikėjo meta).
  const songRow = (list: typeof songsLt, kind: 'lt' | 'world', label: string, href: string) => (
    <div>
      {head(label, href, true)}
      <div className="sh-strip-wrap">
        <RowStripe kind={kind} />
        <div className="sh-strip">
          {(list.length > 0 ? list : Array(6).fill(null)).map((t, i) => (
            <Link key={t?.id || `${kind}-${i}`} href={t ? `/dainos/${t.artistSlug ? `${t.artistSlug}-` : ''}${t.slug ? `${t.slug}-` : ''}${t.id}` : href} className="sh-mini sh-mini-xl sh-mini--meta">
              <ImageBox src={t?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-1">{t?.title || <span style={{ opacity: 0.45 }}>Daina</span>}</span>
              {t?.artist ? <span className="sh-mini-meta">{t.artist}</span> : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="sh-panel sh-panel-muzika sh-panel-railed" onMouseLeave={() => setSec('atlikejai')}>
      {/* ── Šoninė rinkmena — skiltys, default Atlikėjai ── */}
      <div className="sh-rail" aria-label="Muzikos skiltys">
        {RAIL.map(r => (
          <Link
            key={r.k}
            href={r.href}
            aria-current={sec === r.k ? 'true' : undefined}
            className={`sh-railitem${sec === r.k ? ' active' : ''}`}
            onMouseEnter={() => setSec(r.k)}
            onFocus={() => setSec(r.k)}
          >
            <span className="sh-railitem-ic" style={sec === r.k ? { color: accent } : undefined}>{r.icon}</span>
            <span className="sh-railitem-label">{r.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Vitrina — keičiasi pagal aktyvią rail skiltį ── */}
      <div className="sh-railbody">
        {sec === 'atlikejai' && (
          <>
            {artistRow(artistsLt, 'lt', 'Lietuvos atlikėjai', '/atlikejai?country=lt')}
            <div style={{ height: 14 }} />
            {artistRow(artistsWorld, 'world', 'Užsienio atlikėjai', '/atlikejai?country=world')}
          </>
        )}

        {sec === 'albumai' && (
          <>
            {albumRow(albumsLt, 'lt', 'Lietuvos albumai', '/albumai')}
            <div style={{ height: 14 }} />
            {albumRow(albumsWorld, 'world', 'Užsienio albumai', '/albumai')}
          </>
        )}

        {sec === 'dainos' && (
          <>
            {songRow(songsLt, 'lt', 'Trending Lietuvoje', '/topai')}
            <div style={{ height: 14 }} />
            {songRow(songsWorld, 'world', 'Trending pasaulyje', '/topai')}
          </>
        )}

        {sec === 'stiliai' && (
          <div>
            {head('Naršyk pagal stilių', '/zanrai')}
            <div className="sh-vgrid sh-vgrid-4">
              {styles.slice(0, 8).map(s => (
                <Link key={s.name} href={s.href} className="sh-vcard" title={s.name}>
                  <ImageBox src={genres[s.name]} accent={accent} glyph={I.equalizer} className="sh-vimg" />
                  <span className="sh-vtitle">{s.name === 'Rimtoji muzika' ? 'Rimtoji' : s.short}</span>
                  {gc[s.name] ? <span className="sh-vmeta">{gc[s.name]} atlikėjų</span> : null}
                </Link>
              ))}
            </div>
          </div>
        )}

        {sec === 'radaras' && (
          <div>
            {head('Naujos muzikos radaras', '/nauji-atlikejai')}
            <div className="sh-vgrid sh-vgrid-5">
              {(radar.length > 0 ? radar : Array(10).fill(null)).slice(0, 10).map((a, i) => (
                <Link key={a?.id || `rad-${i}`} href={a ? `/atlikejai/${a.slug}` : '/nauji-atlikejai'} className="sh-vcard" title={a?.name || ''}>
                  <ImageBox src={a?.image} accent="#22c55e" glyph={I.music} className="sh-vimg" />
                  <span className="sh-vtitle">{a?.name || <span style={{ opacity: 0.45 }}>Atlikėjas</span>}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* Mini slugify dainos URL kompozavimui */
function quickSlug(s: string): string {
  if (!s) return 'daina'
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100)
}

const SEC_HEAD: React.CSSProperties = {
  fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)',
}

function TopMiniRow({ entry, fallbackHref, hex }: { entry: TopMini; fallbackHref: string; hex: string }) {
  return (
    <Link
      href={entry.trackSlug ? `/dainos/${entry.trackSlug}` : fallbackHref}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 6px', borderRadius: 9, textDecoration: 'none' }}
      className="sh-tr"
    >
      <span style={{ width: 18, textAlign: 'center', fontWeight: 900, fontSize: 14, color: entry.position === 1 ? hex : 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{entry.position}</span>
      <span style={{ width: 34, height: 34, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {entry.image ? <img src={proxyImg(entry.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14, opacity: 0.45 }}>♪</span>}
      </span>
      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.title}</span>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.artist}</span>
      </span>
    </Link>
  )
}

function TopaiPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  // Rail skiltys (Edvardo prašymu): Music.lt · Lietuvoje · Pasaulyje · Narių
  // topai · Apdovanojimai. Default Music.lt; onMouseLeave reset.
  const [sec, setSec] = useState<'musiclt' | 'lietuva' | 'pasaulis' | 'nariu' | 'apdovanojimai'>('musiclt')

  const top30      = data?.topChart?.top30 || []
  const top40      = data?.topChart?.top40 || []
  const votings    = data?.votings || []
  const memberTops = data?.memberTops || []
  const ltSongs     = data?.chartLtSongs     || []
  const ltAlbums    = data?.chartLtAlbums    || []
  const worldSongs  = data?.chartWorldSongs  || []
  const worldAlbums = data?.chartWorldAlbums || []
  const ltCharts    = data?.chartsLt    || []
  const worldCharts = data?.chartsWorld || []

  const anchor = (s: string) => s === 'world' ? '/topai#pasaulio-topai' : s === 'social' ? '/topai#trendai' : '/topai#lt-topai'
  const scopeGlyph = (s: string) => (s === 'social' ? I.trending : I.trophy)

  // ── Rail ikonos ──
  // Music.lt — muzikinis ekvalaizeris (5 stulpeliai, brandbook stilius, oranžinis).
  const eqBars = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="4" y1="15" x2="4" y2="20"/><line x1="8" y1="11" x2="8" y2="20"/><line x1="12" y1="7" x2="12" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/><line x1="20" y1="13" x2="20" y2="20"/></svg>
  )
  // LT vėliava — HORIZONTALŪS dryžiai (geltona/žalia/raudona iš viršaus žemyn).
  const ltFlagIcon = (
    <span style={{ width: 16, height: 11, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} aria-hidden>
      <span style={{ flex: 1, background: '#FDBA12' }} />
      <span style={{ flex: 1, background: '#006A44' }} />
      <span style={{ flex: 1, background: '#C1272D' }} />
    </span>
  )
  const globeIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9s1.3-6.5 3.8-9Z"/></svg>
  )
  // Apdovanojimai — žvaigždė (NE medalis).
  const starIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19.2l1-5.8L3.5 9.3l5.9-.9L12 3Z"/></svg>
  )
  const RAIL: { k: typeof sec; icon: React.ReactNode; label: string; href: string; iconColor?: string }[] = [
    { k: 'musiclt',       icon: eqBars,     label: 'Music.lt',      href: '/topai',          iconColor: 'var(--accent-orange)' },
    { k: 'lietuva',       icon: ltFlagIcon, label: 'Lietuvoje',     href: '/topai/lietuva' },
    { k: 'pasaulis',      icon: globeIcon,  label: 'Pasaulyje',     href: '/topai/pasaulis' },
    { k: 'nariu',         icon: I.users,    label: 'Narių topai',   href: '/topai/nariu' },
    { k: 'apdovanojimai', icon: starIcon,   label: 'Apdovanojimai', href: '/balsavimai' },
  ]

  // Dainų juosta su rank numeriais (chart stilius). items: normalizuotos eilutės.
  type SongItem = { key?: string | number; href: string; title: string; artist: string; image: string | null }
  const topItems = (arr: TopMini[]): SongItem[] => arr.map((e, i) => ({
    key: e?.trackSlug || i, href: e?.trackSlug ? `/dainos/${e.trackSlug}` : '/topai',
    title: e?.title || '', artist: e?.artist || '', image: e?.image || null,
  }))
  // Juosta su rank numeriais — tinka dainoms IR albumams (glyph + emptyLabel parametrai).
  const itemStrip = (items: SongItem[], kind: 'lt' | 'world', label: string, more: string, glyph: React.ReactNode, emptyLabel: string) => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{label}</span>
        <Link href={more} className="sh-more-link">Daugiau →</Link>
      </div>
      <div className="sh-strip-wrap">
        <RowStripe kind={kind} />
        <div className="sh-strip">
          {(items.length > 0 ? items : Array(6).fill(null)).map((it: SongItem | null, i: number) => (
            <Link key={it?.key || `${kind}-${i}`} href={it?.href || more} className="sh-mini sh-mini-xl sh-mini--meta">
              <ImageBox src={it?.image} accent={accent} glyph={glyph} className="sh-mini-img">
                <span className="sh-rank">{i + 1}</span>
              </ImageBox>
              <span className="sh-mini-title sh-mini-title-1">{it?.title || <span style={{ opacity: 0.45 }}>{emptyLabel}</span>}</span>
              {it?.artist ? <span className="sh-mini-meta">{it.artist}</span> : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  // Chartų chip'ai (vėliavėlė / ikona) — kaip anksčiau „Kiti topai".
  const chartFlag = (cc: string | null): string | null => {
    let c = (cc || '').toLowerCase()
    c = (c === 'uk' || c === 'en') ? 'gb' : c
    return /^[a-z]{2}$/.test(c) ? `https://flagcdn.com/w40/${c}.png` : null
  }
  const featChip = (c: NonNullable<NavPreview['featuredCharts']>[number], hideFlag = false) => {
    const flag = hideFlag ? null : chartFlag(c.country)
    return (
      <Link key={c.id} href={c.source === 'consensus' ? `/topai/${c.source}-${c.chartKey}` : anchor(c.scope)}
        className="sh-navchip" title={c.title} style={{ maxWidth: 172, flexShrink: 0 }}>
        {hideFlag
          ? null
          : flag
            ? <img src={flag} alt="" className="sh-navchip-flag" />
            : <span className="sh-navchip-ic" style={{ color: 'var(--text-secondary)' }} aria-hidden>{/album/i.test(c.title) ? I.vinyl : scopeGlyph(c.scope)}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.title}</span>
      </Link>
    )
  }
  // Regiono vitrina — chart dainos + albumai juostos + „Kiti topai" chip'ai.
  const regionView = (songs: SongItem[], albums: SongItem[], kind: 'lt' | 'world', charts: typeof ltCharts, more: string) => (
    <>
      {itemStrip(songs, kind, 'Dainos', more, I.music, 'Daina')}
      <div style={{ height: 14 }} />
      {itemStrip(albums, kind, 'Albumai', more, I.vinyl, 'Albumas')}
      {charts.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={SEC_HEAD}>Kiti topai</span>
            <Link href={more} className="sh-more-link">Daugiau →</Link>
          </div>
          {/* Viena eilė (nowrap, clip) — visi per „Daugiau". LT be vėliavėlių. */}
          <div className="sh-chiprow" style={{ flexWrap: 'nowrap', overflow: 'hidden', maskImage: 'linear-gradient(to right, #000 86%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 86%, transparent)' }}>
            {charts.slice(0, 8).map(c => featChip(c, kind === 'lt'))}
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="sh-panel sh-panel-muzika sh-panel-railed" onMouseLeave={() => setSec('musiclt')}>
      {/* ── Šoninė rinkmena ── */}
      <div className="sh-rail" aria-label="Topų skiltys">
        {RAIL.map(r => (
          <Link
            key={r.k}
            href={r.href}
            aria-current={sec === r.k ? 'true' : undefined}
            className={`sh-railitem${sec === r.k ? ' active' : ''}`}
            onMouseEnter={() => setSec(r.k)}
            onFocus={() => setSec(r.k)}
          >
            <span className="sh-railitem-ic" style={r.iconColor ? { color: r.iconColor } : (sec === r.k ? { color: accent } : undefined)}>{r.icon}</span>
            <span className="sh-railitem-label">{r.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Vitrina ── */}
      <div className="sh-railbody">
        {sec === 'musiclt' && (
          <>
            {itemStrip(topItems(top40), 'world', 'TOP 40', '/top40', I.music, 'Daina')}
            {top30.filter(e => e?.image).length >= 3 && (
              <>
                <div style={{ height: 14 }} />
                {itemStrip(topItems(top30), 'lt', 'LT TOP 30', '/top30', I.music, 'Daina')}
              </>
            )}
          </>
        )}

        {sec === 'lietuva'  && regionView(ltSongs,    ltAlbums,    'lt',    ltCharts,    '/topai/lietuva')}
        {sec === 'pasaulis' && regionView(worldSongs, worldAlbums, 'world', worldCharts, '/topai/pasaulis')}

        {sec === 'nariu' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Narių sudaryti topai</span>
              <Link href="/topai/nariu" className="sh-more-link">Daugiau →</Link>
            </div>
            <div className="sh-strip-wrap">
              <div className="sh-strip">
                {(memberTops.length > 0 ? memberTops : Array(6).fill(null)).map((m, i) => (
                  <Link key={m?.id || `mt-${i}`} href={m?.href || '/topai/nariu'} className="sh-mini sh-mini-xl sh-mini--meta" title={m?.title || ''}>
                    <ImageBox src={m?.image} accent={accent} glyph={I.trophy} className="sh-mini-img" />
                    <span className="sh-mini-title" style={{ display: 'block', WebkitLineClamp: 'unset', overflow: 'visible', whiteSpace: 'normal' }}>{m?.title || <span style={{ opacity: 0.45 }}>Nario topas</span>}</span>
                    {m?.author ? <span className="sh-mini-meta">@{m.author}</span> : null}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {sec === 'apdovanojimai' && (
          <div>
            <div style={{ ...SEC_HEAD, marginBottom: 10 }}>Apdovanojimai ir rinkimai</div>
            {votings.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {votings.map(v => (
                  <Link key={v.id} href={`/balsavimai/${v.slug}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px 7px 8px', borderRadius: 10, border: '1px solid var(--border-default)', textDecoration: 'none', background: 'var(--bg-elevated)' }}
                    className="sh-vote-chip">
                    <span style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      {v.image ? <img src={proxyImg(v.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : I.award}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{v.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Link href="/balsavimai" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-default)', textDecoration: 'none' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{I.award}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Balsavimai ir apdovanojimai</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RenginiaiPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  // Rail (Edvardo prašymu): Lietuvoje · Užsienyje · Festivaliai · Koncertų įrašai · Foto reportažai.
  const [sec, setSec] = useState<'lietuva' | 'uzsienyje' | 'festivaliai' | 'irasai' | 'foto'>('lietuva')

  const eventsHome   = data?.eventsHome   || []
  const eventsAbroad = data?.eventsAbroad || []
  const festivals    = data?.festivals    || []
  const recordings   = data?.recordings   || []
  const reportages   = data?.reportages   || []

  const ltFlagIcon = (
    <span style={{ width: 16, height: 11, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} aria-hidden>
      <span style={{ flex: 1, background: '#FDBA12' }} />
      <span style={{ flex: 1, background: '#006A44' }} />
      <span style={{ flex: 1, background: '#C1272D' }} />
    </span>
  )
  const RAIL: { k: typeof sec; icon: React.ReactNode; label: string; href: string }[] = [
    { k: 'lietuva',     icon: ltFlagIcon, label: 'Lietuvoje',       href: '/koncertai' },
    { k: 'uzsienyje',   icon: I.plane,    label: 'Užsienyje',       href: '/verta-keliones' },
    { k: 'festivaliai', icon: I.festival, label: 'Festivaliai',     href: '/festivaliai' },
    { k: 'irasai',      icon: I.video,    label: 'Koncertų įrašai', href: '/koncertu-irasai' },
    { k: 'foto',        icon: I.gallery,  label: 'Nuotraukos',      href: '/galerija' },
  ]

  const head = (label: string, href: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{label}</span>
      <Link href={href} className="sh-more-link">Daugiau →</Link>
    </div>
  )

  type EvItem = { href: string; title: string; image: string | null; meta: string; collage?: string[]; flag?: string }
  // Festivalio žyma ant viršelio — LT vėliava (namų) arba lėktuvas (kelionė).
  const evFlag = (flag?: string) => {
    if (!flag) return null
    return (
      <span className="sh-evflag" aria-hidden>
        {flag === 'lt'
          ? <span style={{ width: 14, height: 10, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><span style={{ flex: 1, background: '#FDBA12' }} /><span style={{ flex: 1, background: '#006A44' }} /><span style={{ flex: 1, background: '#C1272D' }} /></span>
          : I.plane}
      </span>
    )
  }
  const itemGrid = (items: EvItem[], more: string, glyph: React.ReactNode, emptyLabel: string, contain = false) => (
    <div className="sh-vgrid sh-vgrid-5">
      {(items.length > 0 ? items : Array(10).fill(null)).slice(0, 10).map((it: EvItem | null, i: number) => (
        <Link key={it?.href || `e-${i}`} href={it?.href || more} className="sh-vcard" title={it?.title || ''}>
          <span style={{ position: 'relative', display: 'block' }}>
            {it?.collage && it.collage.length >= 2
              ? <span className="sh-vimg sh-collage" aria-hidden>{it.collage.slice(0, 4).map((c, j) => (<span key={j} style={{ backgroundImage: `url(${proxyImg(c)})` }} />))}</span>
              : <ImageBox src={it?.image} accent={accent} glyph={glyph} className={`sh-vimg${contain ? ' sh-vimg--contain' : ''}`} />}
            {evFlag(it?.flag)}
          </span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it?.title || <span style={{ opacity: 0.45 }}>{emptyLabel}</span>}</span>
          {it?.meta ? <span className="sh-vmeta">{it.meta}</span> : null}
        </Link>
      ))}
    </div>
  )

  return (
    <div className="sh-panel sh-panel-muzika sh-panel-railed" onMouseLeave={() => setSec('lietuva')}>
      <div className="sh-rail" aria-label="Koncertų skiltys">
        {RAIL.map(r => (
          <Link
            key={r.k}
            href={r.href}
            aria-current={sec === r.k ? 'true' : undefined}
            className={`sh-railitem${sec === r.k ? ' active' : ''}`}
            onMouseEnter={() => setSec(r.k)}
            onFocus={() => setSec(r.k)}
          >
            <span className="sh-railitem-ic" style={sec === r.k ? { color: accent } : undefined}>{r.icon}</span>
            <span className="sh-railitem-label">{r.label}</span>
          </Link>
        ))}
      </div>

      <div className="sh-railbody">
        {sec === 'lietuva'     && (<div>{head('Artimiausi koncertai Lietuvoje', '/koncertai')}{itemGrid(eventsHome, '/koncertai', I.calendar, 'Koncertas', true)}</div>)}
        {sec === 'uzsienyje'   && (<div>{head('Artimiausi koncertai užsienyje', '/verta-keliones')}{itemGrid(eventsAbroad, '/verta-keliones', I.plane, 'Koncertas', true)}</div>)}
        {sec === 'festivaliai' && (<div>{head('Festivaliai', '/festivaliai')}{itemGrid(festivals, '/festivaliai', I.festival, 'Festivalis', true)}</div>)}
        {sec === 'irasai'      && (<div>{head('Koncertų įrašai', '/koncertu-irasai')}{itemGrid(recordings, '/koncertu-irasai', I.video, 'Įrašas')}</div>)}
        {sec === 'foto'        && (<div>{head('Nuotraukos', '/galerija')}{itemGrid(reportages, '/galerija', I.gallery, 'Nuotrauka')}</div>)}
      </div>
    </div>
  )
}

// „Atradimai" dropdown — žmonių-first bendruomenės hub'as. Viršuje hero į gyvą
// srautą (/atradimai), po juo 6 nuorodos: Pažink narius, Dienos daina, Diskusijos,
// Narių įrašai, Pokalbių dėžutė, Boombox. Atitinka perdarytą /atradimai puslapį
// (2026-06-03; žaidimai nebe atskira sekcija — viena Boombox kortelė).
// Narių įrašo tipo žyma (badge) — kad iškart matytųsi kas tai per įrašas.
const POST_TYPE_LABEL: Record<string, string> = {
  review: 'Recenzija',
  topas: 'Topas',
  creation: 'Kūryba',
  translation: 'Vertimas',
  article: 'Straipsnis',
  interview: 'Interviu',
  event: 'Renginys',
  release: 'Leidinys',
}
// Tipas rodomas po pavadinimu (meta eilutėje), kad NEUŽDENGTŲ vizualo.
const postTypeMeta = (postType?: string, author?: string): React.ReactNode => {
  const label = postType ? POST_TYPE_LABEL[postType] : null
  if (!label && !author) return null
  return (
    <>
      {label ? <span style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{label}</span> : null}
      {label && author ? ' · ' : ''}
      {author || ''}
    </>
  )
}

// Grido / sąrašo ikona expand mygtukui.
const gridIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
  </svg>
)
function BendruomenePanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  // Rail (Edvardo prašymu): Narių įrašai (default) · Diskusijos · Atradimai · Dienos dainos · Nariai.
  const [sec, setSec] = useState<'irasai' | 'diskusijos' | 'atradimai' | 'daina' | 'nariai'>('irasai')

  const reviewPosts = data?.reviewPosts || []
  const discussions = data?.discussions || []
  const discoveries = data?.discoveries || []
  const dailySongs = data?.dailySongs || []
  const members = data?.members || []

  const compassIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/></svg>
  )
  const RAIL: { k: typeof sec; icon: React.ReactNode; label: string; href: string }[] = [
    { k: 'irasai',     icon: I.blog,      label: 'Narių įrašai',  href: '/blogas' },
    { k: 'diskusijos', icon: I.forum,     label: 'Diskusijos',    href: '/diskusijos' },
    { k: 'atradimai',  icon: compassIcon, label: 'Atradimai',     href: '/muzikos-atradimai' },
    { k: 'daina',      icon: I.music,     label: 'Dienos dainos', href: '/dienos-daina' },
    { k: 'nariai',     icon: I.users,     label: 'Nariai',        href: '/vartotojai' },
  ]

  const head = (label: string, href: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{label}</span>
      <Link href={href} className="sh-more-link">Daugiau →</Link>
    </div>
  )

  type Item = { href: string; title: string; image: string | null; meta: string; tag?: string | null }
  const itemGrid = (items: Item[], more: string, glyph: React.ReactNode, emptyLabel: string) => (
    <div className="sh-vgrid sh-vgrid-5">
      {(items.length > 0 ? items : Array(10).fill(null)).slice(0, 10).map((it: Item | null, i: number) => (
        <Link key={it?.href || `c-${i}`} href={it?.href || more} className="sh-vcard" title={it?.title || ''}>
          <ImageBox src={it?.image} accent={accent} glyph={glyph} className="sh-vimg" />
          {it?.tag ? <span className="sh-tag">{it.tag}</span> : null}
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it?.title || <span style={{ opacity: 0.45 }}>{emptyLabel}</span>}</span>
          {it?.meta ? <span className="sh-vmeta">{it.meta}</span> : null}
        </Link>
      ))}
    </div>
  )
  const songItems: Item[] = dailySongs.map((s: any) => ({
    href: s.slug ? `/dainos/${s.slug}` : '/dienos-daina',
    title: s.title || '', image: s.image || null, meta: s.artist || '',
  }))

  return (
    <div className="sh-panel sh-panel-muzika sh-panel-railed" onMouseLeave={() => setSec('irasai')}>
      <div className="sh-rail" aria-label="Bendruomenės skiltys">
        {RAIL.map(r => (
          <Link
            key={r.k}
            href={r.href}
            aria-current={sec === r.k ? 'true' : undefined}
            className={`sh-railitem${sec === r.k ? ' active' : ''}`}
            onMouseEnter={() => setSec(r.k)}
            onFocus={() => setSec(r.k)}
          >
            <span className="sh-railitem-ic" style={sec === r.k ? { color: accent } : undefined}>{r.icon}</span>
            <span className="sh-railitem-label">{r.label}</span>
          </Link>
        ))}
      </div>

      <div className="sh-railbody">
        {sec === 'irasai'     && (<div>{head('Recenzijos ir koncertų įspūdžiai', '/blogas')}{itemGrid(reviewPosts, '/blogas', I.blog, 'Įrašas')}</div>)}
        {sec === 'diskusijos' && (<div>{head('Naujausios diskusijos', '/diskusijos')}{itemGrid(discussions, '/diskusijos', I.forum, 'Tema')}</div>)}
        {sec === 'atradimai'  && (<div>{head('Muzikos atradimai', '/muzikos-atradimai')}{itemGrid(discoveries, '/muzikos-atradimai', I.music, 'Atradimas')}</div>)}
        {sec === 'daina'      && (<div>{head('Dienos dainos', '/dienos-daina')}{itemGrid(songItems, '/dienos-daina', I.music, 'Daina')}</div>)}
        {sec === 'nariai' && (
          <div>
            {head('Pažink narius', '/vartotojai')}
            <div className="sh-vgrid sh-vgrid-5">
              {(members.length > 0 ? members : Array(10).fill(null)).slice(0, 10).map((m: any, i: number) => (
                <Link key={m?.href || `m-${i}`} href={m?.href || '/vartotojai'} className="sh-vcard sh-vcard--center" title={m?.name || ''}>
                  <ImageBox src={m?.avatar} accent={accent} glyph={I.users} className="sh-vimg sh-vimg--round sh-vimg--avatar" />
                  <span className="sh-vtitle" style={{ textAlign: 'center', width: '100%' }}>{m?.name || <span style={{ opacity: 0.45 }}>Narys</span>}</span>
                  {m?.taste ? <span className="sh-vmeta" style={{ textAlign: 'center', width: '100%' }}>mėgsta {m.taste}</span> : null}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Naujienų dropdown — redizainas (2026-06-03). 3 kolonos: featured naujienos,
// naršymas pagal temą (LT/Pasaulis + kategorijos), naršymas pagal stilių.
// Visi link'ai → dedikuoti SEO landing'ai (/naujienos/stilius|kategorija|lietuva).
// Naujienų dropdown — mirror'inam Muzika panel'ą: naujausių naujienų juosta
// (kaip atlikėjų strip'as) + stiliaus kortelės su žanro vizualais. Plius tipų
// greitos nuorodos. Vientisa su /muzika ir /naujienos puslapiu.
const SECTION_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Outfit', sans-serif",
  fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'var(--text-muted)', marginBottom: 8,
}
// Stilių trumpi NOMINATYVAI (vienas aiškus žodis) — Naujienų „Pagal stilių" gridui.
const STYLE_NOM: Record<string, string> = {
  'Roko muzika': 'Rokas',
  'Pop, R&B muzika': 'Pop',
  "Hip-hop'o muzika": "Hip-hop'as",
  'Elektroninė, šokių muzika': 'Elektronika',
  'Alternatyvioji muzika': 'Alternatyva',
  'Sunkioji muzika': 'Metalas',
  'Rimtoji muzika': 'Klasika',
  'Kitų stilių muzika': 'Kita',
}
function NaujienosPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  // Rail (Edvardo prašymu): Lietuvoje · Pasaulyje · Pagal stilių (tipai = too much).
  const [sec, setSec] = useState<'lietuva' | 'pasaulis' | 'stiliai'>('lietuva')

  const newsLt    = data?.newsLt || data?.news || []
  const newsWorld = data?.newsWorld || []
  const genres    = data?.genres || {}

  const ltFlagIcon = (
    <span style={{ width: 16, height: 11, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} aria-hidden>
      <span style={{ flex: 1, background: '#FDBA12' }} />
      <span style={{ flex: 1, background: '#006A44' }} />
      <span style={{ flex: 1, background: '#C1272D' }} />
    </span>
  )
  const globeIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9s1.3-6.5 3.8-9Z"/></svg>
  )
  const RAIL: { k: typeof sec; icon: React.ReactNode; label: string; href: string }[] = [
    { k: 'lietuva',  icon: ltFlagIcon,  label: 'Lietuvoje',    href: '/naujienos/lietuva' },
    { k: 'pasaulis', icon: globeIcon,   label: 'Pasaulyje',    href: '/naujienos/pasaulis' },
    { k: 'stiliai',  icon: I.equalizer, label: 'Pagal stilių', href: '/naujienos' },
  ]

  const head = (label: string, href: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{label}</span>
      <Link href={href} className="sh-more-link">Daugiau →</Link>
    </div>
  )

  // Tipo žyma — jei naujiena NE paprasta (interviu / recenzija / klipas...).
  const newsTag = (cat: string | null | undefined): string | null => {
    if (!cat || cat === 'naujiena') return null
    const t = NEWS_TYPES.find(x => x.key === cat)
    return t ? t.label : null
  }
  // Naujienų gridas — PILNAS pavadinimas (3 eil.), BE datos, su tipo žyma.
  const newsGrid = (items: any[], href: string) => (
    <div className="sh-vgrid sh-vgrid-5">
      {(items.length > 0 ? items : Array(10).fill(null)).slice(0, 10).map((n: any, i: number) => {
        const tag = n ? newsTag(n.category) : null
        return (
          <Link key={n?.id || `n-${i}`} href={n ? `/news/${n.slug}` : href} className="sh-vcard" title={n?.title || ''}>
            <ImageBox src={n?.image} accent={accent} glyph={I.news} className="sh-vimg" />
            {tag ? <span className="sh-tag">{tag}</span> : null}
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n?.title || <span style={{ opacity: 0.45 }}>Naujiena</span>}</span>
          </Link>
        )
      })}
    </div>
  )

  return (
    <div className="sh-panel sh-panel-muzika sh-panel-railed" onMouseLeave={() => setSec('lietuva')}>
      <div className="sh-rail" aria-label="Naujienų skiltys">
        {RAIL.map(r => (
          <Link
            key={r.k}
            href={r.href}
            aria-current={sec === r.k ? 'true' : undefined}
            className={`sh-railitem${sec === r.k ? ' active' : ''}`}
            onMouseEnter={() => setSec(r.k)}
            onFocus={() => setSec(r.k)}
          >
            <span className="sh-railitem-ic" style={sec === r.k ? { color: accent } : undefined}>{r.icon}</span>
            <span className="sh-railitem-label">{r.label}</span>
          </Link>
        ))}
      </div>

      <div className="sh-railbody">
        {sec === 'lietuva' && (
          <div>
            {head('Lietuvos muzikos naujienos', '/naujienos/lietuva')}
            {newsGrid(newsLt, '/naujienos/lietuva')}
          </div>
        )}
        {sec === 'pasaulis' && (
          <div>
            {head('Pasaulio naujienos', '/naujienos/pasaulis')}
            {newsGrid(newsWorld, '/naujienos/pasaulis')}
          </div>
        )}
        {sec === 'stiliai' && (
          <div>
            {head('Naršyk pagal stilių', '/naujienos')}
            <div className="sh-vgrid sh-vgrid-4">
              {NEWS_STYLES.map(s => (
                <Link key={s.id} href={`/naujienos/stilius/${s.slug}`} className="sh-vcard" title={s.name}>
                  <ImageBox src={genres[s.name]} accent={accent} glyph={I.news} className="sh-vimg" />
                  <span className="sh-vtitle">{STYLE_NOM[s.name] || s.name.replace(' muzika', '')}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SkelbimaiPanel({ data, accent }: { data: NavPreview | null; accent: string }) {
  const listings = data?.listings || []
  return (
    <div className="sh-panel">
      {/* ── Naujausi skelbimai — realūs itemai (juosta kaip Muzika/Topai) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          <span className="sh-trending-glyph">{I.market}</span>
          Naujausi skelbimai
        </span>
        <Link href="/skelbimai" className="sh-more-link">Daugiau →</Link>
      </div>

      {listings.length > 0 ? (
        <div className="sh-strip-wrap">
          <div className="sh-strip">
            {listings.map(l => (
              <Link key={l.id} href={`/skelbimai/skelbimas/${l.id}`} className="sh-mini sh-mini-xl">
                <ImageBox src={l.image} accent="#10b981" glyph={I.market} className="sh-mini-img" />
                <span className="sh-mini-title sh-mini-title-2">{l.title}</span>
                {l.price
                  ? <span className="sh-mini-meta" style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{l.price}</span>
                  : l.city ? <span className="sh-mini-meta">{l.city}</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Link href="/skelbimai/naujas" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12,
          border: '1px dashed var(--border-default)', background: 'var(--bg-surface)', textDecoration: 'none',
        }}>
          <span style={{ color: '#10b981', display: 'flex' }}>{I.market}</span>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Skelbimų dar nėra — <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>įdėk pirmas</span></span>
        </Link>
      )}

      {/* ── Kategorijos — realūs skelbimų tipai ── */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-default)' }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>Kategorijos</div>
        <div className="sh-chiprow sh-chiprow-fill">
          {LISTING_TYPE_ORDER.map(t => {
            const meta = LISTING_TYPES[t]
            return (
              <Link key={t} href={`/skelbimai/${meta.slug}`} className="sh-navchip" title={meta.subtitle}>
                {meta.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
 * Mobile expansion — kompaktinis dropdown'o turinio variantas
 * (po kiekviena top-level NAV kortele drawer'yje)
 * ──────────────────────────────────────────────────────────────── */

function MobileExpansion({
  navKey, data, accent, onLink,
}: {
  navKey: NavItem['key']
  data: NavPreview | null
  accent: string
  onLink: () => void
}) {
  if (navKey === 'muzika') {
    const ltArtists = data?.artistsLt || []
    const wrldArtists = data?.artistsWorld || []
    return (
      <div className="sh-mexp">
        {/* ── ATLIKĖJAI sekcijos header'is (vienodas su Stiliai) ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          fontFamily: "'Outfit', sans-serif",
          fontSize: 14, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--text-muted)',
          marginBottom: 8,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sh-trending-glyph" title="Trending">{I.trending}</span>
            Atlikėjai ir grupės
          </span>
          <Link href="/nauji-atlikejai" onClick={onLink} className="sh-more-link" style={{ color: 'var(--accent-green)' }}>
            📡 Radaras →
          </Link>
        </div>

        {/* ── ATLIKĖJAI: LT eilutė — Daugiau kaip last tile strip'e ── */}
        <div className="sh-strip-wrap" style={{ marginBottom: 10 }}>
          <RowStripe kind="lt" />
          <div className="sh-strip">
            {(ltArtists.length > 0 ? ltArtists.slice(0, 10) : Array(5).fill(null)).map((a, i) => (
              <Link key={a?.id || `lt-${i}`} href={a ? `/atlikejai/${a.slug}` : '/atlikejai'} onClick={onLink} className="sh-mini sh-mini-md">
                <ImageBox src={a?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
                <span className="sh-mini-title sh-mini-title-2">{a?.name || 'Atlikėjas'}</span>
              </Link>
            ))}
          </div>
          <Link href="/atlikejai?country=lt" onClick={onLink} className="sh-expand-btn" aria-label="Atverti visą sąrašą" title="Atverti visą sąrašą su filtrais">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
              <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
              <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
              <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
            </svg>
          </Link>
        </div>

        {/* ── ATLIKĖJAI: užsienio eilutė ── */}
        <div className="sh-strip-wrap" style={{ marginBottom: 12 }}>
          <RowStripe kind="world" />
          <div className="sh-strip">
            {(wrldArtists.length > 0 ? wrldArtists.slice(0, 10) : Array(5).fill(null)).map((a, i) => (
              <Link key={a?.id || `w-${i}`} href={a ? `/atlikejai/${a.slug}` : '/atlikejai'} onClick={onLink} className="sh-mini sh-mini-md">
                <ImageBox src={a?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
                <span className="sh-mini-title sh-mini-title-2">{a?.name || 'Atlikėjas'}</span>
              </Link>
            ))}
          </div>
          <Link href="/atlikejai?country=world" onClick={onLink} className="sh-expand-btn" aria-label="Atverti visą sąrašą" title="Atverti visą sąrašą su filtrais">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
              <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
              <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
              <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
            </svg>
          </Link>
        </div>

        {/* ── STILIAI — Daugiau kaip 9-as grid tile (po visų 8 žanrų) ── */}
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 14, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}>
            Stiliai
          </div>
          <div className="sh-chiprow">
            {[...STYLES_ORDERED].sort((a, b) => ((data?.genreCounts || {})[b.name] || 0) - ((data?.genreCounts || {})[a.name] || 0)).map(s => (
              <Link key={s.name} href={s.href} onClick={onLink} className="sh-navchip" title={s.name}>
                <span className="sh-navchip-dot" style={{ background: 'var(--text-faint)' }} aria-hidden />
                {s.short}
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (navKey === 'topai') {
    const mTop30 = data?.topChart?.top30 || []
    const mTop40 = data?.topChart?.top40 || []
    const mFeatured = data?.featuredCharts || []
    const mVotings = data?.votings || []
    // Flag bg — bet koks 2 raidžių ISO kodas (uk→gb alias), kaip /topai puslapy.
    const mFlagBg = (cc: string | null) => {
      let c = (cc || '').toLowerCase()
      c = (c === 'uk' || c === 'en') ? 'gb' : c
      return /^[a-z]{2}$/.test(c) ? `https://flagcdn.com/w320/${c}.png` : null
    }
    const mAnchor = (s: string) => s === 'world' ? '/topai#pasaulio-topai' : s === 'social' ? '/topai#trendai' : '/topai#lt-topai'
    // Chip'as su maža vėliavėle (Pagal šalis) arba ikona (Kiti topai) — kaip desktop.
    const mFeatChip = (c: NonNullable<NavPreview['featuredCharts']>[number]) => {
      const flag = mFlagBg(c.country)
      return (
        <Link key={c.id} href={c.source === 'consensus' ? `/topai/${c.source}-${c.chartKey}` : mAnchor(c.scope)} onClick={onLink}
          className="sh-navchip" title={c.title}>
          {flag
            ? <img src={flag} alt="" className="sh-navchip-flag" />
            : <span className="sh-navchip-ic" style={{ color: 'var(--text-secondary)' }} aria-hidden>{c.scope === 'social' ? I.trending : I.trophy}</span>}
          {c.title}
        </Link>
      )
    }
    const mCharts = [...mFeatured.filter(c => c.country), ...mFeatured.filter(c => !c.country)].slice(0, 8)
    // Horizontaliai scroll'inama dainų juosta (kaip desktop) — be Lietuva/Pasaulis badge'o.
    const mSongStrip = (title: string, href: string, hex: string, kind: 'lt' | 'world', entries: TopMini[]) => (
      <div style={{ ['--it-rgb' as any]: hexToRgb(hex) }}>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
        <div className="sh-strip-wrap">
          <RowStripe kind={kind} />
          <div className="sh-strip">
            {(entries.length > 0 ? entries : Array(6).fill(null)).map((e: TopMini | null, i: number) => (
              <Link key={e?.trackSlug || `${kind}-${i}`} href={e?.trackSlug ? `/dainos/${e.trackSlug}` : href} onClick={onLink}
                style={{ flex: '0 0 auto', width: 116, display: 'flex', flexDirection: 'column', gap: 3, textDecoration: 'none' }}>
                <span style={{ width: 116, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {e?.image
                    ? <img src={proxyImg(e.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{I.music}</span>}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e?.title || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: -2 }}>{e?.artist || ''}</span>
              </Link>
            ))}
          </div>
          <Link href={href} onClick={onLink} className="sh-expand-btn" aria-label="Atverti visą topą" title="Atverti visą topą">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" />
              <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
            </svg>
          </Link>
        </div>
      </div>
    )
    return (
      <div className="sh-mexp">
        {/* Pagrindiniai topai — LT TOP 30 + TOP 40, horizontaliai (kaip desktop) */}
        {mSongStrip('LT TOP 30', '/top30', '#22c55e', 'lt', mTop30)}
        <div style={{ height: 8 }} />
        {mSongStrip('TOP 40', '/top40', 'var(--accent-orange)', 'world', mTop40)}

        {/* Pagal šalis / kiti topai — vėliavėlių chip'ai */}
        {mCharts.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-default)' }}>
            <div style={{ ...SEC_HEAD, marginBottom: 6 }}>Kiti topai</div>
            <div className="sh-chiprow">{mCharts.map(mFeatChip)}</div>
          </div>
        )}

        {/* Apdovanojimai ir rinkimai */}
        {mVotings.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-default)' }}>
            <div style={{ ...SEC_HEAD, marginBottom: 6 }}>Apdovanojimai ir rinkimai</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {mVotings.map(v => (
                <Link key={v.id} href={`/balsavimai/${v.slug}`} onClick={onLink} className="sh-shortcut">{v.name} →</Link>
              ))}
            </div>
          </div>
        )}

        {/* Greitos nuorodos — kad nepasimestų svarbūs įėjimo taškai */}
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border-default)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Link href="/topai" onClick={onLink} className="sh-shortcut">Visi topai →</Link>
          <Link href="/dienos-daina" onClick={onLink} className="sh-shortcut">Dienos daina →</Link>
          <Link href="/balsavimai" onClick={onLink} className="sh-shortcut">Balsavimai →</Link>
        </div>
      </div>
    )
  }

  if (navKey === 'renginiai') {
    const eventsLt = data?.eventsLt || []
    const eventsWorld = data?.eventsWorld || []
    const renderStrip = (list: NonNullable<NavPreview['eventsLt']>, kind: 'lt' | 'world') => (
      <div className="sh-strip-wrap" style={{ marginBottom: 10 }}>
        <RowStripe kind={kind} />
        <div className="sh-strip">
          {(list.length > 0 ? list.slice(0, 10) : Array(5).fill(null)).map((e, i) => (
            <Link key={e?.id || `${kind}-${i}`} href={e ? `/renginiai/${e.slug}` : '/koncertai'} onClick={onLink} className="sh-mini sh-mini-md">
              <ImageBox src={e?.image} accent={accent} glyph={I.calendar} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{e?.title || 'Koncertas'}</span>
            </Link>
          ))}
        </div>
        <Link href="/koncertai" onClick={onLink} className="sh-expand-btn" aria-label="Visi koncertai" title="Visi koncertai">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg>
        </Link>
      </div>
    )
    const tiles: { href: string; label: string; rgb: string; icon: React.ReactNode }[] = [
      { href: '/festivaliai',     label: 'Festivaliai',     rgb: '#06b6d4', icon: I.festival },
      { href: '/verta-keliones',  label: 'Verta kelionės',  rgb: '#10b981', icon: I.plane },
      { href: '/galerija',        label: 'Foto reportažai', rgb: '#ec4899', icon: I.gallery },
      { href: '/koncertu-irasai', label: 'Koncertų įrašai', rgb: '#8b5cf6', icon: I.video },
    ]
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-section">
          <span className="sh-mexp-title">Artimiausi koncertai</span>
          <Link href="/koncertai" onClick={onLink} className="sh-mexp-more">Visi <ArrowRight size={10}/></Link>
        </div>
        {renderStrip(eventsLt, 'lt')}
        {renderStrip(eventsWorld, 'world')}
        <div className="sh-mexp-grid" style={{ marginTop: 10 }}>
          {tiles.map(t => (
            <Link key={t.href} href={t.href} onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb(t.rgb) }}>
              <span className="sh-mexp-tile-icon">{t.icon}</span>
              <span className="sh-mexp-tile-label">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  if (navKey === 'atradimai') {
    const mDaily = data?.dailySongs || []
    const mPosts = data?.discoveryPosts || []
    return (
      <div className="sh-mexp">
        {/* Dienos dainos juosta */}
        {mDaily.length > 0 && (
          <>
            <div style={{ ...SEC_HEAD, marginBottom: 6 }}>Dienos dainos</div>
            <div className="sh-strip-wrap" style={{ marginBottom: 12 }}>
              <div className="sh-strip">
                {mDaily.map((s: any, i: number) => (
                  <Link key={s?.slug || `ds-${i}`} href={s?.slug ? `/dainos/${s.slug}` : '/dienos-daina'} onClick={onLink} className="sh-mini sh-mini-md">
                    <ImageBox src={s?.image} accent={accent} glyph={I.music} className="sh-mini-img" />
                    <span className="sh-mini-title sh-mini-title-2">{s?.title || 'Daina'}</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
        {/* Naujausi narių įrašai juosta */}
        {mPosts.length > 0 && (
          <>
            <div style={{ ...SEC_HEAD, marginBottom: 6 }}>Naujausi narių įrašai</div>
            <div className="sh-strip-wrap" style={{ marginBottom: 12 }}>
              <div className="sh-strip">
                {mPosts.map((p: any, i: number) => (
                  <Link key={p?.id || `dp-${i}`} href={p?.blogSlug ? `/blogas/${p.blogSlug}/${p.slug}` : '/blogas'} onClick={onLink} className="sh-mini sh-mini-md">
                    <ImageBox src={p?.image} accent={accent} glyph={I.blog} className="sh-mini-img" />
                    <span className="sh-mini-title sh-mini-title-2">{p?.title || 'Įrašas'}</span>
                    <span className="sh-mini-meta">{postTypeMeta(p?.postType, p?.author)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="sh-mexp-grid">
          <Link href="/vartotojai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#f59e0b') }}>
            <span className="sh-mexp-tile-icon">{I.users}</span>
            <span className="sh-mexp-tile-label">Pažink narius</span>
          </Link>
          <Link href="/dienos-daina" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#f97316') }}>
            <span className="sh-mexp-tile-icon">{I.music}</span>
            <span className="sh-mexp-tile-label">Dienos daina</span>
          </Link>
          <Link href="/diskusijos" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#8b5cf6') }}>
            <span className="sh-mexp-tile-icon">{I.forum}</span>
            <span className="sh-mexp-tile-label">Diskusijos</span>
          </Link>
          <Link href="/blogas" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#a855f7') }}>
            <span className="sh-mexp-tile-icon">{I.blog}</span>
            <span className="sh-mexp-tile-label">Narių įrašai</span>
          </Link>
          <Link href="/pokalbiai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#06b6d4') }}>
            <span className="sh-mexp-tile-icon">{I.chat}</span>
            <span className="sh-mexp-tile-label">Pokalbių dėžutė</span>
          </Link>
          <Link href="/zaidimai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: hexToRgb('#6366f1') }}>
            <span className="sh-mexp-tile-icon">{I.boombox}</span>
            <span className="sh-mexp-tile-label">Žaidimai</span>
          </Link>
        </div>
      </div>
    )
  }

  if (navKey === 'naujienos') {
    const mNewsLt = data?.newsLt || data?.news || []
    const mNewsWorld = data?.newsWorld || []
    const mNewsRow = (kind: 'lt' | 'world', href: string, items: any[]) => (
      <div className="sh-strip-wrap" style={{ marginBottom: 4 }}>
        <RowStripe kind={kind} />
        <div className="sh-strip">
          {(items.length > 0 ? items.slice(0, 10) : Array(5).fill(null)).map((n: any, i: number) => (
            <Link key={n?.id || `${kind}-${i}`} href={n ? `/news/${n.slug}` : href} onClick={onLink} className="sh-mini sh-mini-md">
              <ImageBox src={n?.image} accent={accent} glyph={I.news} className="sh-mini-img" />
              <span className="sh-mini-title sh-mini-title-2">{n?.title || 'Naujiena'}</span>
            </Link>
          ))}
        </div>
        <Link href={href} onClick={onLink} className="sh-expand-btn" aria-label="Visos naujienos" title="Visos naujienos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
            <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
          </svg>
        </Link>
      </div>
    )
    return (
      <div className="sh-mexp">
        {/* Naujausios — LT + Pasaulis juostos */}
        <div style={SECTION_HEAD}>
          <span className="sh-trending-glyph" title="Naujienos">{I.news}</span>
          Naujausios naujienos
        </div>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Lietuva</div>
        {mNewsRow('lt', '/naujienos/lietuva', mNewsLt)}
        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: '10px 0 4px' }}>Pasaulis</div>
        {mNewsRow('world', '/naujienos/pasaulis', mNewsWorld)}

        {/* Pagal tipą */}
        <div style={{ paddingTop: 12, marginTop: 8, borderTop: '1px solid var(--border-default)' }}>
          <div style={SECTION_HEAD}>Pagal tipą</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {NEWS_TYPES.filter(t => t.key !== 'kita').map(t => (
              <Link key={t.key} href={`/naujienos/tipas/${t.slug}`} onClick={onLink} className="sh-news-chip">{t.labelPlural}</Link>
            ))}
          </div>
        </div>

        {/* Pagal stilių (chip'ai) */}
        <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border-default)' }}>
          <div style={SECTION_HEAD}>Pagal stilių</div>
          <div className="sh-chiprow">
            {NEWS_STYLES.map(s => (
              <Link key={s.id} href={`/naujienos/stilius/${s.slug}`} onClick={onLink} className="sh-navchip" title={s.name}>
                <span className="sh-navchip-dot" style={{ background: 'var(--text-faint)' }} aria-hidden />
                {s.name.replace(' muzika', '')}
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }


  if (navKey === 'skelbimai') {
    return (
      <div className="sh-mexp">
        <div className="sh-mexp-grid">
          {[
            { label: 'Vinilas',         icon: I.vinyl,   rgb: '14, 165, 233' },
            { label: 'CD ir kasetės',   icon: I.boombox, rgb: '6, 182, 212' },
            { label: 'Instrumentai',    icon: I.guitar,  rgb: '245, 158, 11' },
            { label: 'Audio įranga',    icon: I.music,   rgb: '168, 85, 247' },
            { label: 'Studijos',        icon: I.quiz,    rgb: '236, 72, 153' },
            { label: 'Paslaugos',       icon: I.market,  rgb: '16, 185, 129' },
          ].map(t => (
            <Link key={t.label} href="/skelbimai" onClick={onLink} className="sh-mexp-tile" style={{ ['--it-rgb' as any]: t.rgb }}>
              <span className="sh-mexp-tile-icon">{t.icon}</span>
              <span className="sh-mexp-tile-label">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return null
}

/* ────────────────────────────────────────────────────────────────
 * Main component
 * ──────────────────────────────────────────────────────────────── */
export function SiteHeader() {
  const { setTheme, dk } = useSite()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [preview, setPreview] = useState<NavPreview | null>(null)
  // Admin /admin/settings paslėpti / restricted nav punktai šiam vartotojui.
  const [hiddenNav, setHiddenNav] = useState<string[]>([])
  // Desktop dropdown'o "closing" state — paspaudus link'ą uždaro
  // panel'ą iškart. SVARBU: suppress'as laikomas KOL pelė fiziškai
  // nepalieka grupės (onMouseLeave). Jei resetintume per pathname ar
  // timeout'ą, po navigacijos CSS :hover vėl atvertų dropdown'ą po vis
  // dar užvestu cursor'iu (būtent tą bug'ą taisom).
  const [closingKey, setClosingKey] = useState<NavItem['key'] | null>(null)

  // Body scroll lock kai drawer'is atidarytas (kad puslapio turinys
  // nesleslintų po modalu)
  useEffect(() => {
    if (menuOpen) {
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = orig }
    }
  }, [menuOpen])

  // Fetch nav preview data once on mount (cached aggressively)
  useEffect(() => {
    let mounted = true
    fetch('/api/nav-preview')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted && d && !d.error) setPreview(d) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  // Paslėpti / restricted nav punktai (admin /admin/settings), per-user.
  // SSR jau paslepia VISUS ne-public punktus per <style id="nav-vis-ssr"> (be
  // flash'o). Gavę vartotojui specifinį sąrašą, PERRAŠOM tą style'ą — taip
  // leistini (allowlist) punktai vėl pasirodo, o uždrausti lieka paslėpti.
  const [navLoaded, setNavLoaded] = useState(false)
  useEffect(() => {
    let mounted = true
    fetch('/api/nav-settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!mounted) return
        if (d && Array.isArray(d.hidden)) setHiddenNav(d.hidden)
        setNavLoaded(true)
      })
      .catch(() => { if (mounted) setNavLoaded(true) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!navLoaded) return
    const css = hiddenNav.map(k => `[data-nav-key="${k}"]{display:none!important}`).join('')
    let el = document.getElementById('nav-vis-ssr') as HTMLStyleElement | null
    if (!el && css) {
      el = document.createElement('style')
      el.id = 'nav-vis-ssr'
      document.head.appendChild(el)
    }
    if (el) el.textContent = css
  }, [navLoaded, hiddenNav])

  // Cmd/Ctrl+K bei "/" atidaro paiešką
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
      else if (e.key === '/' && !inField && !searchOpen) { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const openSearch = () => { setSearchOpen(true); setMenuOpen(false) }

  const bg          = 'rgba(var(--bg-body-rgb), 0.97)'
  const bdr         = '1px solid var(--border-default)'
  const navColor    = 'var(--text-secondary)'
  const navHover    = 'var(--text-primary)'
  const navHoverBg  = 'var(--bg-hover)'
  const logoColor   = 'var(--text-primary)'
  const inputBg     = 'var(--input-bg)'
  const inputBdr    = '1px solid var(--input-border)'
  const mutedIcon   = 'var(--text-muted)'
  const drawerBg    = 'var(--bg-surface)'
  const hamColor    = 'var(--text-muted)'

  const isActive = (item: NavItem) =>
    item.match.some(m => m === '/' ? pathname === '/' : pathname.startsWith(m))

  const renderPanel = (key: NavItem['key'], accent: string) => {
    switch (key) {
      case 'muzika':       return <MuzikaPanel data={preview} accent={accent} />
      case 'topai':        return <TopaiPanel data={preview} accent={accent} />
      case 'renginiai':    return <RenginiaiPanel data={preview} accent={accent} />
      case 'naujienos':    return <NaujienosPanel data={preview} accent={accent} />
      case 'atradimai':    return <BendruomenePanel data={preview} accent={accent} />
      case 'bendruomene':  return <BendruomenePanel data={preview} accent={accent} />
      case 'skelbimai':    return <SkelbimaiPanel data={preview} accent={accent} />
    }
  }

  return (
    <>
      <style>{`
        /* ── Top-level nav link su accent indicator ── */
        .sh-navlink {
          position: relative;
          display: inline-flex; align-items: center;
          font-size: 14px; font-weight: 600;
          padding: 8px 14px;
          text-decoration: none;
          color: ${navColor};
          transition: color .18s ease;
          white-space: nowrap;
          letter-spacing: -0.005em;
        }
        .sh-navlink::after {
          content: '';
          position: absolute;
          left: 14px; right: 14px;
          bottom: 4px;
          height: 2px;
          border-radius: 2px;
          background: var(--accent-orange);
          transform: scaleX(0);
          transition: transform .25s cubic-bezier(.4,0,.2,1);
        }
        .sh-navlink:hover { color: ${navHover}; }
        .sh-navlink:hover::after { transform: scaleX(1); }
        .sh-navlink.active { color: ${navHover}; }
        .sh-navlink.active::after { transform: scaleX(1); }

        /* ── Glass dropdown panel ──
           Visi dropdown'ai anchor'inami prie HEADER konteinerio (ne prie
           individualaus nav item'o) — todėl VISI atsidaro toje pačioje vietoje
           ir vienodu pločiu (solidus vientisumas), ir niekada nenuvažiuoja už
           ekrano krašto. .sh-group palieka static, kad offset parent'as būtų
           header konteineris (position: relative). */
        .sh-group { position: static; }
        .sh-dropdown-wrap {
          position: absolute;
          top: 46px;
          left: 20px;
          padding-top: 10px;
          opacity: 0; pointer-events: none;
          transform: translateY(-6px);
          transition: opacity .2s ease, transform .2s ease;
          z-index: 100;
        }
        .sh-group:hover > .sh-dropdown-wrap,
        .sh-group:focus-within > .sh-dropdown-wrap {
          opacity: 1; pointer-events: auto;
          transform: translateY(0);
        }
        /* Closing state — paspaudus link'ą force'iuojam dropdown išnykti
           net jei cursor'is vis dar virš grupės (kad neliktų po hover'iu) */
        .sh-group.closing > .sh-dropdown-wrap,
        .sh-group.closing:hover > .sh-dropdown-wrap,
        .sh-group.closing:focus-within > .sh-dropdown-wrap {
          opacity: 0 !important;
          pointer-events: none !important;
          transform: translateY(-12px) scale(0.96) !important;
          transition: opacity .15s ease, transform .15s ease !important;
        }
        .sh-panel {
          /* Vienodas plotis VISIEMS dropdown'ams — solidus vientisumas.
             Clamp'inam prie viewport'o, kad siauresniame desktop'e netilptų.
             1040px (buvo 880) — kad „Stiliai" eilė su 8 žanrų chip'ais tilptų
             į VIENĄ eilutę (Alternatyvioji+Elektroninė+Kiti stiliai plačiausi).
             Visi dropdown'ai praplėsti vienodai. */
          width: min(1040px, calc(100vw - 40px));
          padding: 18px;
          background: rgba(var(--bg-surface-rgb), 1);
          backdrop-filter: blur(60px) saturate(180%);
          -webkit-backdrop-filter: blur(60px) saturate(180%);
          /* Stipresnis kraštas + crisp 1px žiedas, kad meniu aiškiai atsiskirtų
             nuo už jo esančio turinio (anksčiau Muzika apačia susiliedavo) */
          border: 1px solid var(--border-strong);
          border-radius: 20px;
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.28),
            0 28px 70px rgba(0,0,0,0.55),
            0 10px 26px rgba(0,0,0,0.32),
            inset 0 1px 0 rgba(255,255,255,0.06);
          position: relative;
          overflow: hidden;
        }
        .sh-panel::before {
          content: '';
          position: absolute;
          top: -100px; right: -100px;
          width: 240px; height: 240px;
          background: radial-gradient(circle, var(--panel-accent) 0%, transparent 70%);
          opacity: 0.12;
          pointer-events: none;
        }

        .sh-panel-section {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
          padding: 0 2px;
        }
        .sh-panel-muzika .sh-panel-section { margin-bottom: 6px; }
        .sh-panel-section-title {
          font-size: 12px; font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 5px;
        }
        /* Trending glyph — mini up-arrow chart, kursoriaus-spalvotas accent
           kuris vizualiai signalizuoja "trending / curated picks" virš
           Atlikėjai/Albumai/Dainos sekcijų */
        .sh-trending-glyph {
          display: inline-flex; align-items: center;
          color: var(--accent-orange);
        }
        .sh-trending-glyph svg { width: 11px; height: 11px; }
        .sh-trending-mini svg { width: 10px; height: 10px; }
        .sh-panel-section-more {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12px; font-weight: 700;
          color: var(--text-secondary);
          text-decoration: none;
          padding: 3px 7px;
          border-radius: 6px;
          transition: background .15s, color .15s;
        }
        .sh-panel-section-more:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* ── Muzika dropdown'o kompakti­ška versija su horizontal scroll ── */

        /* Muzika panel'as: paliekam padding'ą truputį mažesnį */
        .sh-panel-muzika { padding: 14px; }

        /* ── Šoninė rinkmena (rail) + vitrina — Muzikos dropdown'o karkasas ──
           Kairėje siaura tekstinė skilčių rinkmena, dešinėje perjungiama
           trending vitrina. Rail laiko navigaciją, vitrina įkvepia. */
        .sh-panel-railed { display: flex; align-items: stretch; }
        .sh-panel-muzika.sh-panel-railed { padding: 0; }
        .sh-rail {
          width: 210px; flex-shrink: 0;
          border-right: 1px solid var(--border-default);
          padding: 14px 10px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .sh-railitem {
          display: flex; align-items: center; gap: 10px;
          width: 100%; text-align: left;
          padding: 10px 11px;
          border: 1px solid transparent;
          border-radius: 11px;
          background: transparent;
          color: var(--text-secondary);
          text-decoration: none;
          font-family: inherit;
          cursor: pointer;
          transition: background .15s ease, color .15s ease, border-color .15s ease;
        }
        .sh-railitem:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sh-railitem.active {
          background: var(--bg-elevated);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        .sh-railitem-ic {
          display: inline-flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; flex-shrink: 0;
          color: var(--text-muted);
        }
        .sh-railitem-ic svg { width: 18px; height: 18px; }
        /* Radaro rail indikatorius — žalias pulsuojantis taškas. */
        .sh-pulse-dot {
          width: 9px; height: 9px; border-radius: 50%;
          background: #22c55e; flex-shrink: 0;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
          animation: shPulse 1.8s ease-out infinite;
        }
        @keyframes shPulse {
          0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
          70%  { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @media (prefers-reduced-motion: reduce) { .sh-pulse-dot { animation: none; } }
        .sh-railitem-label {
          font-size: 14px; font-weight: 600; letter-spacing: -0.005em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        /* Fiksuotas min-aukštis — kad perjungiant skiltis modalas neсокinetų.
           Atlikėjų dvi juostos = aukščiausia sekcija; kitos prilygsta. */
        .sh-railbody { flex: 1; min-width: 0; padding: 16px 18px; min-height: 356px; }

        /* „Liepsna" = trending (be nelietuviško žodžio) sekcijų antraštėse. */
        .sh-hot-ic { display: inline-flex; align-items: center; color: var(--accent-orange); }
        .sh-hot-ic svg { width: 13px; height: 13px; }

        /* Albumų/dainų kortelės su atlikėjo meta — 1-eilutės title, BE 34px
           rezervo (anksčiau likdavo keistas tarpas tarp title ir atlikėjo). */
        .sh-mini-title-1 { -webkit-line-clamp: 1; }
        .sh-mini-xl.sh-mini--meta { gap: 4px; }
        .sh-mini-xl.sh-mini--meta .sh-mini-title { min-height: 0; }

        /* Rank numerio ženkliukas ant kortelės viršelio (Topai chart stilius). */
        .sh-rank {
          position: absolute; top: 5px; left: 6px; z-index: 1;
          min-width: 18px; height: 18px; padding: 0 5px;
          border-radius: 6px; background: rgba(0,0,0,0.62); color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center;
        }

        /* Vizualų grid — Stiliai (4 stulp.) ir Radaras (5 stulp.), 2 eilutės,
           kad užpildytų erdvę ir nesiskirtų aukštis nuo juostų. */
        .sh-vgrid { display: grid; gap: 10px; }
        .sh-vgrid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .sh-vgrid-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .sh-vcard { display: flex; flex-direction: column; gap: 6px; text-decoration: none; min-width: 0; }
        .sh-vimg {
          position: relative; display: block; width: 100%; aspect-ratio: 16 / 11;
          border-radius: 11px; overflow: hidden;
          background-size: cover; background-position: center;
          background-color: var(--bg-hover);
          border: 0.5px solid var(--border-subtle);
          transition: transform .22s ease;
        }
        .sh-vcard:hover .sh-vimg { transform: scale(1.03); }
        .sh-vtitle {
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 700;
          color: var(--text-primary); line-height: 1.25;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sh-vmeta {
          font-size: 12px; font-weight: 500; color: var(--text-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -2px;
        }
        /* Plakatai/viršeliai — talpinam pagal ilgiausią kraštinę (be apkirpimo). */
        .sh-vimg--contain { background-size: contain; background-repeat: no-repeat; }
        /* Festivalio mini koliažas — top atlikėjų nuotraukos 2×2. */
        .sh-collage { display: grid !important; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 1px; }
        .sh-collage > span { background-size: cover; background-position: center; display: block; }
        /* Apvalūs nario avatarai (Bendruomenė → Nariai). */
        .sh-vimg--round { border-radius: 50%; aspect-ratio: 1 / 1; }
        .sh-vcard--center { align-items: center; text-align: center; }
        /* Mažesnis nario avataras (ne per visą kortelę) — Bendruomenė → Nariai. */
        .sh-vimg--avatar { width: 66px; margin: 0 auto; }
        /* Tipo žyma (Naujienos interviu/recenzija, Bendruomenė apžvalga/koncertas). */
        .sh-tag {
          align-self: flex-start; font-size: 12px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.04em;
          padding: 1px 6px; border-radius: 5px;
          background: var(--bg-elevated); border: 0.5px solid var(--border-default);
          color: var(--text-secondary);
        }
        /* Festivalio vėliava/ikona ant viršelio kampo. */
        .sh-evflag {
          position: absolute; top: 5px; left: 5px; z-index: 1;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 3px 4px; border-radius: 6px; background: rgba(0,0,0,0.55);
        }
        .sh-evflag svg { width: 12px; height: 12px; color: #fff; }

        /* LT vėliavos / world mėlynos juostelės indikatorius — homepage style:
           pritrauktas prie viršaus (align-self: flex-start), 38px aukščio */
        .sh-stripe {
          flex-shrink: 0;
          width: 3px;
          height: 38px;
          border-radius: 2px;
          overflow: hidden;
          align-self: flex-start;
          margin-top: 8px;
        }
        .sh-stripe-lt { display: flex; flex-direction: column; }
        .sh-stripe-world { background: #3b82f6; opacity: 0.65; }

        /* Wrapper'is su flag + scroll strip + „atverti pilną sąrašą" button'as */
        .sh-strip-wrap {
          display: flex; align-items: stretch; gap: 10px;
        }

        /* Homepage StickyMoreButton stiliaus „atverti visą sąrašą" mygtukas.
           Stovi UŽ scroll'inamos juostos (flex-shrink:0) — todėl visada matomas
           dešinėje, nereikia scroll'inti. align-self:stretch → lygus juostos
           aukščiui. 2×2 grid ikona = „peržiūrėti visą sąrašą". */
        /* Lengvas „atverti visą sąrašą" mygtukas — kompaktiškas, vertikaliai
           centruotas (NE per visą juostos aukštį), kad kortelėms liktų daugiau
           vietos ir nebūtų „sienos" jausmo. */
        .sh-expand-btn {
          flex-shrink: 0;
          align-self: center;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          color: var(--text-muted);
          text-decoration: none;
          transition: transform .15s ease, border-color .15s, background .15s, color .15s;
        }
        .sh-expand-btn svg { width: 15px; height: 15px; }
        .sh-expand-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(249, 115, 22, 0.45);
          background: rgba(249, 115, 22, 0.12);
          color: var(--accent-orange);
        }
        /* Atlikėjų eilutė — flag (top-aligned) + scroll juosta + Daugiau link */
        .sh-artist-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 4px 0;
        }
        .sh-artist-row .sh-strip { flex: 1; min-width: 0; }
        .sh-artist-row .sh-more-link { align-self: flex-start; margin-top: 8px; }

        /* Homepage stiliaus 'Daugiau →' link'as — orange, no underline */
        .sh-more-link {
          flex-shrink: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 12px; font-weight: 700;
          color: var(--accent-orange);
          text-decoration: none;
          padding-left: 6px;
          transition: opacity .15s;
        }
        .sh-more-link:hover { opacity: 0.7; }

        /* „Daugiau →" eilutė VIRŠ juostos (dešinėje) — kaip sutvarkytuose
           puslapiuose; juostai lieka visas plotis, be galinės „sienos". */
        .sh-strip-more { display: flex; justify-content: flex-end; margin-bottom: 4px; }

        /* Homepage stiliaus h2 (section title) */
        .sh-panel-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .sh-panel-h2 {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          font-size: 16px; font-weight: 800;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }

        /* ── Vieningi chip'ai antraeilėms sekcijoms (stiliai, šalys, kiti topai) —
              lengvai skaitomi, mažai vizualo, vietoj didelių spalvotų kortelių. ── */
        .sh-chiprow { display: flex; flex-wrap: wrap; gap: 9px; }
        /* Stilių chip'ai — užpildo visą plotį (be tarpo šone): kiekvienas auga
           proporcingai, centruotas tekstas. */
        .sh-chiprow-fill .sh-navchip { flex: 1 1 0; justify-content: center; min-width: max-content; }
        .sh-navchip {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 10px 15px;
          border-radius: 11px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          font-size: 14px; font-weight: 600;
          color: var(--text-primary);
          text-decoration: none; white-space: nowrap;
          line-height: 1.2;
          transition: background .15s, border-color .15s, transform .1s;
        }
        .sh-navchip:hover { background: var(--bg-hover); border-color: var(--accent-orange); }
        .sh-navchip:hover .sh-navchip-ic { color: var(--accent-orange); }
        .sh-navchip:active { transform: scale(0.97); }
        .sh-navchip-dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
        .sh-navchip-flag {
          width: 22px; height: 15px; border-radius: 3px; flex-shrink: 0;
          object-fit: cover; box-shadow: 0 0 0 1px rgba(0,0,0,0.15);
        }
        .sh-navchip-ic { display: inline-flex; flex-shrink: 0; color: var(--text-secondary); transition: color .15s; }
        .sh-navchip-ic svg { width: 17px; height: 17px; }

        /* Stiliai grid — Spotify-style bold colored kortelės */
        .sh-style-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        /* Mobile drawer — 2-col vietoj 4-col (drawer'is siauresnis) */
        .sh-style-grid-mobile {
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
        }

        /* "+ {count}" kaip last card horizontal scroll juostos gale —
           tile dydis matches sh-mini-md (atlikėjo kortelės plotis 82px),
           rodo bendrą atlikėjų skaičių DB'je (atsinaujinia su SWR cache). */
        .sh-more-tile {
          flex: 0 0 82px;
          width: 82px;
          align-self: stretch;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 6px;
          border-radius: 10px;
          background: rgba(249, 115, 22, 0.10);
          border: 1px dashed rgba(249, 115, 22, 0.40);
          text-decoration: none;
          color: var(--accent-orange);
          font-family: 'Outfit', sans-serif;
          text-align: center;
          transition: background .15s, border-color .15s;
        }
        .sh-more-tile:hover {
          background: rgba(249, 115, 22, 0.20);
          border-color: rgba(249, 115, 22, 0.65);
        }
        .sh-more-tile-plus {
          font-size: 22px;
          font-weight: 700;
          line-height: 1;
          opacity: 0.75;
        }
        .sh-more-tile-count {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.01em;
          line-height: 1.1;
        }
        /* Desktop XL versija — matches sh-mini-xl atlikėjo plotis (116px) */
        .sh-more-tile-xl {
          flex-basis: 116px;
          width: 116px;
        }
        .sh-more-tile-xl .sh-more-tile-plus { font-size: 28px; }
        .sh-more-tile-xl .sh-more-tile-count { font-size: 16px; }
        /* Mobile style kortelės — kompaktiškesnės nei desktop'o (kad
           neužimtų daugiau vietos nei atlikėjai) */
        .sh-style-card-mobile {
          min-height: 56px;
          padding: 9px 10px;
        }
        .sh-style-card-mobile .sh-style-card-name {
          font-size: 12px;
        }
        .sh-style-card-mobile.sh-style-card-photo {
          min-height: 60px;
        }
        /* „Kiti topai" mobile grid — dar kompaktiškesnės kortelės (2 stulp. × 3 eil.
           telpa be scrollo). Override'ina sh-style-card-mobile aukštį. */
        .sh-topgrid-mini { gap: 6px; }
        .sh-topgrid-mini .sh-style-card-mobile {
          min-height: 44px;
          padding: 7px 9px;
        }
        .sh-topgrid-mini .sh-style-card-mobile.sh-style-card-photo {
          min-height: 46px;
        }
        .sh-topgrid-mini .sh-style-card-name {
          font-size: 12px;
        }
        .sh-style-card {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 12px 14px;
          border-radius: 12px;
          text-decoration: none;
          background:
            radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 60%),
            linear-gradient(135deg, rgb(var(--it-rgb)) 0%, rgba(var(--it-rgb), 0.78) 100%);
          color: #fff;
          overflow: hidden;
          min-height: 92px;
          transition: transform .18s ease, box-shadow .18s ease;
          box-shadow:
            0 4px 12px rgba(var(--it-rgb), 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }
        .sh-style-card:hover {
          transform: translateY(-3px) rotate(-0.5deg);
          box-shadow:
            0 12px 24px rgba(var(--it-rgb), 0.40),
            inset 0 1px 0 rgba(255, 255, 255, 0.20);
        }
        /* Su realiu stoko vizualu — image bg + STIPRUS dark gradient apačioje
           kad title (apačioje pritrauktas) būtų visada readable */
        .sh-style-card-photo {
          background-color: #1a1a1a;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          min-height: 96px;
          box-shadow:
            0 4px 14px rgba(0, 0, 0, 0.30),
            inset 0 1px 0 rgba(255, 255, 255, 0.10);
        }
        .sh-style-card-photo:hover {
          box-shadow:
            0 14px 28px rgba(0, 0, 0, 0.40),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }
        .sh-style-card:hover .sh-style-card-deco {
          transform: rotate(15deg) scale(1.1);
          opacity: 0.40;
        }
        .sh-style-card-name {
          position: relative;
          z-index: 1;
          display: block;
          font-family: 'Outfit', sans-serif;
          font-size: 16px; font-weight: 800;
          letter-spacing: -0.01em;
          color: #fff;
          line-height: 1.15;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
        }
        .sh-style-card-deco {
          position: absolute;
          top: -10px; right: -10px;
          width: 52px; height: 52px;
          color: #fff;
          opacity: 0.22;
          transform: rotate(8deg);
          transition: transform .35s cubic-bezier(.4,0,.2,1), opacity .25s;
          pointer-events: none;
        }
        .sh-style-card-deco svg { width: 100%; height: 100%; stroke-width: 1.6; }

        /* Horizontal scroll'inama juosta. Slepiam scrollbar'ą bet leidim scroll. */
        .sh-strip {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          overflow-y: hidden;
          flex: 1;
          padding: 2px 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-snap-type: x proximity;
        }
        .sh-strip::-webkit-scrollbar { display: none; }

        /* Bendras mini-tile baseline — su size modifier'ais (-lg / -md / -sm).
           min-width:0 reikalingas truncation'ui flex container'yje. */
        .sh-mini {
          flex-shrink: 0;
          min-width: 0;
          display: flex; flex-direction: column;
          padding: 4px;
          border-radius: 8px;
          text-decoration: none;
          transition: background .15s;
          scroll-snap-align: start;
        }
        .sh-mini:hover { background: var(--bg-hover); }
        .sh-mini:hover .sh-mini-img { transform: scale(1.06); }

        /* Atlikėjai — didžiausi (90×90) */
        .sh-mini-lg { flex-basis: 96px; width: 96px; max-width: 96px; gap: 5px; }
        .sh-mini-lg .sh-mini-img { width: 88px; height: 88px; border-radius: 9px; }
        .sh-mini-lg .sh-mini-title { font-size: 12px; text-align: center; }

        /* VIENODAS dropdown vizualas VISOSE sekcijose — fiksuotas AUKŠTIS 92px
           (Muzika/Topai/Koncertai/Naujienos/Atradimai). Platesnis nei aukštas, kad
           pavadinimai tilptų (mažiau truncation). xl ir md identiški. Pavadinimui
           rezervuotas 2 eilučių aukštis → visos kortelės vienodo aukščio. */
        .sh-mini-xl, .sh-mini-md { flex-basis: 140px; width: 140px; max-width: 140px; gap: 8px; padding: 4px; }
        .sh-mini-xl .sh-mini-img, .sh-mini-md .sh-mini-img { width: 132px; height: 102px; border-radius: 12px; margin: 0; border: 0.5px solid var(--border-subtle); }
        .sh-mini-xl .sh-mini-title, .sh-mini-md .sh-mini-title { font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; line-height: 1.3; text-align: left; min-height: 34px; padding: 0 2px; }
        .sh-mini-xl .sh-mini-meta, .sh-mini-md .sh-mini-meta { font-size: 12px; text-align: left; padding: 0 2px; }

        /* Dainos — mažiausi (60×60) */
        .sh-mini-sm { flex-basis: 68px; width: 68px; max-width: 68px; gap: 3px; }
        .sh-mini-sm .sh-mini-img { width: 60px; height: 60px; border-radius: 7px; }
        .sh-mini-sm .sh-mini-title { font-size: 12px; }
        .sh-mini-sm .sh-mini-meta { font-size: 12px; }

        /* XS — mobile expansion turiniui (52×52) */
        .sh-mini-xs { flex-basis: 60px; width: 60px; max-width: 60px; gap: 3px; padding: 3px; }
        .sh-mini-xs .sh-mini-img { width: 54px; height: 54px; border-radius: 7px; }
        .sh-mini-xs .sh-mini-title { font-size: 12px; }

        .sh-mini-img {
          position: relative;
          display: block;
          margin: 0 auto;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .22s ease;
          overflow: hidden;
        }
        /* 2-line clamp — leidžia ilgesnius vardus matyti pilniau */
        .sh-mini-title {
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.25;
          padding: 0 1px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
          hyphens: auto;
        }
        .sh-mini-title-2 { -webkit-line-clamp: 2; }
        .sh-mini-meta {
          font-size: 12px; font-weight: 500;
          color: var(--text-muted);
          line-height: 1.2;
          padding: 0 1px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Žanro pill (Stiliai juostelė apačioje).
           Border + bg opacity pakelti, kad ir tamsesnės spalvos
           (Sunkioji muzika #374151) būtų matomos ant dark theme.
           Mažas accent dot kairėje — kad spalvinis kodas akivaizdus. */
        .sh-style-pill {
          display: inline-flex; align-items: center; justify-content: center;
          gap: 7px;
          padding: 8px 14px 8px 12px;
          border-radius: 999px;
          text-decoration: none;
          font-size: 12px; font-weight: 700;
          color: var(--text-primary);
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.20) 0%, rgba(var(--it-rgb), 0.06) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.45);
          transition: transform .15s, border-color .15s, background .15s;
          line-height: 1.2;
          white-space: nowrap;
        }
        .sh-style-pill::before {
          content: '';
          width: 7px; height: 7px;
          border-radius: 50%;
          background: rgb(var(--it-rgb));
          flex-shrink: 0;
          box-shadow: 0 0 0 1.5px rgba(var(--it-rgb), 0.25);
        }
        .sh-style-pill:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--it-rgb), 0.75);
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.32) 0%, rgba(var(--it-rgb), 0.12) 100%);
        }

        /* Atlikėjo kortelė (kvadratinė foto + vardas) */
        .sh-artist-card {
          text-decoration: none;
          display: flex; flex-direction: column;
          gap: 6px;
          padding: 6px;
          border-radius: 10px;
          transition: background .15s;
        }
        .sh-artist-card:hover { background: var(--bg-hover); }
        .sh-artist-card:hover .sh-artist-img { transform: scale(1.04); }
        .sh-artist-img {
          position: relative;
          display: block;
          width: 100%; aspect-ratio: 1;
          border-radius: 10px;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .25s ease;
          overflow: hidden;
        }
        .sh-artist-name {
          font-size: 12px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 2px;
        }

        /* Albumo / naujienos eilutė (cover + 2 lines text) */
        .sh-album-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px;
          border-radius: 10px;
          text-decoration: none;
          transition: background .15s;
        }
        .sh-album-row:hover { background: var(--bg-hover); }
        .sh-album-row:hover .sh-album-cover { transform: scale(1.05); }
        /* ── Naujienų dropdown (redizainas 2026-06-03) ── */
        .sh-news-hero-img {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          background-size: cover; background-position: center;
          background-color: var(--bg-hover);
          transition: transform .3s ease;
        }
        .sh-panel a:hover .sh-news-hero-img { transform: scale(1.04); }
        .sh-news-link {
          display: flex; align-items: center; gap: 9px;
          padding: 7px 9px; border-radius: 9px;
          font-size: 14px; font-weight: 600;
          color: var(--text-secondary); text-decoration: none;
          transition: background .15s, color .15s;
        }
        .sh-news-link:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sh-news-chip {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 10px 15px; border-radius: 11px;
          font-size: 14px; font-weight: 600;
          background: var(--bg-elevated); border: 1px solid var(--border-default);
          color: var(--text-primary); text-decoration: none; transition: background .15s, border-color .15s, transform .1s; white-space: nowrap;
        }
        .sh-news-chip:hover { background: var(--bg-hover); border-color: var(--accent-orange); }
        .sh-news-link-icon { font-size: 16px; line-height: 1; width: 18px; text-align: center; }
        .sh-news-style {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 10px; border-radius: 10px;
          font-size: 12px; font-weight: 700;
          color: var(--text-secondary); text-decoration: none;
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          transition: border-color .15s, color .15s, background .15s;
        }
        .sh-news-style:hover {
          border-color: var(--it-accent);
          color: var(--it-accent);
          background: var(--bg-hover);
        }
        .sh-album-cover {
          position: relative;
          flex-shrink: 0;
          width: 48px; height: 48px;
          border-radius: 8px;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .25s ease;
          overflow: hidden;
        }
        .sh-album-info {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; gap: 2px;
        }
        .sh-album-title {
          font-size: 14px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .sh-album-meta {
          font-size: 12px; font-weight: 500;
          color: var(--text-muted);
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Fallback glyph — kai nėra paveiksliuko, rodom centrą ikona */
        .sh-fallback-glyph {
          position: absolute;
          inset: 0;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255, 255, 255, 0.7);
          pointer-events: none;
        }
        .sh-fallback-glyph svg {
          width: 38%; height: 38%;
          stroke-width: 1.6;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        }

        /* Renginio kortelė (poster + info) */
        .sh-event-card {
          display: flex; flex-direction: column;
          gap: 8px;
          padding: 8px;
          border-radius: 12px;
          text-decoration: none;
          transition: background .15s;
        }
        .sh-event-card:hover { background: var(--bg-hover); }
        .sh-event-card:hover .sh-event-img { transform: scale(1.03); }
        .sh-event-img {
          position: relative;
          display: block;
          width: 100%; aspect-ratio: 16/9;
          border-radius: 10px;
          background-size: cover;
          background-position: center;
          background-color: var(--bg-hover);
          transition: transform .25s ease;
          overflow: hidden;
        }
        .sh-event-date {
          position: absolute;
          top: 6px; left: 6px;
          padding: 3px 8px;
          font-size: 12px; font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #fff;
          background: rgba(0,0,0,0.7);
          border-radius: 6px;
          backdrop-filter: blur(8px);
        }
        .sh-event-title {
          font-size: 14px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .sh-event-venue {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
          display: block;
        }

        /* Feature kortelė (Pramogų panel'iui) */
        .sh-feature-card {
          position: relative;
          display: flex; flex-direction: column;
          gap: 6px;
          padding: 16px;
          border-radius: 14px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.18) 0%, rgba(var(--it-rgb), 0.05) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.3);
          transition: transform .18s, box-shadow .18s, border-color .18s;
          overflow: hidden;
        }
        .sh-feature-card:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--it-rgb), 0.55);
          box-shadow: 0 12px 28px rgba(var(--it-rgb), 0.25);
        }
        .sh-feature-big { padding: 18px; min-height: 180px; justify-content: space-between; }
        .sh-feature-icon {
          display: flex;
          width: 44px; height: 44px;
          border-radius: 12px;
          align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 8px 16px rgba(var(--it-rgb), 0.4), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .sh-feature-icon svg { width: 22px; height: 22px; }
        .sh-feature-icon-sm {
          display: flex;
          width: 32px; height: 32px;
          border-radius: 9px;
          align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 4px 10px rgba(var(--it-rgb), 0.3);
          margin-bottom: 4px;
        }
        .sh-feature-icon-sm svg { width: 16px; height: 16px; }
        .sh-feature-title {
          font-size: 20px; font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        .sh-feature-title-sm {
          font-size: 14px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .sh-feature-desc {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        .sh-feature-desc-sm {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.35;
        }
        .sh-feature-cta {
          display: inline-block;
          font-size: 12px; font-weight: 700;
          color: rgba(var(--it-rgb), 1);
          margin-top: auto;
        }
        .sh-soon-pill {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(var(--it-rgb, 156, 163, 175), 0.18);
          color: rgba(var(--it-rgb, 107, 114, 128), 1);
          border: 1px solid rgba(var(--it-rgb, 156, 163, 175), 0.4);
          align-self: flex-start;
        }
        .sh-soon-pill::before {
          content: ''; width: 5px; height: 5px;
          border-radius: 50%; background: currentColor;
          animation: sh-pulse 1.8s infinite;
        }
        @keyframes sh-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.4); }
        }

        /* Radaras mini SVG badge nav dropdown'e — atitinka puslapio RadarSweep */
        .sh-radar-badge {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .09em;
          color: var(--accent-green);
        }

        /* Hero kortelė (Pramogos / Skelbimai) — abstract gradient bg + decorative shapes */
        .sh-hero-card {
          position: relative;
          display: block;
          padding: 22px;
          border-radius: 14px;
          text-decoration: none;
          background:
            radial-gradient(circle at 85% 110%, rgba(249,115,22,0.12) 0%, transparent 55%),
            var(--bg-elevated);
          border: 0.5px solid var(--border-default);
          overflow: hidden;
          color: var(--text-primary);
          transition: transform .25s ease, border-color .25s ease;
        }
        .sh-hero-card:hover {
          transform: translateY(-2px);
          border-color: var(--accent-orange);
        }
        .sh-hero-card:hover .sh-hero-deco-circle { transform: scale(1.08); }
        .sh-hero-deco-circle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%);
          pointer-events: none;
          transition: transform .4s cubic-bezier(.4,0,.2,1);
        }
        .sh-hero-deco-1 { width: 200px; height: 200px; top: -50px; right: -30px; }
        .sh-hero-deco-2 { width: 130px; height: 130px; bottom: -40px; left: 30%; opacity: 0.6; }
        .sh-hero-deco-3 { width: 80px; height: 80px; top: 30%; left: -20px; opacity: 0.5; }

        .sh-hero-content {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          gap: 4px;
        }
        .sh-hero-eyebrow {
          font-size: 12px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: var(--accent-orange);
          margin-bottom: 4px;
        }
        .sh-hero-icon {
          display: inline-flex;
          width: 40px; height: 40px;
          border-radius: 11px;
          align-items: center; justify-content: center;
          background: var(--bg-hover);
          border: 0.5px solid var(--border-subtle);
          color: var(--accent-orange);
          margin-bottom: 10px;
        }
        .sh-hero-icon svg { width: 22px; height: 22px; }
        .sh-hero-title {
          font-size: 24px; font-weight: 900;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.05;
          margin-bottom: 6px;
        }
        .sh-hero-desc {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.5;
          max-width: 90%;
          margin-bottom: 12px;
        }
        .sh-hero-cta {
          display: inline-flex; align-items: center; gap: 6px;
          align-self: flex-start;
          padding: 7px 14px;
          border-radius: 999px;
          font-size: 12px; font-weight: 700;
          background: rgba(249,115,22,0.14);
          border: 0.5px solid rgba(249,115,22,0.4);
          color: var(--accent-orange);
          transition: background .15s, transform .15s;
        }
        .sh-hero-card:hover .sh-hero-cta {
          background: rgba(249,115,22,0.22);
          transform: translateX(2px);
        }

        /* Renginiai panel — spotlight kortelės (festivaliai / foto galerija) */
        .sh-spotlight {
          flex: 1;
          display: flex; align-items: center; gap: 12px;
          padding: 14px 15px;
          border-radius: 12px;
          text-decoration: none;
          background: var(--bg-elevated);
          border: 0.5px solid var(--border-default);
          transition: transform .15s, border-color .15s;
        }
        .sh-spotlight:hover {
          transform: translateY(-2px);
          border-color: var(--accent-orange);
        }
        .sh-spotlight-icon {
          flex-shrink: 0;
          width: 40px; height: 40px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-hover);
          border: 0.5px solid var(--border-subtle);
          color: var(--text-secondary);
        }
        .sh-spotlight:hover .sh-spotlight-icon { color: var(--accent-orange); }
        .sh-spotlight-icon svg { width: 20px; height: 20px; }
        .sh-spotlight-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .sh-spotlight-title {
          display: flex; align-items: center; gap: 5px;
          font-size: 14px; font-weight: 800;
          color: var(--text-primary);
        }
        .sh-spotlight-title svg { color: var(--text-faint); transition: transform .15s, color .15s; }
        .sh-spotlight:hover .sh-spotlight-title svg { transform: translateX(3px); color: var(--accent-orange); }
        .sh-spotlight-desc {
          font-size: 12px; line-height: 1.35;
          color: var(--text-muted);
        }

        /* Bendruomenė panel — big shortcut links */
        .sh-bigshortcut {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          text-decoration: none;
          background: var(--bg-elevated);
          border: 0.5px solid var(--border-default);
          transition: transform .15s, border-color .15s;
        }
        .sh-bigshortcut:hover {
          transform: translateX(2px);
          border-color: var(--accent-orange);
        }
        .sh-bigshortcut-icon {
          flex-shrink: 0;
          width: 36px; height: 36px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
          background: var(--bg-hover);
          border: 0.5px solid var(--border-subtle);
        }
        .sh-bigshortcut:hover .sh-bigshortcut-icon { color: var(--accent-orange); }
        .sh-bigshortcut-icon svg { width: 18px; height: 18px; }
        .sh-bigshortcut-title {
          display: block;
          font-size: 14px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .sh-bigshortcut-desc {
          display: block;
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        /* Skelbimai panel — kategorijų plytelės */
        .sh-cat-tile {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px;
          padding: 14px 10px;
          border-radius: 12px;
          text-decoration: none;
          background: var(--bg-elevated);
          border: 0.5px solid var(--border-default);
          transition: transform .15s, border-color .15s;
          text-align: center;
        }
        .sh-cat-tile:hover {
          transform: translateY(-2px);
          border-color: var(--accent-orange);
        }
        .sh-cat-icon {
          display: flex;
          width: 32px; height: 32px;
          border-radius: 9px;
          align-items: center; justify-content: center;
          color: var(--text-secondary);
          background: var(--bg-hover);
          border: 0.5px solid var(--border-subtle);
        }
        .sh-cat-tile:hover .sh-cat-icon { color: var(--accent-orange); }
        .sh-cat-icon svg { width: 16px; height: 16px; }
        .sh-cat-label {
          font-size: 12px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        /* CTA shortcuts juosta (panel'o apačia) */
        .sh-panel-shortcuts {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid var(--border-default);
        }
        .sh-shortcut {
          font-size: 12px; font-weight: 600;
          padding: 5px 10px;
          border-radius: 7px;
          text-decoration: none;
          color: var(--text-secondary);
          transition: background .15s, color .15s;
        }
        .sh-shortcut:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* ── Responsive ── */
        .sh-desktop-search { display: flex; }
        .sh-desktop-nav    { display: flex; }
        /* Search icon header'yje — atvirkštinė taisyklė: rodom tik kai
           inline search bar'as paslėptas. Above 1080px → bar matomas, ikona
           paslėpta. Below 1080px → bar paslėptas, ikona matoma. */
        .sh-search-icon { display: none; }
        /* Desktop-only veiksmai (Srautas ♥, + Kurti) — mobile juos dengia
           apatinis baras (MobileBottomNav). */
        .sh-desktop-action { display: flex; }
        /* Hamburger tik mobile — desktop'e pilnas nav, ☰ perteklinis. */
        @media (min-width: 1081px) { .sh-burger { display: none !important; } }
        /* Radaras — visada kairėje, prieš logo */
        /* + Kurti — standalone CTA mygtukas (oranžinis pill). */
        .sh-hub-create-standalone {
          display: flex; align-items: center; gap: 6px; padding: 0 14px;
          height: 34px; border-radius: 12px;
          border: none; cursor: pointer; background: var(--accent-orange); color: #fff;
          font-family: inherit; font-size: 14px; font-weight: 700;
          transition: filter .15s, transform .1s;
          -webkit-tap-highlight-color: transparent;
        }
        .sh-hub-create-standalone:hover { filter: brightness(1.08); }
        .sh-hub-create-standalone:active { transform: scale(.96); }
        /* Zonų skirtukas — atskiria „Kurti" CTA nuo asmeninės zonos (D variantas). */
        .sh-zone-div { width: 1px; height: 22px; background: var(--border-default, var(--border-subtle)); margin: 0 4px; border-radius: 1px; flex: 0 0 auto; }
        /* Mano muzika — lengvas tekstinis linkas; pavadinimą slepiam ≤1200px (lieka ♥). */
        @media (max-width: 1200px) { .sh-mymusic-label { display: none; } }
        /* display:contents — wrapper'is nesukuria box'o, bells lieka flex row'e.
           Mobile'e juos paslepiam (apatinis baras juos perima), bet komponentai
           lieka sumontuoti (NotificationsBell dropdown atidaromas per event'ą). */
        .sh-desktop-bells { display: contents; }
        @media (max-width: 1080px) {
          .sh-desktop-search { display: none !important; }
          .sh-desktop-nav    { display: none !important; }
          .sh-search-icon    { display: flex !important; }
          .sh-desktop-action { display: none !important; }
          .sh-desktop-bells  { display: none !important; }
        }
        /* Suppress Safari/Mac fokuso "white ring" ir Firefox dotted outline'ą,
           paliekam tik :hover/active border'į. Be focus-visible custom style'o
           — keyboard-only naviguotojai vis tiek matys, kad button focused per
           jo backgrounds + chevron pointer'į. */
        .sh-desktop-search:focus,
        .sh-desktop-search:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .sh-desktop-search::-moz-focus-inner { border: 0; }
        /* Hover'is per CSS — JS toggle'as su borderColor palikdavo stuck'ą
           border'į kai kuriose naršyklėse. Inline border shorthand'as +
           hover override'as longhand'u — clean'iau. */
        .sh-desktop-search:hover {
          border-color: var(--accent-orange) !important;
          background: var(--bg-hover) !important;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
        }

        /* ── Mobile drawer (full-screen modal) ── */
        .sh-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
          opacity: 0; pointer-events: none; transition: opacity .22s;
        }
        .sh-overlay.open { opacity: 1; pointer-events: all; }
        .sh-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 201;
          width: 360px;
          transform: translateX(-100%);
          transition: transform .25s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .sh-drawer.open { transform: translateX(0); }
        /* Mobile: full-screen */
        @media (max-width: 600px) {
          .sh-drawer { width: 100vw; }
        }

        /* Top bar — kontekstinis */
        .sh-mtop {
          flex-shrink: 0;
          height: 54px;
          display: flex; align-items: center;
          padding: 0 12px;
          gap: 4px;
          border-bottom: 1px solid var(--border-default);
        }
        .sh-mtop-title {
          font-size: 16px; font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          margin-left: 4px;
        }
        .sh-mtop-btn {
          flex-shrink: 0;
          width: 36px; height: 36px;
          border-radius: 9px;
          border: none; background: transparent;
          color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background .12s, color .12s;
        }
        .sh-mtop-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

        /* Body — flex 1, scroll inside */
        .sh-mbody {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          display: flex;
          flex-direction: column;
        }

        /* MAIN VIEW — clean text-row list (no gradients).
           Erdvus, solidus ritmas: skiltys glaudžiai viršuje, bet su pakankamu
           „oru" tarp eilučių (ne ikonos, ne promo — tik aiškūs keliai). */
        .sh-mlist {
          flex: 0 0 auto;
          display: flex; flex-direction: column;
          padding: 10px 0 4px;
        }
        /* Flat blokas — skyriaus antraštė (nuoroda) + sub-nuorodų chip'ai */
        .sh-mblock {
          position: relative;
          padding: 5px 0;
          border-bottom: 1px solid var(--border-default);
        }
        .sh-mblock:last-child { border-bottom: none; }
        .sh-mblock-acc {
          position: absolute;
          left: 0; top: 15px; height: 28px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: var(--accent-orange);
        }
        /* Antraštė — visa eilutė tiesioginė nuoroda į skyriaus puslapį.
           Pavadinimas + rodyklė prie pavadinimo (grupuoti kairėje). */
        .sh-mblock-head {
          display: flex; align-items: center; gap: 7px;
          padding: 12px 18px 9px;
          text-decoration: none;
          border-radius: 10px;
          transition: background .12s;
        }
        .sh-mblock-head:hover, .sh-mblock-head:active { background: var(--bg-hover); }
        .sh-mblock-go {
          flex-shrink: 0;
          color: var(--text-muted);
          opacity: 0.5;
          display: flex;
          margin-top: 1px;
          transition: transform .15s, color .15s, opacity .15s;
        }
        .sh-mblock-head:hover .sh-mblock-go { transform: translateX(2px); opacity: 0.9; }
        .sh-mblock.active .sh-mblock-go { color: var(--accent-orange); opacity: 0.9; }
        /* Sub-nuorodos — visada matomi chip'ai (wrap), kiekvienas tiesioginis link'as */
        .sh-mchips {
          display: flex; flex-wrap: wrap; gap: 8px;
          padding: 0 18px 11px 18px;
        }
        .sh-mchip {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600;
          padding: 5px 11px;
          border-radius: 99px;
          flex-shrink: 0;
          border: 1px solid var(--border-default);
          background: var(--bg-hover);
          color: var(--text-secondary);
          text-decoration: none;
          white-space: nowrap;
          transition: background .12s, color .12s, border-color .12s;
        }
        .sh-mchip:hover, .sh-mchip:active {
          background: rgba(249, 115, 22, 0.08);
          border-color: var(--accent-orange);
          color: var(--text-primary);
        }

        /* Mobile row ikona — monochrome solid look (be per-section spalvų).
           Subtle dark plate + neutralus icon spalva — atrodo professional
           kaip iOS Settings / macOS sidebar. */
        .sh-mrow-icon {
          flex-shrink: 0;
          width: 38px; height: 38px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-primary);
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
        }
        .sh-mrow-icon svg { width: 19px; height: 19px; stroke-width: 2; }
        /* Active row — accent ring around icon (orange brand color) */
        .sh-mblock.active .sh-mrow-icon {
          color: var(--accent-orange);
          border-color: var(--accent-orange);
          background: rgba(249, 115, 22, 0.08);
        }
        .sh-mrow-text {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column;
          gap: 3px;
        }
        .sh-mrow-title {
          font-size: 20px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.15;
          letter-spacing: -0.02em;
        }
        .sh-mblock.active .sh-mrow-title { color: var(--accent-orange); }
        /* Pulsuojantis žalias taškas (pvz. „Naujienų radaras" — live) */
        .sh-mchip-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--accent-green, #22c55e);
          flex-shrink: 0;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
          animation: shMchipPulse 1.8s ease-out infinite;
        }
        @keyframes shMchipPulse {
          0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
          70%  { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sh-mchip-dot { animation: none; }
        }
        .sh-mrow-desc {
          font-size: 12px; font-weight: 500;
          color: var(--text-muted);
          line-height: 1.3;
        }
        /* DRILLED-IN section view — scrollable */
        .sh-msection {
          padding: 10px 12px 14px;
        }

        /* Footer — greiti veiksmai + temos perjungiklis */
        .sh-mfoot {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 8px;
          padding: 9px 14px;
          border-top: 1px solid var(--border-default);
        }
        .sh-mfoot-act {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          gap: 7px;
          padding: 10px 12px;
          border-radius: 10px;
          border: none;
          background: var(--bg-hover);
          color: var(--text-secondary);
          font-size: 14px; font-weight: 700;
          font-family: inherit;
          text-decoration: none;
          cursor: pointer;
          transition: background .12s, color .12s;
        }
        .sh-mfoot-act:hover, .sh-mfoot-act:active {
          background: rgba(249,115,22,0.10); color: var(--accent-orange);
        }
        .sh-mfoot-theme {
          flex-shrink: 0;
          width: 42px; height: 42px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          border: none;
          background: var(--bg-hover);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background .12s, color .12s;
        }
        .sh-mfoot-theme:hover { background: var(--border-default); color: var(--text-primary); }

        .sh-mnav {
          flex: 1;
          padding: 14px;
          display: flex; flex-direction: column;
          gap: 10px;
        }
        .sh-mcard {
          position: relative;
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.14) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.22);
          transition: transform .15s, background .15s, border-color .15s;
          overflow: hidden;
          min-height: 64px;
        }
        .sh-mcard::before {
          content: '';
          position: absolute;
          top: -40px; right: -40px;
          width: 130px; height: 130px;
          background: radial-gradient(circle, rgba(var(--it-rgb), 1) 0%, transparent 70%);
          opacity: 0.10;
          pointer-events: none;
        }
        .sh-mcard:active { transform: scale(0.98); }
        .sh-mcard.active {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.25) 0%, rgba(var(--it-rgb), 0.08) 100%);
          border-color: rgba(var(--it-rgb), 0.55);
        }
        .sh-mcard-icon {
          flex-shrink: 0;
          width: 44px; height: 44px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 8px 18px rgba(var(--it-rgb), 0.35), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .sh-mcard-icon svg { width: 22px; height: 22px; }
        .sh-mcard-text { flex: 1; min-width: 0; }
        .sh-mcard-title {
          font-size: 16px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
          margin-bottom: 3px;
          letter-spacing: -0.01em;
        }
        .sh-mcard-desc {
          font-size: 12px; font-weight: 500;
          color: var(--text-secondary);
          line-height: 1.35;
          opacity: 0.85;
        }
        .sh-mcard-arrow {
          flex-shrink: 0;
          color: rgba(var(--it-rgb), 1);
          opacity: 0.6;
          transition: transform .22s ease;
        }
        /* Mobile drawer expansion — kompaktinis dropdown turinys */
        .sh-mwrap { display: flex; flex-direction: column; }
        .sh-mcard.expanded {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.22) 0%, rgba(var(--it-rgb), 0.07) 100%);
          border-color: rgba(var(--it-rgb), 0.5);
        }
        .sh-mexp {
          padding: 10px 4px 4px;
          display: flex; flex-direction: column;
          gap: 8px;
        }
        .sh-mexp-cta {
          display: inline-flex; align-items: center; gap: 6px;
          align-self: flex-start;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px; font-weight: 700;
          text-decoration: none;
          color: rgba(var(--it-rgb), 1);
          background: rgba(var(--it-rgb), 0.12);
          border: 1px solid rgba(var(--it-rgb), 0.35);
          transition: background .15s, border-color .15s;
        }
        .sh-mexp-cta:hover {
          background: rgba(var(--it-rgb), 0.22);
          border-color: rgba(var(--it-rgb), 0.55);
        }
        .sh-mexp-section {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 4px;
          margin-top: 4px;
        }
        .sh-mexp-title {
          font-size: 12px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .sh-mexp-more {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: 12px; font-weight: 700;
          padding: 2px 6px;
          border-radius: 5px;
          color: var(--text-secondary);
          text-decoration: none;
        }
        .sh-mexp-more:hover { background: var(--bg-hover); color: var(--text-primary); }

        .sh-mexp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .sh-mexp-tile {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.12) 0%, rgba(var(--it-rgb), 0.04) 100%);
          border: 1px solid rgba(var(--it-rgb), 0.20);
          transition: background .15s, border-color .15s, transform .15s;
        }
        .sh-mexp-tile:active { transform: scale(0.97); }
        .sh-mexp-tile:hover {
          background: linear-gradient(135deg, rgba(var(--it-rgb), 0.20) 0%, rgba(var(--it-rgb), 0.06) 100%);
          border-color: rgba(var(--it-rgb), 0.45);
        }
        .sh-mexp-tile-icon {
          flex-shrink: 0;
          width: 26px; height: 26px;
          border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          background: linear-gradient(135deg, rgba(var(--it-rgb), 1) 0%, rgba(var(--it-rgb), 0.75) 100%);
          box-shadow: 0 3px 8px rgba(var(--it-rgb), 0.3);
        }
        .sh-mexp-tile-icon svg { width: 14px; height: 14px; }
        .sh-mexp-tile-label {
          font-size: 12px; font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      {/* ─── HEADER BAR ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{ background: bg, backdropFilter: 'blur(22px)', borderBottom: bdr }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>

          {/* Hamburger — TIK mobile (≤1080px): desktop'e pilnas nav matomas,
              ☰ šalia jo buvo perteklinis (2026-06-11 consistency). */}
          <button onClick={() => setMenuOpen(true)} aria-label="Meniu" className="sh-burger"
            style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: hamColor, borderRadius: 8, transition: 'color .15s, background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = navHover; e.currentTarget.style.background = navHoverBg }}
            onMouseLeave={e => { e.currentTarget.style.color = hamColor; e.currentTarget.style.background = 'transparent' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Radaro ikona iš top bar'o pašalinta (2026-06-25) — radaras lieka
              Muzikos hover dropdown'e ir /nauji-atlikejai. Mažiau vizualaus triukšmo. */}
          <Link href="/" style={{ flexShrink: 0, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--accent-orange)' }}>.lt</span>
          </Link>

          {/* Desktop nav with rich dropdowns */}
          <nav className="sh-desktop-nav" style={{ alignItems: 'center', gap: 2, marginLeft: 10, flexShrink: 0 }}>
            {NAV.map(n => {
              const active = isActive(n)
              const closing = closingKey === n.key
              return (
                <div
                  key={n.label}
                  data-nav-key={n.key}
                  className={`sh-group${closing ? ' closing' : ''}`}
                  // Suppress'as nuimamas TIK kai pelė palieka grupę — taip
                  // dropdown'as nebeatsiranda po click'o, kol cursor'is stovi vietoje.
                  onMouseLeave={() => setClosingKey(k => (k === n.key ? null : k))}
                >
                  <Link
                    href={n.href}
                    className={`sh-navlink${active ? ' active' : ''}`}
                    onClick={() => setClosingKey(n.key)}
                  >
                    {n.label}
                  </Link>
                  <div
                    className="sh-dropdown-wrap"
                    style={{ ['--panel-accent' as any]: n.accent }}
                    // Bet koks click'as dropdown'o viduje (paprastai ant Link'o)
                    // — uždaro panel'ą iškart, kad nesimatytų po hover'iu.
                    onClick={() => setClosingKey(n.key)}
                  >
                    {renderPanel(n.key, n.accent)}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Paieškos trigger'is — pagrindinis page elementas. Padidinom
              dydį (380px max), brand orange ikoną, "Ieškoti" tekstą bold'esnį.
              Hover'is per CSS (.sh-desktop-search:hover) — neturi sticky
              border'io bug'o. ⌘K shortcut'as išmestas — tai techninis hint'as,
              kuris apkrovė nav'ą. */}
          <button
            type="button"
            onClick={openSearch}
            className="sh-desktop-search"
            aria-label="Atidaryti paiešką"
            style={{
              flex: '1 1 380px', maxWidth: 460, marginLeft: 'auto',
              alignItems: 'center', borderRadius: 22,
              background: inputBg, border: inputBdr,
              padding: '0 16px',
              height: 38,
              cursor: 'pointer',
              transition: 'border-color .15s, background .15s, box-shadow .15s',
              fontFamily: 'inherit',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              gap: 12,
            }}
          >
            <span style={{ display: 'flex', color: 'var(--accent-orange)', flexShrink: 0 }}>
              <SearchIcon />
            </span>
            <span style={{
              flex: 1, fontSize: 14, fontWeight: 600,
              color: 'var(--text-secondary)', textAlign: 'left',
              letterSpacing: '-0.005em',
            }}>
              Ieškoti
            </span>
          </button>

          <div style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Search icon — rodom tik kai inline search bar'as paslėptas
                (≤1080px), kad neprasidėtų redundancy su sh-desktop-search. */}
            <button
              type="button"
              onClick={openSearch}
              aria-label="Atidaryti paiešką"
              className="sh-search-icon"
              style={{
                width: 34, height: 34,
                // display: paliekam CSS klasėje (display:none default + flex
                // ≤1080px). Inline style'as override'intų klasę ir ikona
                // visada būtų matoma — tai sukėlė dvigubą paiešką desktop'e.
                alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-muted)', borderRadius: 8,
                transition: 'color .15s, background .15s',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>

            {/* + Kurti — standalone CTA mygtukas (QuickCreate).
                Tik desktop (mobile = apatinis baras). */}
            <button
              type="button"
              onClick={() => openQuickCreate()}
              aria-label="Kurti"
              className="sh-desktop-action sh-hub-create-standalone"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Kurti</span>
            </button>

            {/* Zonų skirtukas — atskiria „Kurti" veiksmą nuo asmeninės zonos
                (Mano muzika · žinutės · pranešimai · avataras). D variantas. */}
            <span className="sh-desktop-action sh-zone-div" aria-hidden />

            {/* Mano muzika (♥) — asmeninė muzikos zona: kolekcija + Atradimai
                (Mėgstami / Tau gali patikti). Lengvas tekstinis linkas (be rėmelio),
                kad nekonkuruotų su „Kurti" CTA. Tik desktop (mobile = apatinis baras). */}
            {(() => {
              const mmActive = pathname.startsWith('/mano-muzika') || pathname.startsWith('/srautas')
              return (
                <Link
                  href="/mano-muzika"
                  aria-label="Mano muzika"
                  className="sh-desktop-action sh-mymusic-link"
                  style={{
                    alignItems: 'center', gap: 6, padding: '0 6px', height: 34,
                    color: mmActive ? 'var(--accent-orange)' : 'var(--text-secondary)',
                    fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                    transition: 'color .15s',
                  }}
                  onMouseEnter={e => { if (!mmActive) e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { if (!mmActive) e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
                  </svg>
                  <span className="sh-mymusic-label">Mano muzika</span>
                </Link>
              )
            })()}

            {/* Žinutės (Pokalbiai) — VISADA matomi (top bar), kaip Instagram/TikTok.
                Perkelti iš apatinio baro, kad „+" liktų per vidurį. */}
            <MessagesBell />
            {/* Pranešimai — VISADA matomi (top bar), kaip Instagram/TikTok.
                Nebėra apatiniame bare. Mobile'e bell atidaro full-screen modalą. */}
            <NotificationsBell />
            <HeaderAuth />
          </div>
        </div>
      </header>

      {/* ─── MOBILE DRAWER (full-screen modal su drill-in pattern) ─── */}
      <div className={`sh-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className={`sh-drawer${menuOpen ? ' open' : ''}`} style={{ background: drawerBg }}>

        {/* TOP BAR — logo + uždarymas (flat meniu, be drill-in) */}
        <div className="sh-mtop">
          <Link href="/" onClick={() => setMenuOpen(false)} style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 900, fontSize: 20, color: logoColor }}>music</span>
            <span style={{ fontWeight: 900, fontSize: 20, color: 'var(--accent-orange)' }}>.lt</span>
          </Link>
          <button onClick={() => setMenuOpen(false)} aria-label="Uždaryti" className="sh-mtop-btn" style={{ marginLeft: 'auto' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* CONTENT — flat meniu: skyrius = tiesioginė nuoroda, po juo sub-nuorodų chip'ai */}
        <div className="sh-mbody">
          <nav className="sh-mlist">
            {NAV.map(n => {
              const active = isActive(n)
              const subs = NAV_SUBLINKS[n.key] || []
              return (
                <div key={n.label} data-nav-key={n.key} className={`sh-mblock${active ? ' active' : ''}`}>
                  {active && <span className="sh-mblock-acc" />}
                  <Link
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="sh-mblock-head"
                  >
                    <span className="sh-mrow-title">{n.label}</span>
                    <span className="sh-mblock-go" aria-hidden>
                      <ArrowRight size={15} />
                    </span>
                  </Link>
                  {subs.length > 0 && (
                    <div className="sh-mchips">
                      {subs.map(s => (
                        <Link key={s.href} href={s.href} onClick={() => setMenuOpen(false)} className="sh-mchip">
                          {s.dot && <span className="sh-mchip-dot" aria-hidden />}
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </div>

        {/* FOOTER — greiti veiksmai + kompaktiškas temos perjungiklis */}
        <div className="sh-mfoot">
          <button type="button" onClick={openSearch} className="sh-mfoot-act">
            <SearchIcon size={16} />
            Paieška
          </button>
          <Link href="/auth/profile" onClick={() => setMenuOpen(false)} className="sh-mfoot-act">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Profilis
          </Link>
          <button
            type="button"
            onClick={() => setTheme(dk ? 'light' : 'dark')}
            className="sh-mfoot-theme"
            aria-label={dk ? 'Įjungti šviesią temą' : 'Įjungti tamsią temą'}
            title={dk ? 'Šviesi tema' : 'Tamsi tema'}
          >
            {dk ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      <MasterSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
