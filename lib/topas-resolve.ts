// lib/topas-resolve.ts
//
// Vidinių narių topų (blog_posts.list_items) susiejimas su DB katalogu.
// Borrow iš išorinių topų (lib/chart-resolve): match → entity_id; trūkstamus
// galima sukurti (ghost atlikėjas + daina). Palaiko abu list_items formatus
// (legacy plain-text ir naują ListItem) ir grąžina vieningą naują formatą su
// `match_state` flag'u (matched / created / artist_only / unmatched / kept).

import {
  findConfidentMatch, findConfidentAlbumMatch, normalizeForMatch, primaryArtist,
  findOrCreateArtist, createTrackForArtist,
} from '@/lib/chart-resolve'

const firstArr = (v: any) => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
function escHtml(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/**
 * Enrichina prozą (įžanga/pabaiga, pvz. „Garbingi paminėjimai"): suranda
 * „Atlikėjas – Pavadinimas" eilutes, kurios YRA DB kataloge, ir paverčia jas
 * aktyviomis nuorodomis su mini viršeliu. Nerasti lieka paprastu tekstu.
 */
const ENRICH_STOP = new Set(['bet', 'jau', 'tai', 'nes', 'kad', 'dar', 'jis', 'jie', 'man', 'mano', 'sis', 'sie', 'taip', 'todel', 'taciau', 'beje', 'zinoma', 'visgi', 'spotify', 'youtube', 'the', 'and', 'with', 'for', 'this', 'that', 'gale', 'apie', 'kaip', 'savo', 'labai', 'tik', 'net', 'gal', 'jog', 'vis', 'pirma', 'antra'])
function enrichLinkHtml(inf: { href: string; cover: string | null }, text: string) {
  const thumb = inf.cover ? `<img class="bp-enrich-thumb" src="${inf.cover}" alt=""/>` : ''
  return `<a class="bp-enrich" href="${inf.href}">${thumb}<span>${escHtml(text)}</span></a>`
}
async function enrichAlbInfo(sb: Sb, id: number) { const { data } = await sb.from('albums').select('slug, cover_image_url, artist:artist_id(slug)').eq('id', id).maybeSingle(); const ar = firstArr(data?.artist); return { href: `/albumai/${[ar?.slug, data?.slug].filter(Boolean).join('-')}-${id}`, cover: data?.cover_image_url || null } }
async function enrichTrkInfo(sb: Sb, id: number) { const { data } = await sb.from('tracks').select('slug, cover_url, video_url').eq('id', id).maybeSingle(); return { href: `/dainos/${data?.slug}-${id}`, cover: ytThumb(data?.video_url) || data?.cover_url || null } }
async function enrichByTitle(sb: Sb, title: string) {
  const tN = normalizeForMatch(title); if (!tN) return null
  const tok = (title.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2).sort((a, b) => b.length - a.length)[0] || title).replace(/[%_]/g, '')
  const { data: tr } = await sb.from('tracks').select('id, slug, title, cover_url, video_url, score').ilike('title', `%${tok}%`).limit(40)
  const th = (tr || []).filter((x: any) => normalizeForMatch(x.title) === tN).sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1))[0]
  if (th) return { href: `/dainos/${th.slug}-${th.id}`, cover: ytThumb(th.video_url) || th.cover_url || null }
  const { data: al } = await sb.from('albums').select('id, slug, title, cover_image_url, score, artist:artist_id(slug)').ilike('title', `%${tok}%`).limit(40)
  const ah = (al || []).filter((x: any) => normalizeForMatch(x.title) === tN).sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1))[0]
  if (ah) { const ar = firstArr(ah.artist); return { href: `/albumai/${[ar?.slug, ah.slug].filter(Boolean).join('-')}-${ah.id}`, cover: ah.cover_image_url || null } }
  return null
}

