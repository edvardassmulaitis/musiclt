// lib/voice-transcribe.ts
//
// Balso transkripcijos provider ABSTRAKCIJA. Visa transkripcijos logika
// gyvena čia — endpointas (`/api/voice-to-review`) kviečia tik `transcribeAudio`.
//
// MVP provideris: Groq Whisper large-v3 — greitas (~4-5x už OpenAI), pigus
// (~$0.02-0.04/val), OpenAI-suderinamas, palaiko `prompt` kontekstą proper
// noun'ams (grupių/vietų pavadinimai). Lietuvių k. likusias klaidas mop'ina
// Claude sutvarkymo žingsnis (lib/voice-cleanup.ts).
//
// SWAP į kitą providerį = pakeisti TIK šį failą:
//   • OpenAI Whisper:  endpoint https://api.openai.com/v1/audio/transcriptions,
//                      model 'whisper-1', Authorization Bearer OPENAI_API_KEY.
//                      Likusi logika identiška (OpenAI formatas).
//   • ElevenLabs Scribe (tiksliausias lietuviškai — ~3.1% WER FLEURS):
//                      endpoint https://api.elevenlabs.io/v1/speech-to-text,
//                      header 'xi-api-key', laukas 'model_id'='scribe_v1',
//                      'language_code'='lt'; kontekstas per keyterm prompting.
//                      Atsako forma kitokia (data.text), bet wrapper'is tas pats.

export class VoiceError extends Error {
  code: string
  detail?: string
  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'VoiceError'
    this.code = code
    this.detail = detail
  }
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MODEL = 'whisper-large-v3' // tikslumas > greitis: large-v3, ne turbo

/**
 * Transkribuoja audio failą į lietuvišką žalią tekstą.
 * @param file   Audio failas iš formData (webm/opus ir pan.)
 * @param opts.context  Dinaminis kontekstas (atlikėjas/renginys/vieta) —
 *                      smarkiai pagerina tikrinių daiktavardžių atpažinimą.
 * @throws VoiceError jei nėra rakto arba transkripcija nepavyksta.
 */
export async function transcribeAudio(
  file: File,
  opts: { context?: string } = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new VoiceError('NO_GROQ_KEY', 'Transkripcijos serviso raktas nesukonfigūruotas')
  }

  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', MODEL)
  fd.append('language', 'lt')
  fd.append('temperature', '0')
  fd.append('response_format', 'json')
  const ctx = (opts.context || '').trim()
  if (ctx) fd.append('prompt', ctx.slice(0, 800))

  let res: Response
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    })
  } catch (e: any) {
    throw new VoiceError('NETWORK', 'Nepavyko pasiekti transkripcijos serviso', e?.message)
  }

  const raw = await res.text()
  if (!res.ok) {
    throw new VoiceError(`HTTP_${res.status}`, 'Transkripcijos klaida', raw.slice(0, 300))
  }

  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    data = { text: raw }
  }
  return (data.text || '').trim()
}
