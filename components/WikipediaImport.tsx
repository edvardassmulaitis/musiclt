'use client'

import { useState } from 'react'
import { translateToLT } from '@/lib/translate'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'
import { type ArtistFormData, type Break } from './ArtistForm'

type Props = { onImport: (data: Partial<ArtistFormData>) => void }

const ALL_SUBSTYLES = Object.values(SUBSTYLES).flat()

const MONTHS_LT = ['sausio','vasario','kovo','balandžio','gegužės','birželio',
                   'liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']

function fmtDate(year?: string, month?: string, day?: string): string {
  const parts: string[] = []
  if (year) parts.push(`${year}`)
  if (month) { const m = parseInt(month); if (m >= 1 && m <= 12) parts.push(MONTHS_LT[m-1]) }
  if (day) parts.push(`${day} d.`)
  return parts.join(' ')
}

function cleanArtistName(raw: string): string {
  return raw
    .replace(/\s*\(\s*(?:band|group|music(?:al)?\s*(?:group|act)?|singer|rapper|duo|trio|quartet|artist|musician|rock\s*band|pop\s*group)\s*\)/gi, '')
    .replace(/\s*\(\s*the\s+band\s*\)/gi, '')
    .replace(/_/g, ' ')
    .trim()
}

type BandMember = {
  name: string
  wikiTitle: string
  isCurrent: boolean
  existingId?: number
  existingSlug?: string
  avatar?: string
}

function extractFieldNested(wikitext: string, field: string): string {
  // (?<![a-z_]) užtikrina kad "members" nesugautų "current_members" ar "past_members"
  const startRe = new RegExp(`\\|\\s*(?<![a-z_])${field}(?![a-z_])\\s*=\\s*`, 'i')
  const startM = wikitext.match(startRe)
  if (!startM || startM.index === undefined) return ''
  const startIdx = startM.index + startM[0].length
  let depth = 0, i = startIdx
  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i+1] === '{') { depth++; i += 2; continue }
    if (wikitext[i] === '}' && wikitext[i+1] === '}') {
      depth--; if (depth <= 0) { i += 2; break }
      i += 2; continue
    }
    if (depth === 0 && wikitext[i] === '\n' && /^\s*\|/.test(wikitext.slice(i+1))) break
    i++
  }
  return wikitext.slice(startIdx, i)
}