// AGRESYVUS: ne tik „Atlikėjas – Pavadinimas", bet ir cituoti pavadinimai („X")
// + tekste minimi atlikėjų vardai (DB). Manual triggeris → kelios klaidos OK.
export async function enrichProseLinks(sb: Sb, html: string): Promise<string> {
  if (!html) return html
  const blocks = [...html.matchAll(/(<p\b[^>]*>)([\s\S]*?)<\/p>/gi)].map(m => ({ raw: m[0], open: m[1], text: stripTags(m[2]) }))
  if (!blocks.length) return html

  type Cand = { kind: 'pair' | 'title' | 'artist'; text: string; artist?: string; title?: string }
  const cands = new Map<string, Cand>()
  const QUOTE = /[„“"'’‘]([^„“”"'’‘<>]{3,70}?)[“”"'’]/gu
  const PHRASE = /(\p{Lu}[\p{L}\p{N}.&'’-]+(?:\s+(?:&\s+|and\s+)?\p{Lu}[\p{L}\p{N}.&'’-]+){0,3})/gu
  for (const b of blocks) {
    const tt = b.text.trim()
    const dm = tt.match(/^(.{2,80}?)\s[–—]\s(.{2,140})$/)
    if (dm && !/^\d+\./.test(tt)) { if (!cands.has('p:' + tt)) cands.set('p:' + tt, { kind: 'pair', text: tt, artist: dm[1].trim(), title: dm[2].trim() }); continue }
    for (const m of b.text.matchAll(QUOTE)) { const t = m[1].trim().replace(/[.,;:!?]+$/, ''); if (t.length >= 3 && !cands.has('t:' + t)) cands.set('t:' + t, { kind: 'title', text: t, title: t }) }
    for (const m of b.text.matchAll(PHRASE)) { const t = m[1].trim().replace(/[.,;:]+$/, ''); if (t.length >= 4 && !ENRICH_STOP.has(t.toLowerCase()) && !cands.has('a:' + t) && !cands.has('t:' + t)) cands.set('a:' + t, { kind: 'artist', text: t, artist: t }) }
  }

  const resolved = new Map<string, { href: string; cover: string | null }>()
  const list = [...cands.values()].slice(0, 90)
  for (let s = 0; s < list.length; s += 8) {
    await Promise.all(list.slice(s, s + 8).map(async (c) => {
      try {
        if (c.kind === 'pair') {
          const al = await findConfidentAlbumMatch(sb, c.artist!, c.title!).catch(() => null)
          if (al) { resolved.set(c.text, await enrichAlbInfo(sb, al.albumId)); return }
          const tr = await findConfidentMatch(sb, c.artist!, c.title!).catch(() => null)
          if (tr) resolved.set(c.text, await enrichTrkInfo(sb, tr.trackId))
        } else if (c.kind === 'title') {
          const e = await enrichByTitle(sb, c.title!); if (e) resolved.set(c.text, e)
        } else {
          const a = await findArtistByName(sb, c.artist!).catch(() => null)
          if (a?.slug) resolved.set(c.text, { href: `/atlikejai/${a.slug}`, cover: a.cover || null })
        }
      } catch {}
    }))
  }
  if (!resolved.size) return html

  let out = html
  const isWord = (ch: string) => /[\p{L}\p{N}]/u.test(ch)
  for (const b of blocks) {
    const tt = b.text.trim()
    if (resolved.has(tt)) { out = out.replace(b.raw, `${b.open}${enrichLinkHtml(resolved.get(tt)!, tt)}</p>`); continue }
    const matches: { start: number; end: number; text: string }[] = []
    for (const [text] of resolved) {
      if (text === tt) continue
      let idx = 0
      while ((idx = b.text.indexOf(text, idx)) >= 0) {
        const before = idx > 0 ? b.text[idx - 1] : ' '
        const after = idx + text.length < b.text.length ? b.text[idx + text.length] : ' '
        if (!isWord(before) && !isWord(after)) matches.push({ start: idx, end: idx + text.length, text })
        idx += text.length
      }
    }
    if (!matches.length) continue
    matches.sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start))
    const chosen: typeof matches = []; let last = -1
    for (const m of matches) { if (m.start >= last) { chosen.push(m); last = m.end } }
    if (!chosen.length) continue
    let h = '', pos = 0
    const isQuote = (ch: string) => /[„“”‘’"']/.test(ch)
    for (const m of chosen) {
      let s = m.start, e = m.end
      // Kabučių slėpimas: jei terminas apsuptas „…" — įtraukiam kabutes į praleidžiamą ruožą
      if (s > 0 && isQuote(b.text[s - 1]) && e < b.text.length && isQuote(b.text[e])) { s -= 1; e += 1 }
      h += escHtml(b.text.slice(pos, s)) + enrichLinkHtml(resolved.get(m.text)!, m.text); pos = e
    }
    h += escHtml(b.text.slice(pos))
    out = out.replace(b.raw, `${b.open}${h}</p>`)
  }
  return out
}

