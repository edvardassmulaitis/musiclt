'use client'

import { useState, useEffect } from 'react'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'
import { type ArtistFormData, type Break } from './ArtistForm'
import {
  cleanArtistName, isValidArtistName, extractFieldNested, parseBandMembers,
  parseInfoboxGenres, mapGenres, findCountry, parseYearsActive,
  QID_COUNTRY, TXT_COUNTRY, SOCIAL_MAP, SKIP_WEB, GROUP_QIDS,
  type BandMember,
  initializeConstants,
} from '@/lib/wiki-parser'

type Props = { onImport: (data: Partial<ArtistFormData>) => void; initialSearch?: string }

const ALL_SUBSTYLES = Object.values(SUBSTYLES).flat()

// Initialize wiki-parser constants once
initializeConstants(COUNTRIES, SUBSTYLES)

const MONTHS_LT = ['sausio','vasario','kovo','balandžio','gegužės','birželio',
                   'liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']

function fmtDate(year?: string, month?: string, day?: string): string {
  const parts: string[] = []
  if (year) parts.push(`${year}`)
  if (month) { const m = parseInt(month); if (m >= 1 && m <= 12) parts.push(MONTHS_LT[m-1]) }
  if (day) parts.push(`${day} d.`)
  return parts.join(' ')
}


type MemberFullData = {
  avatar: string
  country: string
  yearStart: string; yearEnd: string
  birthYear: string; birthMonth: string; birthDay: string
  deathYear: string; deathMonth: string; deathDay: string
  gender: 'male'|'female'|''
  description: string
  genre: string
  substyles: string[]
  website: string
  facebook: string; instagram: string; twitter: string
  spotify: string; youtube: string; soundcloud: string
  tiktok: string; bandcamp: string
}