function parseBandMembers(wikitext: string): BandMember[] {
  const members: BandMember[] = []
  const seen = new Set<string>()
  const extractField = (field: string, isCurrent: boolean) => {
    const block = extractFieldNested(wikitext, field)
    if (!block) return
    const linkRe = /\[\[\s*([^\]|#]+?)(?:\s*\|\s*([^\]]+))?\s*\]\]/g
    let lm: RegExpExecArray | null
    while ((lm = linkRe.exec(block)) !== null) {
      const wikiTitle = lm[1].replace(/\s+/g, '_').trim()
      const display = (lm[2] || lm[1])
        .replace(/'{2,}/g, '').replace(/\[\[|\]\]/g, '').replace(/\{\{[^}]+\}\}/g, '').trim()
      if (!display || display.length < 2) continue
      if (/^(plain ?list|flatlist|hlist|br|small|nowrap|ubl|refn|ref|cite)/i.test(display)) continue
      if (wikiTitle.includes(':')) continue
      if (seen.has(wikiTitle)) continue
      seen.add(wikiTitle)
      members.push({ name: cleanArtistName(display), wikiTitle, isCurrent })
    }
  }
  extractField('current_members', true)
  extractField('members', true)
  extractField('past_members', false)
  extractField('former_members', false)
  return members
}

async function fetchMemberAvatar(wikiTitle: string): Promise<string> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&pithumbsize=200&piprop=thumbnail&format=json&origin=*`
    )
    const json = await res.json()
    const pages = json.query?.pages || {}
    const page = Object.values(pages)[0] as any
    return page?.thumbnail?.source || ''
  } catch { return '' }
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

function mapGenres(genreLabels: string[]): { genre: string; substyles: string[] } {
  const lower = genreLabels.map(g => g.toLowerCase().trim())
  let best = '', bestScore = 0
  for (const [g, kws] of GENRE_RULES) {
    const score = lower.reduce((a, gl) => a + kws.reduce((s, kw) => s + (gl === kw || gl.includes(kw) ? 1 : 0), 0), 0)
    if (score > bestScore) { bestScore = score; best = g }
  }
  const substyles: string[] = []
  for (const g of genreLabels) {
    const found = ALL_SUBSTYLES.find(s => s.toLowerCase() === g.toLowerCase().trim())
    if (found && !substyles.includes(found)) substyles.push(found)
  }
  return { genre: best, substyles }
}

function parseInfoboxGenres(wikitext: string): string[] | null {
  const genreMatch = wikitext.match(/\|\s*genre\s*=\s*([\s\S]*?)(?=\n\s*\||\n\s*\}\})/i)
  if (!genreMatch) return null
  const raw = genreMatch[1]
  const fromLinks = [...raw.matchAll(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g)].map(m => m[1].trim())
  const stripped = raw
    .replace(/\{\{[^}]+\}\}/g, ' ').replace(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g, '$1')
    .replace(/[*#\[\]{}|]/g, ' ').split(/[,·•\n]/).map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 40 && !/^(hlist|flatlist|ubl|br|small|nowrap|\d+)$/i.test(s))
  const all = [...new Set([...fromLinks, ...stripped])].filter(s => s && s.length > 1)
  return all.length > 0 ? all : null
}

const QID_COUNTRY: Record<string, string> = {
  Q142:'Prancūzija',Q183:'Vokietija',Q30:'JAV',Q145:'Didžioji Britanija',
  Q34:'Švedija',Q20:'Norvegija',Q33:'Suomija',Q35:'Danija',
  Q16:'Kanada',Q408:'Australija',Q159:'Rusija',Q38:'Italija',
  Q29:'Ispanija',Q55:'Olandija',Q31:'Belgija',Q39:'Šveicarija',
  Q40:'Austrija',Q36:'Lenkija',Q27:'Airija',Q17:'Japonija',
  Q884:'Pietų Korėja',Q155:'Brazilija',Q414:'Argentina',Q96:'Meksika',
  Q37:'Lietuva',Q211:'Latvija',Q191:'Estija',Q212:'Ukraina',
  Q213:'Čekija',Q218:'Rumunija',Q41:'Graikija',Q45:'Portugalija',
  Q48:'Turkija',Q801:'Izraelis',Q668:'Indija',Q148:'Kinija',
  Q664:'Naujoji Zelandija',Q189:'Islandija',Q219:'Bulgarija',
}
const TXT_COUNTRY: [string, string][] = [
  ['united states','JAV'],['american','JAV'],['u.s.','JAV'],
  ['united kingdom','Didžioji Britanija'],['british','Didžioji Britanija'],
  ['england','Didžioji Britanija'],['english','Didžioji Britanija'],
  ['france','Prancūzija'],['french','Prancūzija'],
  ['germany','Vokietija'],['german','Vokietija'],
  ['sweden','Švedija'],['swedish','Švedija'],
  ['norway','Norvegija'],['norwegian','Norvegija'],
  ['finland','Suomija'],['finnish','Suomija'],
  ['denmark','Danija'],['danish','Danija'],
  ['canada','Kanada'],['canadian','Kanada'],
  ['australia','Australija'],['australian','Australija'],
  ['russia','Rusija'],['russian','Rusija'],
  ['italy','Italija'],['italian','Italija'],
  ['spain','Ispanija'],['spanish','Ispanija'],
  ['netherlands','Olandija'],['dutch','Olandija'],
  ['belgium','Belgija'],['belgian','Belgija'],
  ['switzerland','Šveicarija'],['swiss','Šveicarija'],
  ['austria','Austrija'],['austrian','Austrija'],
  ['poland','Lenkija'],['polish','Lenkija'],
  ['ireland','Airija'],['irish','Airija'],
  ['japan','Japonija'],['japanese','Japonija'],
  ['south korea','Pietų Korėja'],['korean','Pietų Korėja'],
  ['brazil','Brazilija'],['mexico','Meksika'],['mexican','Meksika'],
  ['iceland','Islandija'],['icelandic','Islandija'],
  ['lithuanian','Lietuva'],['latvian','Latvija'],['estonian','Estija'],
]
function findCountry(text: string): string {
  const lower = text.toLowerCase()
  for (const [k, v] of TXT_COUNTRY)
    if (k.includes(' ') && lower.includes(k) && COUNTRIES.includes(v)) return v
  for (const [k, v] of TXT_COUNTRY)
    if (!k.includes(' ') && lower.includes(k) && COUNTRIES.includes(v)) return v
  return ''
}

function parseWDDate(t: string) {
  const [dp] = t.replace(/^\+/, '').split('T')
  const [y, m, d] = dp.split('-')
  return { year: parseInt(y) ? String(parseInt(y)) : '', month: parseInt(m) ? String(parseInt(m)) : '', day: parseInt(d) ? String(parseInt(d)) : '' }
}

function parseYearsActive(raw: string): { yearStart: string; yearEnd: string; breaks: Break[] } {
  const clean = raw
    .replace(/\{\{[^}]+\}\}/g, '').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/<[^>]+>/g, '').replace(/&ndash;|&mdash;/g, '–').replace(/\s+/g, ' ').trim()
  const parts = clean.split(/,\s*/)
  const ranges: { from: string; to: string; oneoff?: boolean }[] = []
  for (const part of parts) {
    const t = part.trim()
    const rng     = t.match(/(\d{4})\s*[–—\-]\s*(\d{4})/)
    const rngOpen = t.match(/(\d{4})\s*[–—\-]\s*(present|dabar)/i)
    const single  = t.match(/^(\d{4})$/)
    if (rng)          ranges.push({ from: rng[1], to: rng[2] })
    else if (rngOpen) ranges.push({ from: rngOpen[1], to: '' })
    else if (single)  ranges.push({ from: single[1], to: single[1], oneoff: true })
  }
  if (!ranges.length) {
    const y = clean.match(/(\d{4})/)
    return { yearStart: y?.[1] || '', yearEnd: '', breaks: [] }
  }
  const yearStart = ranges[0].from
  const realRanges = ranges.filter(r => !r.oneoff)
  const lastReal = realRanges[realRanges.length - 1]
  const yearEnd = lastReal ? lastReal.to : ranges[ranges.length - 1].to
  const breaks: Break[] = []
  for (let i = 0; i < realRanges.length - 1; i++) {
    const gf = realRanges[i].to, gt = realRanges[i + 1].from
    if (gf && gt && gf !== gt) breaks.push({ from: gf, to: gt })
  }
  return { yearStart, yearEnd, breaks }
}

const SOCIAL_MAP: Record<string, { key: keyof ArtistFormData; url: (v: string) => string }> = {
  P2013: { key:'facebook',   url: v=>`https://www.facebook.com/${v}` },
  P2003: { key:'instagram',  url: v=>`https://www.instagram.com/${v}` },
  P2002: { key:'twitter',    url: v=>`https://x.com/${v}` },
  P1902: { key:'spotify',    url: v=>`https://open.spotify.com/artist/${v}` },
  P2397: { key:'youtube',    url: v=>`https://www.youtube.com/channel/${v}` },
  P3040: { key:'soundcloud', url: v=>`https://soundcloud.com/${v}` },
  P7085: { key:'tiktok',     url: v=>`https://www.tiktok.com/@${v}` },
  P7589: { key:'bandcamp',   url: v=>`https://bandcamp.com/${v}` },
}
const GROUP_QIDS = new Set(['Q215380','Q5741069','Q2088357','Q9212979','Q56816265','Q190445','Q16010345','Q183319'])
const SKIP_WEB = ['store','shop','merch','bandsintown','songkick','last.fm','allmusic','discogs','musicbrainz','facebook','instagram','twitter','x.com','youtube','spotify','soundcloud','tiktok','bandcamp']

export default function WikipediaImport({ onImport }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Partial<ArtistFormData> | null>(null)
  const [translateOk, setTranslateOk] = useState(false)
  const [members, setMembers] = useState<BandMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [applyingMembers, setApplyingMembers] = useState(false)
  const [searchResults, setSearchResults] = useState<{title:string;description:string}[]>([])
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout>|null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const isUrl = (s: string) => /wikipedia\.org\/wiki\//.test(s)

  const handleInputChange = (val: string) => {
    setUrl(val)
    setError('')
    if (isUrl(val)) { setSearchResults([]); setShowDropdown(false); return }
    if (searchTimer) clearTimeout(searchTimer)
    if (val.trim().length < 2) { setSearchResults([]); setShowDropdown(false); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(val)}&limit=10&format=json&origin=*`
        )
        const data = await res.json()
        const titles: string[] = data[1] || []
        const descs: string[] = data[2] || []
        const MUSIC_RE = /\b(band|musician|singer|rapper|artist|group|duo|trio|record|album|guitarist|drummer|bassist|vocalist|DJ|producer|songwriter|rock|pop|hip.hop|jazz|metal|punk|electronic|music)/i
        const all = titles.map((title, i) => ({ title, description: descs[i] || '' }))
        // Music-related pirmiau, tada kiti
        const music = all.filter(r => MUSIC_RE.test(r.description) || MUSIC_RE.test(r.title))
        const others = all.filter(r => !MUSIC_RE.test(r.description) && !MUSIC_RE.test(r.title))
        const sorted = [...music, ...others].slice(0, 7)
        setSearchResults(sorted)
        setShowDropdown(sorted.length > 0)
      } catch {}
    }, 300)
    setSearchTimer(t)
  }

  const selectResult = (title: string) => {
    const slug = title.replace(/ /g, '_')
    const newUrl = `https://en.wikipedia.org/wiki/${slug}`
    setUrl(newUrl)
    setSearchResults([])
    setShowDropdown(false)
    // Auto-fetch iškart po pasirinkimo
    setTimeout(() => go(newUrl), 50)
  }

  const extractSlug = (u: string) => {
    const m = u.match(/wikipedia\.org\/wiki\/(.+?)(?:\?|#|$)/)
    return m ? decodeURIComponent(m[1]) : u.trim().replace(/ /g, '_')
  }

  const go = async (overrideUrl?: string) => {
    setError(''); setPreview(null); setMembers([])
    setShowDropdown(false)
    const s = extractSlug(overrideUrl ?? url)
    if (!s) { setError('Įveskite atlikėjo pavadinimą arba Wikipedia URL'); return }
    setLoading(true)
    try {
      setStep('Kraunama Wikipedia...')
      const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s)}`)
      if (!sumRes.ok) throw new Error(`Puslapis nerastas: ${s}`)
      const sum = await sumRes.json()
      const rawDesc = sum.extract?.split('\n')[0] || sum.description || ''
      const shortDesc = rawDesc.split(/\.\s+/).slice(0, 3).join('. ').substring(0, 700)
      const avatarSrcUrl = sum.thumbnail?.source || ''

      let description = shortDesc
      let trOk = false
      if (shortDesc) {
        setStep('Verčiama į lietuvių kalbą...')
        try { const tr = await translateToLT(shortDesc); description = tr.result; trOk = tr.ok } catch {}
      }
      setTranslateOk(trOk)

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
        // Wikitext narių parsinimas
        parsedMembers = parseBandMembers(rawWikitext)
      } catch {}

      // HTML-based narių parsinimas (patikimesnis nei wikitext)
      // Visada vykdome ir pakeičiame jei gavo daugiau narių
      try {
        const htmlRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(s)}&prop=text&format=json&origin=*`
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
            if (!cleanName) return
            htmlMembers.push({ name: cleanName, wikiTitle, isCurrent })
          })
        }

        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Members\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, true)
        parseSection(/class="infobox-label"[^>]*>\s*(?:<[^>]+>)*\s*Past members\s*(?:<[^>]+>)*\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i, false)

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
          if(ir.ok){const{dataUrl}=await ir.json();avatar=dataUrl||avatarSrcUrl}
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
              const [dbResult, avatarUrl] = await Promise.all([checkMemberInDB(m.name), fetchMemberAvatar(m.wikiTitle)])
              return { ...m, existingId: dbResult?.id, existingSlug: dbResult?.slug, avatar: avatarUrl }
            })
        )).filter(m => m.name && m.name.length >= 2)
        setMembers(resolved)
        setMembersLoading(false)
      }

      setStep('')
    }catch(e:any){setError(e.message||'Klaida');setStep('')}
    setLoading(false)
  }

  const handleApply = async () => {
    if (!preview) return
    const groupMembers = members.filter(m => m.isCurrent)
    if (groupMembers.length === 0) {
      onImport(preview); setPreview(null); setUrl(''); setMembers([])
      return
    }
    setApplyingMembers(true)
    const memberIds: { id: number }[] = []
    for (const m of groupMembers) {
      if (m.existingId) {
        memberIds.push({ id: m.existingId })
      } else {
        try {
          const res = await fetch('/api/artists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: m.name, type: 'solo',
              type_music: true, type_film: false, type_dance: false, type_books: false,
              cover_image_url: m.avatar || '',
              country: preview.country || 'Lietuva',
              active_from: preview.yearStart ? parseInt(preview.yearStart) : null,
              genres: [], substyleNames: [],
            }),
          })
          if (res.ok) { const data = await res.json(); const newId = data.id || data.artist?.id; if (newId) memberIds.push({ id: newId }) }
        } catch {}
      }
    }
    setApplyingMembers(false)
    onImport({ ...preview, members: memberIds as any })
    setPreview(null); setUrl(''); setMembers([])
  }

  const p = preview
  const foundSocialKeys = p ? ['facebook','instagram','twitter','spotify','youtube','soundcloud','tiktok','bandcamp'].filter(k => (p as any)[k]) : []
  const currentMembers = members.filter(m => m.isCurrent)
  const pastMembers = members.filter(m => !m.isCurrent)

  return (
    <div className="space-y-3">
      {/* Input + dropdown */}
      <div className="flex gap-2 relative">
        <div className="flex-1 min-w-0 relative">
          <input
            type="text"
            value={url}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setShowDropdown(false); go() } if (e.key === 'Escape') setShowDropdown(false) }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder="Atlikėjo pavadinimas arba Wikipedia URL..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
              {searchResults.map(r => {
                const MUSIC_RE = /\b(band|musician|singer|rapper|artist|group|duo|trio|record|album|guitarist|drummer|bassist|vocalist|DJ|producer|songwriter|rock|pop|hip.hop|jazz|metal|punk|electronic|music)/i
                const isMusic = MUSIC_RE.test(r.description) || MUSIC_RE.test(r.title)
                return (
                  <button
                    key={r.title}
                    type="button"
                    onMouseDown={() => selectResult(r.title)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0 flex items-start gap-2"
                  >
                    <span className="mt-0.5 text-base leading-none shrink-0">{isMusic ? '🎵' : '📄'}</span>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 font-medium">{r.title}</div>
                      {r.description && <div className="text-xs text-gray-400 truncate">{r.description}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => go()}
          disabled={loading || !url.trim()}
          className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {loading ? '...' : 'Importuoti iš Wiki'}
        </button>
      </div>

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
            <button
              type="button"
              onClick={handleApply}
              disabled={applyingMembers || membersLoading}
              className="shrink-0 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {applyingMembers ? '⏳' : '✓ Importuoti'}
            </button>
          </div>

          {/* Details: žanras + stiliai + datos + website + socials – viena eilutė */}
          <div className="px-4 py-2.5 border-b border-gray-100 space-y-1.5 text-xs">
            {/* Žanras + substiliai */}
            {(p.genre || (p.substyles && p.substyles.length > 0)) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {p.genre && <span className="text-gray-600 font-medium">{p.genre}</span>}
                {p.substyles && p.substyles.map(s => (
                  <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">{s}</span>
                ))}
              </div>
            )}
            {/* Solo datos */}
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
            {/* Svetainė + socialiniai tinklai vienoje eilutėje */}
            {(p.website || foundSocialKeys.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {p.website && (
                  <a
                    href={p.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-[180px]"
                    title={p.website}
                  >
                    {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                )}
                {foundSocialKeys.map(k => (
                  <a
                    key={k}
                    href={(p as any)[k]}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={(p as any)[k]}
                    className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[11px] hover:bg-blue-100 transition-colors"
                  >
                    {k}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Members – vienoje eilutėje */}
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
                        <span className="text-[11px] text-amber-500 ml-1">· trūkstami bus sukurti</span>
                      )}
                    </>
                }
              </div>
            </div>
          )}

          {/* Description */}
          {p.description && (
            <div className="px-4 py-2.5">
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{p.description}</p>
              {!translateOk && <span className="text-[10px] text-amber-500 mt-1 block">Vertimas nepavyko (EN)</span>}
            </div>
          )}
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