type Sb = any

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
function ytThumb(url?: string | null): string | null {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}

// Randa atlikėją be kūrimo (normalizuotas lookup). Eksportuotas alias žemiau.
export async function findArtistByName(sb: Sb, rawArtist: string): Promise<{ id: number; slug: string | null; cover: string | null } | null> {
  return findArtistOnly(sb, rawArtist)
}
async function findArtistOnly(sb: Sb, rawArtist: string): Promise<{ id: number; slug: string | null; cover: string | null } | null> {
  const name = primaryArtist(rawArtist) || rawArtist
  const nNorm = normalizeForMatch(name)
  if (!nNorm) return null
  const tok = (name.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2).sort((a, b) => b.length - a.length)[0] || name).replace(/[%_]/g, '')
  const { data } = await sb.from('artists').select('id, name, slug, cover_image_url').ilike('name', `%${tok}%`).limit(60)
  const hit = (data || []).find((a: any) => normalizeForMatch(a.name) === nNorm)
  return hit ? { id: hit.id, slug: hit.slug || null, cover: hit.cover_image_url || null } : null
}

export type MatchState = 'matched' | 'created' | 'artist_only' | 'unmatched' | 'kept'
export type ResolveSummary = { total: number; matched: number; created: number; kept: number; artist_only: number; unmatched: number }

type RawEntry = { rank: number; artist: string; title: string | null; comment: string | null; rating: number | null; isArtistEntry: boolean; keep?: any }

// Detekcija: ar list_item jau naujo formato.
export function isNewItem(e: any): boolean {
  return !!e && typeof e === 'object' && ('rank' in e || 'entity_id' in e || 'entity_slug' in e)
}

/**
 * Konvertuoja + sumačina (ir, jei opts.create, sukuria trūkstamus) topo list_items.
 * Grąžina naują items masyvą (ListItem + match_state) ir summary.
 */
