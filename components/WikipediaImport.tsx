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
  if (year) parts.push(`${year} m.`)
  if (month) { const m = parseInt(month); if (m >= 1 && m <= 12) parts.push(`${MONTHS_LT[m-1]} mėn.`) }
  if (day) parts.push(`${day} d.`)
  return parts.join(' ')
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
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]|]+)\]\]/g, '$1')
    .replace(/[*#\[\]{}|]/g, ' ')
    .split(/[,·•\n]/)
    .map(s => s.trim())
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

// FIXED: single years (2004, 2014) treated as one-off, not full ranges
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
  // yearEnd from last non-oneoff range
  const realRanges = ranges.filter(r => !r.oneoff)
  const lastReal = realRanges[realRanges.length - 1]
  const yearEnd = lastReal ? lastReal.to : ranges[ranges.length - 1].to
  // Breaks only between consecutive real ranges
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
const SOCIAL_META: Record<string,{icon:string;label:string}> = {
  facebook:{icon:'📘',label:'Facebook'},instagram:{icon:'📸',label:'Instagram'},
  twitter:{icon:'𝕏',label:'X/Twitter'},spotify:{icon:'🎧',label:'Spotify'},
  youtube:{icon:'▶️',label:'YouTube'},soundcloud:{icon:'☁️',label:'SoundCloud'},
  tiktok:{icon:'🎵',label:'TikTok'},bandcamp:{icon:'🎸',label:'Bandcamp'},
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

  const extractSlug = (u: string) => {
    const m = u.match(/wikipedia\.org\/wiki\/(.+?)(?:\?|#|$)/)
    return m ? decodeURIComponent(m[1]) : ''
  }

  const go = async () => {
    setError(''); setPreview(null)
    const s = extractSlug(url)
    if (!s) { setError('Netinkamas URL'); return }
    setLoading(true)
    try {
      // 1. Summary + translate FIRST (before other slow calls)
      setStep('📄 Kraunama Wikipedia...')
      const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s)}`)
      if (!sumRes.ok) throw new Error(`Puslapis nerastas: ${s}`)
      const sum = await sumRes.json()
      const rawDesc = sum.extract?.split('\n')[0] || sum.description || ''
      const shortDesc = rawDesc.split(/\.\s+/).slice(0, 3).join('. ').substring(0, 700)
      const avatarSrcUrl = sum.thumbnail?.source || ''

      // 2. Translate EARLY — before slow Wikidata calls
      let description = shortDesc
      let trOk = false
      if (shortDesc) {
        setStep('🌐 Verčiama į lietuvių kalbą...')
        try {
          const tr = await translateToLT(shortDesc)
          description = tr.result
          trOk = tr.ok
        } catch {}
      }
      setTranslateOk(trOk)

      // 3. Wikitext (infobox)
      setStep('📋 Skaitomas infobox...')
      let infoboxWebsite = '', infoboxYearsRaw = '', infoboxGenres: string[] | null = null
      try {
        const wtRes = await (await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(s)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*`
        )).json()
        const pages = wtRes.query?.pages || {}
        const firstPage = Object.values(pages)[0] as any
        const wt: string = firstPage?.['revisions']?.[0]?.['slots']?.['main']?.['*']
          || firstPage?.['revisions']?.[0]?.['*']
          || (await (await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(s)}&prop=wikitext&format=json&origin=*`
          )).json()).parse?.wikitext?.['*'] || ''
        infoboxGenres = parseInfoboxGenres(wt)
        const wsM = wt.match(/\|\s*website\s*=\s*(?:\{\{[Uu][Rr][Ll]\|([^|}]+)[^}]*\}\}|(https?:\/\/[^\s<|{}\[\]\n]+))/i)
        if (wsM) {
          const raw = (wsM[1] || wsM[2] || '').trim().replace(/\/*$/, '')
          if (raw) infoboxWebsite = raw.startsWith('http') ? raw : `https://${raw}`
        }
        const yaM = wt.match(/\|\s*years[_ ]active\s*=\s*([^\n|<]+)/i)
        if (yaM) infoboxYearsRaw = yaM[1].trim()
      } catch {}

      // 4. Wikidata
      setStep('🔗 Jungiamasi prie Wikidata...')
      const ppRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(s)}&prop=pageprops&format=json&origin=*`
      )
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

      // Parse years active from infobox immediately (before Wikidata)
      if (infoboxYearsRaw) {
        const ya = parseYearsActive(infoboxYearsRaw)
        yearStart = ya.yearStart; yearEnd = ya.yearEnd; breaks = ya.breaks
      }

      if (wdId) {
        setStep('📊 Skaitoma Wikidata...')
        const claims = (await (await fetch(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wdId}&format=json&origin=*&languages=en&props=claims`
        )).json()).entities?.[wdId]?.claims || {}

        const first = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value
        const all   = (p: string): any[] => (claims[p]||[]).map((x:any)=>x.mainsnak?.datavalue?.value)

        const instances: string[] = all('P31').map((v:any)=>v?.id).filter(Boolean)
        const hasBirth = !!claims['P569']
        type = (hasBirth || instances.includes('Q5')) ? 'solo'
             : instances.some(q=>GROUP_QIDS.has(q)) ? 'group' : 'solo'

        const bd=first('P569')?.time; if(bd){const d=parseWDDate(bd);birthYear=d.year;birthMonth=d.month;birthDay=d.day;type='solo'}
        const dd=first('P570')?.time; if(dd){const d=parseWDDate(dd);deathYear=d.year;deathMonth=d.month;deathDay=d.day}

        // Wikidata fallback only if infobox had no years
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
          setStep('🎵 Nustatomi žanrai...')
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

      // 5. Avatar
      let avatar = ''
      if (avatarSrcUrl) {
        setStep('🖼️ Saugoma nuotrauka...')
        try {
          const ir=await fetch('/api/fetch-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:avatarSrcUrl})})
          if(ir.ok){const{dataUrl}=await ir.json();avatar=dataUrl||avatarSrcUrl}
        }catch{avatar=avatarSrcUrl}
      }

      const finalGenres = infoboxGenres || wdGenres
      const { genre, substyles } = mapGenres(finalGenres)

      setPreview({
        name: sum.title?.replace(/_/g,' ') || '',
        type, country: country||'Lietuva',
        genre, substyles, description,
        yearStart, yearEnd, breaks,
        birthYear, birthMonth, birthDay,
        deathYear, deathMonth, deathDay,
        gender, avatar, website, photos:[],
        ...socials,
      })
      setStep('')
    }catch(e:any){setError(e.message||'Klaida');setStep('')}
    setLoading(false)
  }

  const p = preview
  const foundSocials = p ? Object.entries(SOCIAL_META).filter(([k])=>(p as any)[k]) : []

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📖</span>
        <div>
          <h3 className="font-bold text-gray-900">Importuoti iš Wikipedia</h3>
          <p className="text-xs text-gray-500">Automatiškai užpildo laukus + verčia aprašymą į lietuvių kalbą</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={e=>setUrl(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&go()}
          placeholder="https://en.wikipedia.org/wiki/Destiny%27s_Child"
          className="flex-1 px-4 py-2.5 border border-blue-300 bg-white rounded-lg text-gray-900 text-sm focus:outline-none focus:border-music-blue" />
        <button type="button" onClick={go} disabled={loading||!url.trim()}
          className="px-5 py-2.5 bg-music-blue text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 whitespace-nowrap">
          {loading ? '⏳' : '→ Importuoti'}
        </button>
      </div>
      {step && <div className="text-sm text-blue-800 bg-blue-100 rounded-lg px-3 py-2 flex items-center gap-2"><span className="inline-block animate-spin">⟳</span>{step}</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">⚠️ {error}</div>}

      {p && (
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
            <span className="font-bold text-gray-900">Rasta informacija</span>
            <button type="button" onClick={()=>{onImport(p);setPreview(null);setUrl('')}}
              className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold">✓ Taikyti į formą</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              {p.avatar
                ?<img src={p.avatar} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200"/>
                :<div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">🎵</div>}
              <div>
                <div className="font-bold text-gray-900 text-lg">{p.name}</div>
                <div className="text-sm text-gray-500">{p.type==='group'?'🎸 Grupė':'🎤 Atlikėjas'}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <F l="Šalis" v={p.country}/>
              <F l="Žanras" v={p.genre}/>
              {p.type==='group'?<>
                <F l="Veikla" v={p.yearStart?(p.yearEnd?`${p.yearStart}–${p.yearEnd}`:`${p.yearStart}–dabar`):''}/>
                {p.breaks&&p.breaks.length>0&&<F l="Pertraukos" v={p.breaks.map(b=>`${b.from}–${b.to||'?'}`).join(', ')} wide/>}
              </>:<>
                {p.birthYear&&<F l="Gimė" v={fmtDate(p.birthYear,p.birthMonth,p.birthDay)}/>}
                {p.deathYear&&<F l="Mirė" v={fmtDate(p.deathYear,p.deathMonth,p.deathDay)}/>}
                <F l="Lytis" v={p.gender==='male'?'Vyras':p.gender==='female'?'Moteris':''}/>
                {p.yearStart&&<F l="Veikla" v={p.yearEnd?`${p.yearStart}–${p.yearEnd}`:`${p.yearStart}–dabar`}/>}
              </>}
              {p.website&&<F l="Svetainė" v={p.website} wide/>}
            </div>
            {p.substyles&&p.substyles.length>0&&(
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Stiliai</div>
                <div className="flex flex-wrap gap-1.5">
                  {p.substyles.map(s=><span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">{s}</span>)}
                </div>
              </div>
            )}
            {foundSocials.length>0&&(
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Socialiniai tinklai ({foundSocials.length})</div>
                <div className="flex flex-wrap gap-2">
                  {foundSocials.map(([k,m])=>(
                    <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-800 rounded-full text-xs font-medium">
                      {m.icon} {m.label} ✓
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.description&&(
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {translateOk ? "APRAŠYMAS (LT ✓)" : "APRAŠYMAS (vertimas nepavyko – angliškai)"}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">{p.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function F({ l, v, wide }: { l:string; v?:string; wide?:boolean }) {
  if (!v) return null
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <span className="text-xs text-gray-400 block mb-0.5">{l}</span>
      <span className="font-semibold text-gray-900 text-sm">{v}</span>
    </div>
  )
}
