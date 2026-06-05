// lib/discovery-parse.ts
//
// Haiku klasifikatorius: ar forumo komentaras (be embed'o) pristato konkretų
// muzikinį atradimą? Jei taip — ištraukia atlikėją ir (jei yra) dainą.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

export type DiscoveryParse = { is_discovery: boolean; artist: string | null; track: string | null }

const SYSTEM = `Tu analizuoji komentarus iš lietuviškos muzikos forumo gijos „Šviežiausi jūsų muzikiniai atradimai".
Nustatyk, ar komentaras pristato KONKRETŲ muzikinį atradimą — konkretų atlikėją/grupę (ir gal dainą/albumą), kurį žmogus atrado, rekomenduoja ar dalinasi.
Grąžink TIK JSON be jokio papildomo teksto: {"is_discovery": boolean, "artist": string|null, "track": string|null}.
Taisyklės:
- is_discovery=true tik jei aiškiai įvardytas konkretus atlikėjas/grupė.
- artist = atlikėjo/grupės pavadinimas (originali rašyba, be papildomo teksto). track = dainos pavadinimas jei aiškiai įvardytas, kitaip null.
- is_discovery=false jei tai bendra diskusija, klausimas, ginčas, atsakymas kitam, ar tik nuoroda be konteksto, ar nepaminėtas konkretus atlikėjas.
- Jei paminėti keli atlikėjai, imk ryškiausią/pirmą.`

export async function classifyDiscovery(body: string): Promise<DiscoveryParse> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  const text = (body || '').slice(0, 1500)
  if (text.trim().length < 20) return { is_discovery: false, artist: null, track: null }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const data = await res.json()
  const raw = (data?.content?.[0]?.text || '').trim()
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return { is_discovery: false, artist: null, track: null }
  try {
    const j = JSON.parse(m[0])
    const artist = typeof j.artist === 'string' && j.artist.trim() ? j.artist.trim().slice(0, 160) : null
    const track = typeof j.track === 'string' && j.track.trim() ? j.track.trim().slice(0, 200) : null
    return { is_discovery: !!j.is_discovery && !!artist, artist: j.is_discovery ? artist : null, track: j.is_discovery ? track : null }
  } catch {
    return { is_discovery: false, artist: null, track: null }
  }
}