export async function resolveTopasItems(
  sb: Sb, list: any[], opts: { create?: boolean } = {},
): Promise<{ items: any[]; summary: ResolveSummary }> {
  // 1) RawEntry (palaikom abu formatus). Jau gerai sumatchintus paliekam (keep).
  const raws: RawEntry[] = list.map((e: any, i: number) => {
    const isNew = isNewItem(e)
    const isArtistEntry = (e?.type === 'artist')
    if (isNew && e.entity_id != null) {
      return { rank: e.rank ?? i + 1, artist: e.artist || '', title: isArtistEntry ? null : (e.title || null), comment: e.comment ?? null, rating: e.rating ?? null, isArtistEntry, keep: e }
    }
    const artist = e.artist || e.artist_name || ''
    const title = isArtistEntry ? null : (e.title || e.track_title || null)
    return { rank: e.rank ?? e.position ?? i + 1, artist, title, comment: e.comment ?? e.description ?? null, rating: e.rating ?? null, isArtistEntry }
  })

  // 2) Match (chunked parallel).
  type Resolved = { raw: RawEntry; trackId?: number; artistId?: number; state: MatchState }
  const resolved: Resolved[] = new Array(raws.length)
  const idxs = raws.map((_, i) => i)
  for (let s = 0; s < idxs.length; s += 8) {
    await Promise.all(idxs.slice(s, s + 8).map(async (i) => {
      const r = raws[i]
      if (r.keep) { resolved[i] = { raw: r, state: 'kept' }; return }
      if (r.title && r.title.trim()) {
        const m = await findConfidentMatch(sb, r.artist, r.title).catch(() => null)
        if (m) { resolved[i] = { raw: r, trackId: m.trackId, artistId: m.artistId, state: 'matched' }; return }
        const a = await findArtistOnly(sb, r.artist).catch(() => null)
        resolved[i] = a ? { raw: r, artistId: a.id, state: 'artist_only' } : { raw: r, state: 'unmatched' }
      } else {
        const a = await findArtistOnly(sb, r.artist).catch(() => null)
        resolved[i] = a ? { raw: r, artistId: a.id, state: 'matched' } : { raw: r, state: 'unmatched' }
      }
    }))
  }

  // 3) Create trūkstamus (SEKVENCIŠKAI — findOrCreateArtist race apsauga).
  if (opts.create) {
    for (const r of resolved) {
      if (r.state === 'matched' || r.state === 'kept') continue
      try {
        if (r.raw.isArtistEntry) {
          const aid = await findOrCreateArtist(sb, r.raw.artist, null)
          r.artistId = aid; r.state = 'created'
        } else {
          const aid = r.artistId ?? await findOrCreateArtist(sb, r.raw.artist, null)
          const tid = await createTrackForArtist(sb, aid, r.raw.title || r.raw.artist)
          r.artistId = aid; r.trackId = tid; r.state = 'created'
        }
      } catch { /* lieka flag'as */ }
    }
  }

  // 4) Cover/slug resolve (batch).
  const trackIds = [...new Set(resolved.filter(r => r.trackId).map(r => r.trackId!))]
  const artistIds = [...new Set(resolved.filter(r => r.artistId).map(r => r.artistId!))]
  const trackInfo = new Map<number, { slug: string | null; image: string | null }>()
  const artistInfo = new Map<number, { slug: string | null; image: string | null }>()
  if (trackIds.length) {
    const { data } = await sb.from('tracks').select('id, slug, cover_url, video_url, artists:artist_id(cover_image_url)').in('id', trackIds)
    for (const t of (data || []) as any[]) {
      const ac = Array.isArray(t.artists) ? t.artists[0]?.cover_image_url : t.artists?.cover_image_url
      trackInfo.set(t.id, { slug: t.slug || null, image: ytThumb(t.video_url) || t.cover_url || ac || null })
    }
  }
  if (artistIds.length) {
    const { data } = await sb.from('artists').select('id, slug, cover_image_url').in('id', artistIds)
    for (const a of (data || []) as any[]) artistInfo.set(a.id, { slug: a.slug || null, image: a.cover_image_url || null })
  }

  // 5) Naujas list_items.
  const items = resolved.map((r) => {
    if (r.state === 'kept') return r.raw.keep
    const base = { rank: r.raw.rank, title: r.raw.title || r.raw.artist || '?', artist: r.raw.artist || null, comment: r.raw.comment, rating: r.raw.rating }
    if ((r.state === 'matched' || r.state === 'created') && r.raw.isArtistEntry && r.artistId) {
      const a = artistInfo.get(r.artistId)
      return { ...base, type: 'artist', entity_id: r.artistId, entity_slug: a?.slug || null, image_url: a?.image || null, match_state: r.state }
    }
    if ((r.state === 'matched' || r.state === 'created') && r.trackId) {
      const t = trackInfo.get(r.trackId)
      return { ...base, type: 'track', entity_id: r.trackId, entity_slug: t?.slug || null, image_url: t?.image || null, match_state: r.state }
    }
    if (r.state === 'artist_only' && r.artistId) {
      const a = artistInfo.get(r.artistId)
      return { ...base, type: 'track', entity_id: null, entity_slug: null, image_url: a?.image || null, match_state: 'artist_only', artist_id_hint: r.artistId }
    }
    return { ...base, type: r.raw.isArtistEntry ? 'artist' : 'track', entity_id: null, entity_slug: null, image_url: null, match_state: 'unmatched' }
  })

  const summary: ResolveSummary = {
    total: items.length,
    matched: resolved.filter(r => r.state === 'matched').length,
    created: resolved.filter(r => r.state === 'created').length,
    kept: resolved.filter(r => r.state === 'kept').length,
    artist_only: resolved.filter(r => r.state === 'artist_only').length,
    unmatched: resolved.filter(r => r.state === 'unmatched').length,
  }
  return { items, summary }
}