async function fetchGroupFullData(wikiTitle: string): Promise<Partial<MemberFullData> & { avatar: string }> {
  const empty = { avatar: '', country: '', yearStart: '', yearEnd: '', description: '', genre: '', substyles: [] as string[], website: '',
    facebook: '', instagram: '', twitter: '', spotify: '', youtube: '', soundcloud: '', tiktok: '', bandcamp: '' }
  try {
    const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
    if (!sumRes.ok) return empty
    const sum = await sumRes.json()
    let avatar = ''
    const wikiImgUrl = sum.thumbnail?.source || ''
    if (wikiImgUrl) {
      try {
        const ir = await fetch('/api/fetch-image', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: wikiImgUrl }) })
        if (ir.ok) { const d = await ir.json(); avatar = d.url || wikiImgUrl }
      } catch { avatar = wikiImgUrl }
    }
    // Aprašymas
    let finalDesc = '' // aprašymo generavimas išjungtas testavimui
    const descPromise = Promise.resolve()
    // Wikidata
    const ppRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageprops&format=json&origin=*`)
    const wdId: string = (Object.values((await ppRes.json()).query?.pages||{})[0] as any)?.pageprops?.wikibase_item || ''
    if (!wdId) { await descPromise; return { ...empty, avatar, description: finalDesc } }
    const claims = (await (await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wdId}&format=json&origin=*&languages=en&props=claims`
    )).json()).entities?.[wdId]?.claims || {}
    const first = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value
    const all   = (p: string): any[] => (claims[p]||[]).map((x:any)=>x.mainsnak?.datavalue?.value)
    const parseDate = (t: string) => { const [dp] = t.replace(/^\+/,'').split('T'); const [y] = dp.split('-'); return String(parseInt(y)||'') }
    let country = ''
    for (const p of ['P495','P17','P159']) {
      const qid = first(p)?.id
      if (qid && QID_COUNTRY[qid]) { country = QID_COUNTRY[qid]; break }
    }
    let website = ''
    for (const v of all('P856')) {
      if (typeof v==='string' && !SKIP_WEB.some(d=>v.includes(d))) { website=v; break }
    }
    const socials: Record<string,string> = {}
    for (const [prop,cfg] of Object.entries(SOCIAL_MAP)) {
      const v = first(prop)
      if (typeof v==='string' && v) socials[cfg.key as string] = cfg.url(v)
    }
    let genre = '', substyles: string[] = []
    const genreQids = all('P136').map((v:any)=>v?.id).filter(Boolean).slice(0,8)
    if (genreQids.length > 0) {
      try {
        const glData = await (await fetch(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${genreQids.join('|')}&format=json&origin=*&languages=en&props=labels`
        )).json()
        const labels: string[] = genreQids.map((id:string)=>glData.entities?.[id]?.labels?.en?.value).filter(Boolean)
        const mapped = mapGenres(labels)
        genre = mapped.genre; substyles = mapped.substyles
      } catch {}
    }
    let yearStart = '', yearEnd = ''
    const yas = first('P2031')?.time; if (yas) yearStart = parseDate(yas)
    const yae = first('P2032')?.time; if (yae) yearEnd = parseDate(yae)
    if (!yearStart) { const t = first('P571')?.time; if (t) yearStart = parseDate(t) }
    if (!yearEnd)   { const t = first('P576')?.time; if (t) yearEnd   = parseDate(t) }
    await descPromise
    return {
      avatar, country, yearStart, yearEnd, description: finalDesc, genre, substyles, website,
      facebook: socials.facebook||'', instagram: socials.instagram||'', twitter: socials.twitter||'',
      spotify: socials.spotify||'', youtube: socials.youtube||'', soundcloud: socials.soundcloud||'',
      tiktok: socials.tiktok||'', bandcamp: socials.bandcamp||'',
    }
  } catch { return empty }
}

async function fetchMemberFullData(wikiTitle: string): Promise<MemberFullData> {
  const empty: MemberFullData = {
    avatar:'', country:'', yearStart:'', yearEnd:'',
    birthYear:'', birthMonth:'', birthDay:'',
    deathYear:'', deathMonth:'', deathDay:'', gender:'',
    description:'', genre:'', substyles:[], website:'',
    facebook:'', instagram:'', twitter:'', spotify:'',
    youtube:'', soundcloud:'', tiktok:'', bandcamp:'',
  }
  try {
    // 1. Avatar + description
    const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`)
    if (!sumRes.ok) return empty
    const sum = await sumRes.json()
    const wikiTitleForDesc = wikiTitle

    // Upload avatar
    let avatar = ''
    const wikiImgUrl = sum.thumbnail?.source || ''
    if (wikiImgUrl) {
      try {
        const ir = await fetch('/api/fetch-image', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: wikiImgUrl }) })
        if (ir.ok) { const d = await ir.json(); avatar = d.url || wikiImgUrl }
      } catch { avatar = wikiImgUrl }
    }

    // 2. Generuojame aprašymą su Claude (lygiagrečiai su Wikidata fetch)
    let finalDesc = '' // aprašymo generavimas išjungtas testavimui
    const descPromise = Promise.resolve()

    // 3. Wikidata
    const ppRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageprops&format=json&origin=*`)
    const wdId: string = (Object.values((await ppRes.json()).query?.pages||{})[0] as any)?.pageprops?.wikibase_item || ''
    if (!wdId) return { ...empty, avatar, description: finalDesc }

    const claims = (await (await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wdId}&format=json&origin=*&languages=en&props=claims`
    )).json()).entities?.[wdId]?.claims || {}

    const first = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value
    const all   = (p: string): any[] => (claims[p]||[]).map((x:any)=>x.mainsnak?.datavalue?.value)

    const parseDate = (t: string) => {
      const [dp] = t.replace(/^\+/,'').split('T')
      const [y,m,d] = dp.split('-')
      return { year: parseInt(y)?String(parseInt(y)):'', month: parseInt(m)?String(parseInt(m)):'', day: parseInt(d)?String(parseInt(d)):'' }
    }

    const bd = first('P569')?.time; const bdp = bd ? parseDate(bd) : { year:'', month:'', day:'' }
    const dd = first('P570')?.time; const ddp = dd ? parseDate(dd) : { year:'', month:'', day:'' }
    const gId = first('P21')?.id
    const gender: 'male'|'female'|'' = gId==='Q6581097' ? 'male' : gId==='Q6581072' ? 'female' : ''

    let country = ''
    for (const p of ['P27','P19']) {
      const qid = first(p)?.id
      if (qid && QID_COUNTRY[qid]) { country = QID_COUNTRY[qid]; break }
    }

    let website = ''
    for (const v of all('P856')) {
      if (typeof v==='string' && !SKIP_WEB.some(d=>v.includes(d))) { website=v; break }
    }

    const socials: Record<string,string> = {}
    for (const [prop,cfg] of Object.entries(SOCIAL_MAP)) {
      const v = first(prop)
      if (typeof v==='string' && v) socials[cfg.key as string] = cfg.url(v)
    }

    // Žanrai
    let genre = '', substyles: string[] = []
    const genreQids = all('P136').map((v:any)=>v?.id).filter(Boolean).slice(0,8)
    if (genreQids.length > 0) {
      try {
        const glData = await (await fetch(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${genreQids.join('|')}&format=json&origin=*&languages=en&props=labels`
        )).json()
        const labels: string[] = genreQids.map((id:string)=>glData.entities?.[id]?.labels?.en?.value).filter(Boolean)
        const mapped = mapGenres(labels)
        genre = mapped.genre; substyles = mapped.substyles
      } catch {}
    }



    // Laukiame aprašymo
    await descPromise

    // Veiklos metai
    let yearStart = '', yearEnd = ''
    const yas = first('P2031')?.time; if (yas) yearStart = parseDate(yas).year
    const yae = first('P2032')?.time; if (yae) yearEnd = parseDate(yae).year
    if (!yearStart) { const t = first('P571')?.time; if (t) yearStart = parseDate(t).year }
    if (!yearEnd)   { const t = first('P576')?.time; if (t) yearEnd   = parseDate(t).year }

    return {
      avatar, description: finalDesc, country, gender,
      yearStart, yearEnd,
      birthYear: bdp.year, birthMonth: bdp.month, birthDay: bdp.day,
      deathYear: ddp.year, deathMonth: ddp.month, deathDay: ddp.day,
      website, genre, substyles,
      facebook: socials.facebook||'', instagram: socials.instagram||'',
      twitter: socials.twitter||'', spotify: socials.spotify||'',
      youtube: socials.youtube||'', soundcloud: socials.soundcloud||'',
      tiktok: socials.tiktok||'', bandcamp: socials.bandcamp||'',
    }
  } catch { return empty }
}

async function checkMemberInDB(name: string): Promise<{ id: number; slug: string } | null> {
  try {
    const res = await fetch(`/api/artists?search=${encodeURIComponent(name)}&limit=5`)
    if (!res.ok) return null
    const data = await res.json()
    const artists: any[] = data.artists || []
    const match = artists.find(a =>
      a.name.toLowerCase() === name.toLowerCase() ||
      a.name.toLowerCase().replace(/\s+/g,'') === name.toLowerCase().replace(/\s+/g,'')
    )
    return match ? { id: match.id, slug: match.slug } : null
  } catch { return null }
}

const GENRE_RULES: [string, string[]][] = [
  ['Sunkioji muzika',           ['metal','heavy metal','thrash','doom','black metal','grindcore','metalcore','death metal']],
  ['Roko muzika',               ['rock','punk','grunge','new wave','britpop','alternative rock','indie rock','post-punk','hard rock','post-rock','progressive rock']],
  ['Elektroninė, šokių muzika', ['electronic','house','techno','trance','edm','electro','disco','dance','drum and bass','dubstep','electronica','deep house','tech house','synth-pop']],
  ["Hip-hop'o muzika",          ['hip hop','hip-hop','rap','trap']],
  ['Pop, R&B muzika',           ['pop','soul','funk','r&b','rnb','rhythm and blues']],
  ['Rimtoji muzika',            ['jazz','blues','classical','gospel','swing','big band']],
  ['Alternatyvioji muzika',     ['alternative','indie','folk','experimental','ambient','emo','shoegaze']],
  ['Kitų stilių muzika',        ['reggae','country','latin','world music','ethnic']],
]

// mapGenres + parseInfoboxGenres importuoti iš @/lib/wiki-parser

function parseWDDate(t: string): { year: string; month: string; day: string } {
  // Wikidata time: "+2003-05-12T00:00:00Z" → year/month/day strings
  const m = (t || '').match(/^[+-]?(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { year: '', month: '', day: '' }
  const y = m[1], mo = m[2], d = m[3]
  return {
    year: y || '',
    month: mo === '00' ? '' : String(parseInt(mo, 10)),
    day: d === '00' ? '' : String(parseInt(d, 10)),
  }
}


function WikipediaImportCore({ onImport, initialSearch }: Props) {
  const [url, setUrl] = useState(initialSearch && !initialSearch.includes('wikipedia.org') ? initialSearch : '')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Partial<ArtistFormData> | null>(null)
  const [similarArtists, setSimilarArtists] = useState<{id:string;name:string;slug:string;type:string;country:string;cover_image_url:string|null}[]>([])
  const [translateOk, setTranslateOk] = useState(false)
  const [members, setMembers] = useState<BandMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [wpResults, setWpResults] = useState<{title:string;description:string}[]>([])
  const [ytResults, setYtResults] = useState<{title:string;description:string;ytData:any}[]>([])
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout>|null>(null)
  const [activeTab, setActiveTab] = useState<'wikipedia'|'youtube'>('wikipedia')
  const [wpLoading, setWpLoading] = useState(false)
  const [ytLoading, setYtLoading] = useState(false)
  const [ytError, setYtError] = useState('')

  const MUSIC_RE = /\b(band|musician|singer|rapper|artist|group|duo|trio|record|album|guitarist|drummer|bassist|vocalist|DJ|producer|songwriter|rock|pop|hip.hop|jazz|metal|punk|electronic|music)/i
  const ALBUM_RE = /\b(album|discography|soundtrack|compilation|EP|LP|single|filmography|disambiguation)/i
  const PERSON_BAND_RE = /\b(band|artist|singer|rapper|musician|group|duo|trio|vocalist|guitarist|drummer|DJ|producer|songwriter)/i

  const checkDuplicates = async (name: string) => {
    if (!name?.trim()) { setSimilarArtists([]); return }
    try {
      const res = await fetch(`/api/artists?check=${encodeURIComponent(name.trim())}`)
      const data = await res.json()
      setSimilarArtists(Array.isArray(data) ? data : [])
    } catch { setSimilarArtists([]) }
  }

  const fetchYt = (q: string) => {
    if (!q.trim()) return
    setYtLoading(true); setYtError('')
    fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setYtError(data.error.includes('quota') ? 'YouTube API dienos limitas pasiektas' : data.error); return }
        const results = (data.results || []).slice(0, 5).map((v: any) => ({ title: v.name, description: (v.description || 'YouTube kanalas').slice(0, 100), ytData: v }))
        setYtResults(results)
        if (!results.length) setYtError('Nieko nerasta')
      }).catch(e => setYtError(e.message)).finally(() => setYtLoading(false))
  }



  const runSearch = (q: string) => {
    if (q.trim().length < 2) {
      setWpResults([]); setYtResults([])
      setYtError('')
      return
    }
    // Wikipedia — du lygiagrečius search: vieną originalų, kitą su "band OR singer OR musician"
    // Tai užtikrina, kad muzikos rezultatai visada atsiras net jei originalus query jų nepatraukia
    setWpLoading(true)
    const baseUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srprop=snippet&format=json&origin=*&srlimit=12'
    const musicBias = `${q} band OR singer OR musician`
    Promise.all([
      fetch(`${baseUrl}&srsearch=${encodeURIComponent(q)}`).then(r => r.json()),
      fetch(`${baseUrl}&srsearch=${encodeURIComponent(musicBias)}`).then(r => r.json()),
    ]).then(([data1, data2]) => {
        const raw1 = (data1?.query?.search || []) as { title: string; snippet: string }[]
        const raw2 = (data2?.query?.search || []) as { title: string; snippet: string }[]
        // Sujungiam ir deduplicuojam (pirma query turi pirmenybę jei dubliuojasi)
        const seen = new Set<string>()
        const merged: { title: string; snippet: string }[] = []
        for (const r of [...raw1, ...raw2]) {
          if (!seen.has(r.title)) { seen.add(r.title); merged.push(r) }
        }
        const qLow = q.toLowerCase()
        // Muzikos tag'as pavadinime — "(band)", "(singer)", "(musician)" ir pan.
        const TITLE_MUSIC_TAG = /\(\s*(band|singer|rapper|musician|group|duo|trio|vocalist|guitarist|drummer|DJ|producer|songwriter|entertainer)\s*\)/i
        const all = merged
          .map(r => ({ title: r.title, description: r.snippet.replace(/<[^>]+>/g, '').slice(0, 120) }))
          // Filtruojam albumus/diskografijas pagal PAVADINIMĄ (pvz "Blackout (Scorpions album)")
          // Bet nefiltruojam jei pavadinime yra muzikos tag'as (pvz "Scorpions (band)")
          .filter(r => TITLE_MUSIC_TAG.test(r.title) || !ALBUM_RE.test(r.title))
        // Prioritetai: 1) tikslus + muzikos tag, 2) tikslus + muzikos aprašymas, 3) tikslus kiti,
        //              4) band/singer tag, 5) muzikos aprašymas, 6) kiti
        const isExact = (r: typeof all[0]) => r.title.toLowerCase() === qLow || r.title.toLowerCase().startsWith(qLow + ' (')
        const isMusicTitle = (r: typeof all[0]) => TITLE_MUSIC_TAG.test(r.title) || PERSON_BAND_RE.test(r.title)
        const isMusicDesc = (r: typeof all[0]) => MUSIC_RE.test(r.description) || MUSIC_RE.test(r.title)
        const exactMusic = all.filter(r => isExact(r) && isMusicTitle(r))
        const exactMusicD = all.filter(r => isExact(r) && !isMusicTitle(r) && isMusicDesc(r))
        const exactOther = all.filter(r => isExact(r) && !isMusicTitle(r) && !isMusicDesc(r))
        const rest = all.filter(r => !isExact(r))
        const withTag = rest.filter(r => isMusicTitle(r))
        const musicD = rest.filter(r => !isMusicTitle(r) && isMusicDesc(r))
        const others = rest.filter(r => !isMusicTitle(r) && !isMusicDesc(r))
        setWpResults([...exactMusic, ...exactMusicD, ...exactOther, ...withTag, ...musicD, ...others].slice(0, 8))
      }).catch(() => {}).finally(() => setWpLoading(false))
    // YouTube - tik paspaudus tab (žr. onTabClick)
  }
  useEffect(() => {
    if (!initialSearch || initialSearch.trim().length < 2) return
    if (initialSearch.includes('wikipedia.org')) return
    runSearch(initialSearch.trim())
  }, [initialSearch])

  const isUrl = (s: string) => /wikipedia\.org\/wiki\//.test(s)

  const handleInputChange = (val: string) => {
    setUrl(val)
    setError('')
    if (isUrl(val)) { setWpResults([]); setYtResults([]); return }
    if (searchTimer) clearTimeout(searchTimer)
    if (val.trim().length < 2) { setWpResults([]); setYtResults([]); return }
    const t = setTimeout(() => runSearch(val.trim()), 350)
    setSearchTimer(t)
  }

    const selectResult = (title: string, source?: string, ytData?: any) => {
    if (source === 'youtube' && ytData) {
      setUrl(title)
      const { genre, substyles } = ytData.genres?.length
        ? mapGenres(ytData.genres)
        : { genre: '', substyles: [] }
      const ytCountry = ytData.country && COUNTRIES.includes(ytData.country) ? ytData.country : ''
      // YouTube: rodome preview su galimybe generuoti aprašymą
      setPreview({
        name: ytData.name || title,
        avatar: ytData.thumbnail || '',
        type: 'person',
        description: '',
        rawDescription: ytData.rawDescription || ytData.description || '',
        youtube: ytData.url || '',
        facebook: ytData.facebook || '',
        instagram: ytData.instagram || '',
        twitter: ytData.twitter || '',
        country: ytCountry,
        genre,
        substyles,
        members: [], groups: [], wikiLinks: [], links: [],
        facebook2: '', spotify: '', soundcloud: '', tiktok: '', bandcamp: '',
        born: '', died: '', activeFrom: '', activeTo: '', breaks: [],
      } as any)
      checkDuplicates(ytData.name || title)
      return
    }
    if (source === 'youtube') {
      // Be ytData - bandome Wikipedia
      const slug = encodeURIComponent(title.replace(/ /g, '_'))
      const newUrl = `https://en.wikipedia.org/wiki/${slug}`
      setUrl(newUrl)
      setTimeout(() => go(newUrl), 50)
      return
    }
    const slug = encodeURIComponent(title.replace(/ /g, '_'))
    const newUrl = `https://en.wikipedia.org/wiki/${slug}`
    setUrl(newUrl)
    setTimeout(() => go(newUrl), 50)
  }

  const extractSlug = (u: string) => {
    const m = u.match(/wikipedia\.org\/wiki\/(.+?)(?:\?|#|$)/)
    return m ? decodeURIComponent(m[1]) : u.trim().replace(/ /g, '_')
  }

  const go = async (overrideUrl?: string) => {
    setError(''); setPreview(null); setMembers([])
    const s = extractSlug(overrideUrl ?? url)
    if (!s) { setError('Įveskite atlikėjo pavadinimą arba Wikipedia URL'); return }
    setLoading(true)
    try {
      setStep('Kraunama Wikipedia...')
      const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s)}`)
      if (!sumRes.ok) throw new Error(`Puslapis nerastas: ${s}`)
      const sum = await sumRes.json()
      const avatarSrcUrl = sum.thumbnail?.source || ''

      let description = ''
      setStep('Skaitomas infobox...')
      let infoboxWebsite = '', infoboxYearsRaw = '', infoboxGenres: string[] | null = null
      let parsedMembers: BandMember[] = []
      try {
        const wtRes = await (await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(s)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`
        )).json()
        const pages = wtRes.query?.pages || {}
        const firstPage = Object.values(pages)[0] as any
        const rawWikitext = firstPage?.['revisions']?.[0]?.['slots']?.['main']?.['*']
          || firstPage?.['revisions']?.[0]?.['*']
          || (await (await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(s)}&prop=wikitext&format=json&origin=*`
          )).json()).parse?.wikitext?.['*'] || ''
        infoboxGenres = parseInfoboxGenres(rawWikitext)
        const wsM = rawWikitext.match(/\|\s*website\s*=\s*(?:\{\{[Uu][Rr][Ll]\|([^|}]+)[^}]*\}\}|(https?:\/\/[^\s<|{}\[\]\n]+))/i)
        if (wsM) {
          const raw = (wsM[1] || wsM[2] || '').trim().replace(/\/*$/, '')
          if (raw) infoboxWebsite = raw.startsWith('http') ? raw : `https://${raw}`
        }
        const yaM = rawWikitext.match(/\|\s*years[_ ]active\s*=\s*([^\n|<]+)/i)
        if (yaM) infoboxYearsRaw = yaM[1].trim()
        parsedMembers = parseBandMembers(rawWikitext)
      } catch {}

      try {
        const wikiLang = url.includes('lt.wikipedia') ? 'lt' : 'en'
        const htmlRes = await fetch(
          `https://${wikiLang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(s)}&prop=text&format=json&origin=*`
        )
        const htmlData = await htmlRes.json()
        const htmlContent: string = htmlData.parse?.text?.['*'] || ''
        const htmlMembers: BandMember[] = []

        const parseSection = (labelRe: RegExp, isCurrent: boolean) => {
          const m = htmlContent.match(labelRe)
          if (!m) return
          const links = [...m[1].matchAll(/href="\/wiki\/([^"#]+)"[^>]*>([^<]+)<\/a>/g)]
          links.forEach(lm => {
            const wikiTitle = decodeURIComponent(lm[1])
            const name = (lm[2] || '').trim()
            if (!name || name.includes('See also') || name.includes('Early members') || name.length < 2) return
            const cleanName = cleanArtistName(name)
            if (!cleanName || !isValidArtistName(cleanName)) return
            htmlMembers.push({ name: cleanName, wikiTitle, isCurrent })
          })
        }

        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Members\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, true)
        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Past members\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, false)
        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Current members\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, true)
        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Nariai\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, true)
        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Dabartiniai nariai\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, true)
        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Buvę nariai\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, false)
        parseSection(/>[^<]*ariai[^<]*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, true)

        console.log('[WikipediaImport] wikitext members:', parsedMembers.map(m=>m.name))
        console.log('[WikipediaImport] html members:', htmlMembers.map(m=>m.name))
        if (htmlMembers.length > parsedMembers.length) {
          parsedMembers = htmlMembers
          console.log('[WikipediaImport] using HTML members')
        }
      } catch (e) {
        console.warn('[WikipediaImport] HTML member parsing error:', e)
      }

      setStep('Jungiamasi prie Wikidata...')
      const ppRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(s)}&prop=pageprops&format=json&origin=*`)
      const wdId: string = (Object.values((await ppRes.json()).query?.pages || {})[0] as any)?.pageprops?.wikibase_item || ''

      let type: 'group'|'solo' = 'solo'
      let country = ''
      let wdGenres: string[] = []
      let yearStart = '', yearEnd = '', breaks: Break[] = []
      let birthYear = '', birthMonth = '', birthDay = ''
      let deathYear = '', deathMonth = '', deathDay = ''
      let gender: 'male'|'female'|'' = ''
      let website = infoboxWebsite
      const socials: Partial<ArtistFormData> = {}

      if (infoboxYearsRaw) {
        const ya = parseYearsActive(infoboxYearsRaw)
        yearStart = ya.yearStart; yearEnd = ya.yearEnd; breaks = ya.breaks
      }

      if (wdId) {
        setStep('Skaitoma Wikidata...')
        const claims = (await (await fetch(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wdId}&format=json&origin=*&languages=en&props=claims`
        )).json()).entities?.[wdId]?.claims || {}

        const first = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value
        const all   = (p: string): any[] => (claims[p]||[]).map((x:any)=>x.mainsnak?.datavalue?.value)

        const instances: string[] = all('P31').map((v:any)=>v?.id).filter(Boolean)
        const hasBirth = !!claims['P569']
        type = (hasBirth || instances.includes('Q5')) ? 'solo' : instances.some(q=>GROUP_QIDS.has(q)) ? 'group' : 'solo'
        if (parsedMembers.length > 0) type = 'group'

        const bd=first('P569')?.time; if(bd){const d=parseWDDate(bd);birthYear=d.year;birthMonth=d.month;birthDay=d.day;type='solo'}
        const dd=first('P570')?.time; if(dd){const d=parseWDDate(dd);deathYear=d.year;deathMonth=d.month;deathDay=d.day}

        if (!yearStart) {
          const yas=first('P2031')?.time; if(yas) yearStart=parseWDDate(yas).year
          const yae=first('P2032')?.time; if(yae) yearEnd=parseWDDate(yae).year
          if(!yearStart){const t=first('P571')?.time;if(t)yearStart=parseWDDate(t).year}
          if(!yearEnd){const t=first('P576')?.time;if(t)yearEnd=parseWDDate(t).year}
        }

        const gId=first('P21')?.id
        if(gId==='Q6581097') gender='male'; else if(gId==='Q6581072') gender='female'

        for(const p of ['P27','P495','P17']){
          const qid=first(p)?.id
          if(qid && QID_COUNTRY[qid]){country=QID_COUNTRY[qid];break}
        }
        if(!country) country=findCountry((sum.description||'')+' '+(sum.extract?.substring(0,500)||''))

        if(!website){
          for(const v of all('P856')){
            if(typeof v==='string' && !SKIP_WEB.some(d=>v.includes(d))){website=v;break}
          }
        }

        for(const [prop,cfg] of Object.entries(SOCIAL_MAP)){
          const v=first(prop)
          if(typeof v==='string' && v)(socials as any)[cfg.key]=cfg.url(v)
        }

        // Grupės kurioms priklauso (P361 = part of, P463 = member of)
        if (type === 'solo') {
          setStep('Ieškoma grupių...')
          const toQid = (v: any): string | null => {
            const raw = v?.id ?? v?.['numeric-id']
            if (!raw) return null
            const s = String(raw)
            return s.startsWith('Q') ? s : `Q${s}`
          }
          const p361  = all('P361') .map(toQid).filter(Boolean) as string[]
          const p463  = all('P463') .map(toQid).filter(Boolean) as string[]
          const p1716 = all('P1716').map(toQid).filter(Boolean) as string[]
          console.log('[Groups] P361:', p361, 'P463:', p463, 'P1716:', p1716)
          const groupQids = [...new Set([...p361, ...p463, ...p1716])].slice(0, 6)
          if (groupQids.length > 0) {
            try {
              const gData = await (await fetch(
                `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${groupQids.join('|')}&format=json&origin=*&languages=en&props=labels%7Csitelinks`
              )).json()
              console.log('[Groups] raw gData sample:', JSON.stringify(Object.values(gData.entities||{})[0]).substring(0,300))
              const foundGroups: { id: number | null; name: string; yearFrom: string; yearTo: string; avatar: string; wikiTitle: string }[] = []
              for (const qid of groupQids) {
                const ent = gData.entities?.[qid]
                if (!ent) { console.log('[Groups] no entity for', qid); continue }
                const rawName = ent.labels?.en?.value
                  || ent.labels?.['en-gb']?.value
                  || ent.sitelinks?.enwiki?.title
                if (!rawName) { console.log('[Groups] no label for', qid, ent.labels); continue }
                // Pašalinam disambiguacijos priedus: "(band)", "(group)", "(musician)" ir pan.
                const wikiTitle = ent.sitelinks?.enwiki?.title || rawName
                const gName = rawName.replace(/\s*\([^)]+\)\s*$/, '').trim()
                console.log('[Groups] checking:', qid, gName)
                // Validate name is not garbage
                if (!isValidArtistName(gName)) { console.log('[Groups] invalid name, skipped:', gName); continue }
                // Praleisti jei tai šalis, miestas ar pan. (pagal label)
                const skipWords = ['country','city','state','government','organization','award']
                if (skipWords.some(w => gName.toLowerCase().includes(w))) { console.log('[Groups] skipped:', gName); continue }
                // Ieškome DB
                const dbRes = await fetch(`/api/artists?search=${encodeURIComponent(gName)}&limit=3`)
                if (dbRes.ok) {
                  const dbData = await dbRes.json()
                  const arr: any[] = Array.isArray(dbData) ? dbData
                    : Array.isArray(dbData?.artists) ? dbData.artists
                    : Array.isArray(dbData?.data) ? dbData.data : []
                  const match = arr.find((a:any) => a.name?.toLowerCase() === gName.toLowerCase())
                  if (match) {
                    foundGroups.push({ id: match.id, name: match.name, yearFrom: '', yearTo: '', avatar: match.cover_image_url || match.avatar || '', wikiTitle })
                  } else {
                    foundGroups.push({ id: null, name: gName, yearFrom: '', yearTo: '', avatar: '', wikiTitle })
                    console.log(`[Groups] Grupė nerasta DB, bus sukurta išsaugant: ${gName}`)
                  }
                }
              }
              // Fetch pilni duomenys grupėms (kaip nariai)
              await Promise.all(foundGroups.map(async (g) => {
                if (g.wikiTitle) {
                  const fullData = await fetchGroupFullData(g.wikiTitle)
                  if (!g.avatar) g.avatar = fullData.avatar
                  Object.assign(g, fullData)
                }
              }))
              if (foundGroups.length > 0) {
                (socials as any).groups = foundGroups
              }
            } catch {}
          }
        }

        if (!infoboxGenres) {
          setStep('Nustatomi žanrai...')
          const genreQids = all('P136').map((v:any)=>v?.id).filter(Boolean).slice(0,12)
          if(genreQids.length>0){
            try{
              const glData=await(await fetch(
                `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${genreQids.join('|')}&format=json&origin=*&languages=en&props=labels`
              )).json()
              wdGenres=genreQids.map((id:string)=>glData.entities?.[id]?.labels?.en?.value).filter(Boolean)
            }catch{}
          }
        }
      }

      let avatar = ''
      if (avatarSrcUrl) {
        setStep('Saugoma nuotrauka...')
        try {
          const ir=await fetch('/api/fetch-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:avatarSrcUrl})})
          if(ir.ok){const d=await ir.json();avatar=d.url||avatarSrcUrl}
        }catch{avatar=avatarSrcUrl}
      }

      const finalGenres = infoboxGenres || wdGenres
      const { genre, substyles } = mapGenres(finalGenres)
      const cleanName = cleanArtistName(sum.title?.replace(/_/g,' ') || '')

      setPreview({
        name: cleanName,
        type, country: country||'Lietuva',
        genre, substyles, description,
        yearStart, yearEnd, breaks,
        birthYear, birthMonth, birthDay,
        deathYear, deathMonth, deathDay,
        gender, avatar, website, photos:[],
        ...socials,
      })

      if (parsedMembers.length > 0) {
        setMembersLoading(true)
        const resolved = (await Promise.all(
          parsedMembers
            .filter(m => m.name && m.name.length >= 2)
            .map(async (m) => {
              const [dbResult, fullData] = await Promise.all([checkMemberInDB(m.name), fetchMemberFullData(m.wikiTitle)])
              return { ...m, existingId: dbResult?.id, existingSlug: dbResult?.slug, ...fullData }
            })
        )).filter(m => m.name && m.name.length >= 2)
        setMembers(resolved)
        setMembersLoading(false)
      }

      await checkDuplicates(cleanName)
      setStep('')
    }catch(e:any){setError(e.message||'Klaida');setStep('')}
    setLoading(false)
  }

  // ── Nariai nekuriami DB čia – bus sukurti kartu su grupe kai paspaudžiamas "Išsaugoti" ──
  const handleApply = () => {
    if (!preview) return
    // Nariai perduodami su pilnais duomenimis – sukuriami DB tik kai išsaugoma grupė
    const memberList = members.map(m => ({
      id: m.existingId || null,
      name: m.name,
      avatar: m.avatar || '',
      yearFrom: m.yearFrom || '',
      yearTo: m.yearTo || '',
      isCurrent: m.isCurrent,
      country: m.country || '',
      yearStart: (m as any).yearStart || '',
      yearEnd: (m as any).yearEnd || '',
      birthYear: m.birthYear || '', birthMonth: m.birthMonth || '', birthDay: m.birthDay || '',
      deathYear: m.deathYear || '', deathMonth: m.deathMonth || '', deathDay: m.deathDay || '',
      gender: m.gender || '',
      description: m.description || '',
      genre: m.genre || '',
      substyles: m.substyles || [],
      website: m.website || '',
      facebook: m.facebook || '', instagram: m.instagram || '', twitter: m.twitter || '',
      spotify: m.spotify || '', youtube: m.youtube || '', soundcloud: m.soundcloud || '',
      tiktok: m.tiktok || '', bandcamp: m.bandcamp || '',
    }))
    const groupList = ((preview as any).groups || []).map((g: any) => ({
      id: g.id || null,
      name: g.name,
      avatar: g.avatar || '',
      yearFrom: g.yearFrom || '',
      yearTo: g.yearTo || '',
      wikiTitle: g.wikiTitle || '',
      country: g.country || '',
      yearStart: g.yearStart || '',
      yearEnd: g.yearEnd || '',
      description: g.description || '',
      genre: g.genre || '',
      substyles: g.substyles || [],
      website: g.website || '',
      facebook: g.facebook || '', instagram: g.instagram || '', twitter: g.twitter || '',
      spotify: g.spotify || '', youtube: g.youtube || '', soundcloud: g.soundcloud || '',
      tiktok: g.tiktok || '', bandcamp: g.bandcamp || '',
    }))
    onImport({ ...preview, members: memberList as any, groups: groupList as any })
    setPreview(null); setUrl(''); setMembers([]); setSimilarArtists([])
  }

  const p = preview
  const foundSocialKeys = p ? ['facebook','instagram','twitter','spotify','youtube','soundcloud','tiktok','bandcamp'].filter(k => (p as any)[k]) : []
  const currentMembers = members.filter(m => m.isCurrent)
  const pastMembers = members.filter(m => !m.isCurrent)

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') go() }}
          placeholder="Atlikėjo pavadinimas arba Wikipedia nuoroda..."
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={() => go()}
          disabled={loading || !url.trim()}
          className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {loading ? '...' : 'Importuoti'}
        </button>
      </div>

      {/* Tabs */}
      {(url.trim().length >= 2 && !isUrl(url)) && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Tab antraštės */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            {([
              { key: 'wikipedia', label: 'Wikipedia', badge: 'W', badgeCls: 'bg-gray-200 text-gray-600', count: wpResults.length, loading: wpLoading },
              { key: 'youtube', label: 'YouTube', badge: 'YT', badgeCls: 'bg-red-100 text-red-600', count: ytResults.length, loading: ytLoading },
            ] as const).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key)
                  const q = url.trim()
                  if (tab.key === 'youtube' && !ytResults.length && !ytLoading && !ytError) fetchYt(q)
                }}
                className={`flex-1 px-2 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center leading-none ${tab.badgeCls}`}>{tab.badge}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.loading
                  ? <span className="text-gray-400 animate-spin text-xs">⟳</span>
                  : tab.count > 0
                  ? <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5">{tab.count}</span>
                  : null
                }
              </button>
            ))}
          </div>

          {/* Tab turinys */}
          <div className="max-h-56 overflow-y-auto">
            {/* Wikipedia */}
            {activeTab === 'wikipedia' && (
              wpLoading
                ? <p className="text-xs text-gray-400 px-3 py-3">Ieškoma...</p>
                : wpResults.length === 0
                ? <p className="text-xs text-gray-400 px-3 py-3">Nieko nerasta</p>
                : wpResults.map(r => (
                  <button key={r.title} type="button"
                    onClick={() => selectResult(r.title, 'wikipedia')}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <div className="text-sm text-gray-800 font-medium">{r.title}</div>
                    {r.description && <div className="text-xs text-gray-400 truncate">{r.description}</div>}
                  </button>
                ))
            )}

            {/* YouTube */}
            {activeTab === 'youtube' && (
              ytLoading
                ? <p className="text-xs text-gray-400 px-3 py-3">Ieškoma...</p>
                : ytError
                ? <p className="text-xs text-red-500 px-3 py-3 break-all">Klaida: {ytError}</p>
                : ytResults.length === 0
                ? <p className="text-xs text-gray-400 px-3 py-3">Nieko nerasta</p>
                : ytResults.map(r => (
                  <button key={r.ytData.channelId} type="button"
                    onClick={() => selectResult(r.title, 'youtube', r.ytData)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 flex items-center gap-2"
                  >
                    {r.ytData.thumbnail && <img src={r.ytData.thumbnail} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />}
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 font-medium">{r.title}</div>
                      {r.description && <div className="text-xs text-gray-400 truncate">{r.description}</div>}
                    </div>
                  </button>
                ))
            )}
</div>
        </div>
      )}

      {/* Status */}
      {step && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5 px-0.5">
          <span className="inline-block animate-spin">⟳</span>{step}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Preview panel */}
      {p && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white text-sm">

          {/* Artist header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            {p.avatar
              ? <img src={p.avatar} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-gray-100" />
              : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-base">🎵</div>
            }
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-gray-900">{p.name}</span>
              <span className="text-gray-400 text-xs ml-2">
                {p.type === 'group' ? 'Grupė' : 'Solo'}
                {p.country ? ` · ${p.country}` : ''}
                {p.yearStart ? ` · ${p.yearStart}${p.yearEnd ? `–${p.yearEnd}` : '–dabar'}` : ''}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              {similarArtists.length > 0 && (
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-amber-600">⚠️ Panašūs jau yra:</p>
                  {similarArtists.map(d => (
                    <a key={d.id} href={`/admin/artists/${d.id}`} target="_blank" rel="noreferrer"
                      className="block text-[11px] text-amber-700 hover:text-blue-600 hover:underline">
                      {d.name} ({d.type === 'group' ? 'Grupė' : 'Solo'})
                    </a>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={handleApply}
                disabled={membersLoading}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 text-white ${similarArtists.length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'}`}
              >
                {membersLoading ? '⏳' : similarArtists.length > 0 ? '⚠️ Vis tiek importuoti' : '✓ Importuoti'}
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="px-4 py-2.5 border-b border-gray-100 space-y-1.5 text-xs">
            {(p.genre || (p.substyles && p.substyles.length > 0)) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {p.genre && <span className="text-gray-600 font-medium">{p.genre}</span>}
                {p.substyles && p.substyles.map(s => (
                  <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">{s}</span>
                ))}
              </div>
            )}
            {p.type === 'solo' && (p.gender || p.birthYear) && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500">
                {p.gender && <span>{p.gender === 'male' ? 'Vyras' : 'Moteris'}</span>}
                {p.birthYear && <span>Gimė: {fmtDate(p.birthYear, p.birthMonth, p.birthDay)}</span>}
                {p.deathYear && <span>Mirė: {fmtDate(p.deathYear, p.deathMonth, p.deathDay)}</span>}
              </div>
            )}
            {p.breaks && p.breaks.length > 0 && (
              <div className="text-gray-500">Pertraukos: {p.breaks.map(b => `${b.from}–${b.to||'?'}`).join(', ')}</div>
            )}
            {(p.website || foundSocialKeys.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-[180px]" title={p.website}>
                    {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                )}
                {foundSocialKeys.map(k => (
                  <a key={k} href={(p as any)[k]} target="_blank" rel="noopener noreferrer" title={(p as any)[k]}
                    className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[11px] hover:bg-blue-100 transition-colors">
                    {k}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Members */}
          {(membersLoading || members.length > 0) && (
            <div className="px-4 py-2 border-b border-gray-100 text-xs">
              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                {membersLoading
                  ? <span className="text-gray-400">Nariai <span className="animate-spin inline-block">⟳</span></span>
                  : <>
                      {currentMembers.length > 0 && (
                        <span className="text-gray-500">
                          {currentMembers.map((m, i) => (
                            <span key={m.wikiTitle}>
                              {i > 0 && <span className="text-gray-300 mx-0.5">·</span>}
                              <span className={m.existingId ? 'text-green-600' : 'text-gray-700'}>{m.name}</span>
                              {m.existingId && <span className="text-green-400 ml-0.5 text-[10px]">✓</span>}
                            </span>
                          ))}
                        </span>
                      )}
                      {pastMembers.length > 0 && (
                        <span className="text-gray-400 text-[11px]">
                          {currentMembers.length > 0 && <span className="mx-1 text-gray-300">|</span>}
                          Buvę: {pastMembers.map((m, i) => (
                            <span key={m.wikiTitle}>
                              {i > 0 && <span className="text-gray-300 mx-0.5">·</span>}
                              {m.name}
                            </span>
                          ))}
                        </span>
                      )}
                      {currentMembers.some(m => !m.existingId) && (
                        <span className="text-[11px] text-amber-500 ml-1">· trūkstami bus sukurti išsaugant</span>
                      )}
                    </>
                }
              </div>
            </div>
          )}

          {/* Groups (solo atlikėjo grupės) */}
          {p.type === 'solo' && (preview as any).groups && (preview as any).groups.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 text-xs">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                <span className="text-gray-400 mr-0.5">Priklauso:</span>
                {((preview as any).groups as any[]).map((g: any, i: number) => (
                  <span key={i} className="flex items-center gap-1">
                    {g.avatar
                      ? <img src={g.avatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      : <div className="w-3.5 h-3.5 rounded-full bg-gray-200 flex items-center justify-center text-[7px] shrink-0 font-bold">{g.name?.[0] ?? '?'}</div>
                    }
                    <span className={g.id ? 'text-green-600' : 'text-gray-700'}>{g.name}</span>
                    {g.id
                      ? <span className="text-green-400 text-[10px]">✓</span>
                      : <span className="text-amber-500 text-[10px]">+</span>
                    }
                  </span>
                ))}
                {(preview as any).groups.some((g: any) => !g.id) && (
                  <span className="text-amber-500 ml-1">· bus sukurta išsaugant</span>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="px-4 py-2.5">
            {p.description ? (
              <div>
                <div
                  className="text-xs text-gray-600 leading-relaxed cursor-pointer"
                  style={{ maxHeight: (preview as any)?._descExpanded ? 'none' : '4.5em', overflow: 'hidden', position: 'relative' }}
                  onClick={() => setPreview(prev => prev ? { ...prev, _descExpanded: !(prev as any)._descExpanded } as any : prev)}
                >
                  <div dangerouslySetInnerHTML={{ __html: p.description }} />
                  {!(preview as any)?._descExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <button type="button"
                    className="text-[11px] text-gray-400 hover:text-gray-600"
                    onClick={() => setPreview(prev => prev ? { ...prev, _descExpanded: !(prev as any)._descExpanded } as any : prev)}>
                    {(preview as any)?._descExpanded ? '▲ Sutraukti' : '▼ Rodyti visą'}
                  </button>
                  <button type="button"
                    className="text-[11px] text-blue-500 hover:text-blue-700"
                    onClick={() => setPreview(prev => prev ? { ...prev, _descEditing: true, _descExpanded: true } as any : prev)}>
                    ✎ Redaguoti
                  </button>
                </div>
                {(preview as any)?._descEditing && (
                  <div className="mt-2">
                    <textarea
                      className="w-full text-xs text-gray-800 border border-gray-300 rounded-lg p-2.5 leading-relaxed focus:ring-1 focus:ring-blue-400 focus:border-blue-400 resize-y"
                      rows={8}
                      defaultValue={p.description.replace(/<\/?p>/g, '\n\n').replace(/<[^>]+>/g, '').trim()}
                      onBlur={e => {
                        const text = e.target.value.trim()
                        const html = text ? '<p>' + text.split(/\n\n+/).map(s => s.replace(/\n/g, ' ').trim()).filter(Boolean).join('</p><p>') + '</p>' : ''
                        setPreview(prev => prev ? { ...prev, description: html, _descEditing: false } : prev)
                      }}
                    />
                    <div className="text-[10px] text-gray-400 mt-0.5">Pastraipos skiriamos tuščia eilute. Paspauskit kitur kad išsaugoti.</div>
                  </div>
                )}
              </div>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                setStep('Generuojamas aprašymas...')
                try {
                  const dr = await fetch('/api/generate-description', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      wikiTitle: extractSlug(url) || undefined,
                      ytDescription: !extractSlug(url) ? (p as any).rawDescription || p.description || undefined : undefined,
                      type: p.type
                    }),
                  })
                  if (dr.ok) {
                    const d: any = await dr.json()
                    if (d.description) {
                      setPreview(prev => prev ? { ...prev, description: d.description, _descExpanded: true, _descEditing: false } as any : prev)
                      setTranslateOk(true)
                    }
                  }
                } catch {}
                setStep('')
              }}
              className="mt-1.5 text-[11px] text-blue-500 hover:text-blue-700 underline"
            >
              {step === 'Generuojamas aprašymas...' ? '⏳ Generuojama...' : p.description ? '↺ Regeneruoti aprašymą' : '✦ Generuoti aprašymą'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberChip({ member, past }: { member: BandMember; past?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] ${
      past ? 'bg-gray-50 border-gray-200 text-gray-400'
           : member.existingId ? 'bg-green-50 border-green-200 text-green-700'
                               : 'bg-blue-50 border-blue-200 text-blue-700'
    }`}>
      {member.avatar
        ? <img src={member.avatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
        : <div className="w-3.5 h-3.5 rounded-full bg-gray-200 flex items-center justify-center text-[7px] shrink-0 font-bold">{member.name?.[0] ?? '?'}</div>
      }
      <span>{member.name}</span>
      <span className="opacity-50">{member.existingId ? '✓' : '+'}</span>
    </div>
  )
}

export default function WikipediaImport({ onImport, initialSearch }: Props) {
  return <WikipediaImportCore onImport={onImport} initialSearch={initialSearch} />
}