// Ištraukia įrašus iš topo `content` HTML — paryškintos „N. Atlikėjas – Pavadinimas"
// eilutės (taip nariai rašo free-text topus). Grąžina pseudo-legacy list_items,
// kuriuos toliau apdoroja resolveTopasItems.
export function parseTopasFromContent(content: string): any[] {
  if (!content) return []
  const decode = (s: string) => s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  const seen = new Map<number, { artist: string; title: string }>()
  const re = /<strong[^>]*>([\s\S]*?)<\/strong>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const txt = decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    const mm = txt.match(/^(\d{1,3})\.\s*(.+?)\s[–—-]\s(.+)$/)
    if (!mm) continue
    const rank = parseInt(mm[1], 10)
    if (!seen.has(rank)) seen.set(rank, { artist: mm[2].trim(), title: mm[3].trim() })
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([rank, v]) => ({
    position: rank, artist_name: v.artist, track_title: v.title,
  }))
}

// ── Topo grojaraštis (player) ────────────────────────────────────────────────
// Iš topo įrašų sudaro grojaraštį: daina→ta daina; albumas→populiariausia (score)
// to albumo daina; atlikėjas→populiariausia to atlikėjo daina. Tik su YT video.
// Grąžina ExtractedTrack[] suderinamą su UnifiedPlayer.
const YT_PLAY = /(?:youtube\.com\/watch\?v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/
export async function buildTopasPlaylist(sb: Sb, listItems: any[]): Promise<any[]> {
  const items = Array.isArray(listItems) ? listItems : []
  const trackIds: number[] = [], albumIds: number[] = [], artistIds: number[] = []
  for (const e of items) {
    if (!e || e.entity_id == null) continue
    if (e.type === 'track') trackIds.push(e.entity_id)
    else if (e.type === 'album') albumIds.push(e.entity_id)
    else if (e.type === 'artist') artistIds.push(e.entity_id)
  }
  const trackById = new Map<number, any>()
  const TSEL = 'id, title, slug, video_url, cover_url, score, artist:artist_id(name, slug)'

  if (trackIds.length) {
    const { data } = await sb.from('tracks').select(TSEL).in('id', trackIds)
    for (const t of (data || []) as any[]) trackById.set(t.id, t)
  }

  const albumTop = new Map<number, number>()
  if (albumIds.length) {
    const { data } = await sb.from('album_tracks')
      .select(`album_id, position, tracks:track_id(${TSEL})`).in('album_id', albumIds)
    const byAlbum = new Map<number, any[]>()
    for (const r of (data || []) as any[]) {
      const t = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
      if (!t) continue
      const arr = byAlbum.get(r.album_id) || []; arr.push({ ...t, _pos: r.position }); byAlbum.set(r.album_id, arr)
    }
    for (const [aid, arr] of byAlbum) {
      const playable = arr.filter(t => t.video_url)
      const pool = playable.length ? playable : arr
      pool.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a._pos ?? 999) - (b._pos ?? 999))
      const best = pool[0]
      if (best) { albumTop.set(aid, best.id); trackById.set(best.id, best) }
    }
  }

  const artistTop = new Map<number, number>()
  if (artistIds.length) {
    const { data } = await sb.from('tracks').select(`${TSEL}, artist_id`)
      .in('artist_id', artistIds).not('video_url', 'is', null)
      .order('score', { ascending: false, nullsFirst: false }).limit(artistIds.length * 10)
    for (const t of (data || []) as any[]) {
      if (!artistTop.has(t.artist_id)) { artistTop.set(t.artist_id, t.id); trackById.set(t.id, t) }
    }
  }

  const out: any[] = []; const seen = new Set<number>()
  for (const e of items) {
    if (e.entity_id == null) continue
    const tid = e.type === 'track' ? e.entity_id : e.type === 'album' ? albumTop.get(e.entity_id) : e.type === 'artist' ? artistTop.get(e.entity_id) : null
    if (!tid || seen.has(tid)) continue
    const t = trackById.get(tid); if (!t) continue
    const yt = t.video_url?.match?.(YT_PLAY)?.[1]; if (!yt) continue
    seen.add(tid)
    const a = Array.isArray(t.artist) ? t.artist[0] : t.artist
    out.push({
      source: 'youtube', key: `topas:track:${tid}`,
      title: t.title, artist_name: a?.name,
      cover_url: t.cover_url || `https://img.youtube.com/vi/${yt}/mqdefault.jpg`,
      embed_url: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      source_url: t.video_url,
      db_track: { id: tid, slug: t.slug, artist_slug: a?.slug },
    })
  }
  return out
}

// ── Protingas free-text topo parseris ───────────────────────────────────────
// Supranta narių rašytą struktūrą: paryškinta antraštė „N. Atlikėjas – Pavadinimas
// (žanrai)" + nuoroda į albumą/dainą + aprašymo pastraipa(-os). Atskiria įžangą
// (prieš #1) ir pabaigą (pvz. „Garbingi paminėjimai"). Grąžina intro/outro HTML
// (formatui išsaugoti) + entries su aprašymu, žanrais, legacy nuoroda.

export type ParsedTopasEntry = {
  rank: number; artist: string; title: string; genres: string[]
  description: string; legacyType: 'album' | 'track' | null; legacyId: number | null
}
export type ParsedTopas = { intro: string; outro: string; entries: ParsedTopasEntry[] }

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
}
const stripTags = (s: string) => decodeEntities((s || '').replace(/<[^>]+>/g, '')).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()

// Word/CKEditor prozos valymas: pašalina tuščias pastraipas (didžiuliai tarpai),
// MS-Office inline šiukšles, dvigubus <br>. Palieka švarų tekstą + nuorodas.
function cleanProseHtml(h: string): string {
  return (h || '')
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\sstyle="[^"]*float[^"]*"/gi, '')
    .replace(/(\s*<hr\s*\/?>\s*)+$/gi, '')
    .replace(/<p[^>]*>(?:[\s ]|&nbsp;|<br\s*\/?>|<\/?(?:span|strong|b|em|i|u)[^>]*>)*<\/p>/gi, '')
    .replace(/(\s*<br\s*\/?>\s*){2,}/gi, '<br>')
    .replace(/\sstyle="[^"]*mso[^"]*"/gi, '')
    .replace(/\sclass="MsoNormal"/gi, '')
    .replace(/\slang="[^"]*"/gi, '')
    .trim()
}

export function parseTopasArticle(content: string): ParsedTopas {
  if (!content) return { intro: '', outro: '', entries: [] }
  const c = content
  type Head = ParsedTopasEntry & { hStart: number; hEnd: number }
  const heads: Head[] = []
  const re = /<strong[^>]*>([\s\S]*?)<\/strong>([\s\S]{0,400}?)(?=<p|<img|<\/p>)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(c))) {
    const inner = stripTags(m[1])
    const mm = inner.match(/^(\d{1,3})\.\s*(.+?)\s[–—]\s(.+)$/)
    if (!mm) continue
    const rank = parseInt(mm[1], 10)
    if (heads.some(h => h.rank === rank)) continue
    const tail = m[2] || ''
    const gm = tail.match(/<em[^>]*>([\s\S]*?)<\/em>/i)
    let genres: string[] = []
    if (gm) {
      const g = stripTags(gm[1]).replace(/^\(+|\)+$/g, '').trim()
      genres = g.split(/[,/]/).map(x => x.trim()).filter(Boolean)
    }
    // artimiausia <a href> prieš antraštę (legacy nuoroda)
    const pre = c.slice(Math.max(0, m.index - 400), m.index)
    const hrefs = [...pre.matchAll(/href="([^"]*?(albumas|daina|grupe)[\/-][^"]*?(\d+)[^"]*?)"/gi)]
    let legacyType: 'album' | 'track' | null = null; let legacyId: number | null = null
    if (hrefs.length) {
      const last = hrefs[hrefs.length - 1]
      legacyType = last[2] === 'albumas' ? 'album' : last[2] === 'daina' ? 'track' : null
      legacyId = parseInt(last[3], 10) || null
    }
    heads.push({ rank, artist: mm[2].trim(), title: mm[3].trim(), genres, description: '', legacyType, legacyId, hStart: m.index, hEnd: re.lastIndex })
  }
  if (!heads.length) return { intro: stripTags(c), outro: '', entries: [] }

  // outro žymeklis (pvz. „Garbingų paminėjimų") — IEŠKOM TIK PO paskutinės antraštės
  // (žymeklis dažnai paminimas ir įžangoje, tad globalus match'as klaidingas).
  const lastHeadEnd = heads[heads.length - 1].hEnd
  const omTail = c.slice(lastHeadEnd).match(/garbing\w*\s+paminėjim/i)
  const omIdx = omTail && omTail.index != null ? lastHeadEnd + omTail.index : -1

  // pastraipos pradžios snap'as (švarus HTML pjūvis)
  const pStartBefore = (idx: number) => { const i = c.lastIndexOf('<p', idx); return i >= 0 ? i : idx }

  const entries: ParsedTopasEntry[] = heads.map((h, i) => {
    let bodyEnd = i + 1 < heads.length ? pStartBefore(heads[i + 1].hStart) : (omIdx >= 0 ? pStartBefore(omIdx) : c.length)
    const desc = stripTags(c.slice(h.hEnd, bodyEnd))
    return { rank: h.rank, artist: h.artist, title: h.title, genres: h.genres, description: desc, legacyType: h.legacyType, legacyId: h.legacyId }
  })

  const intro = cleanProseHtml(c.slice(0, pStartBefore(heads[0].hStart)))
  const outro = omIdx >= 0 ? cleanProseHtml(c.slice(pStartBefore(omIdx))) : ''
  return { intro, outro, entries }
}

// Sukuria ghost entitetą vienam įrašui (artist + daina arba tik artist).
export async function createEntityForEntry(
  sb: Sb, artist: string, title: string | null, isArtist: boolean,
): Promise<{ type: 'track' | 'artist'; entity_id: number; entity_slug: string | null; image_url: string | null }> {
  if (isArtist || !title) {
    const aid = await findOrCreateArtist(sb, artist, null)
    const { data } = await sb.from('artists').select('slug, cover_image_url').eq('id', aid).maybeSingle()
    return { type: 'artist', entity_id: aid, entity_slug: data?.slug || null, image_url: data?.cover_image_url || null }
  }
  const aid = await findOrCreateArtist(sb, artist, null)
  const tid = await createTrackForArtist(sb, aid, title)
  const { data } = await sb.from('tracks').select('slug, cover_url, video_url, artists:artist_id(cover_image_url)').eq('id', tid).maybeSingle()
  const ac = Array.isArray(data?.artists) ? data?.artists[0]?.cover_image_url : (data?.artists as any)?.cover_image_url
  return { type: 'track', entity_id: tid, entity_slug: data?.slug || null, image_url: ytThumb(data?.video_url) || data?.cover_url || ac || null }
}

// Vieno įrašo (pagal rank) susiejimas su konkrečiu entitetu iš paieškos.
export async function linkTopasEntry(
  sb: Sb, list: any[], rank: number, hit: { type: 'track' | 'artist' | 'album'; id: number; slug: string | null; title: string; artist: string | null; image_url: string | null },
): Promise<any[]> {
  return list.map((e: any) => {
    const er = e?.rank ?? e?.position
    if (er !== rank) return e
    return {
      rank, type: hit.type,
      entity_id: hit.id, entity_slug: hit.slug,
      title: hit.title, artist: hit.artist,
      image_url: hit.image_url,
      comment: e?.comment ?? e?.description ?? null,
      rating: e?.rating ?? null,
      match_state: 'matched',
    }
  })
}
