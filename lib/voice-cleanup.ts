// lib/voice-cleanup.ts
//
// Žalias Whisper tekstas -> sutvarkytas, skaitomas lietuviškas tekstas per
// Claude API (esamas projekto `fetch` pattern'as — žr. app/api/translate).
//
// Saugumo principas (spec §9): ši funkcija NIEKADA nemeta — jei Claude
// nepasiekiamas ar grąžina klaidą, grąžinam bent žalią transkribuotą tekstą
// (geriau negu nieko; vartotojas vis tiek redaguos peržiūroje).

const MODEL = 'claude-sonnet-4-5'

const SYSTEM_PROMPT = `Tu redaguoji balsu padiktuotą tekstą lietuvių kalba — muzikos recenziją arba renginio apžvalgą. Tavo užduotis:
- sutaisyti transkripcijos klaidas ir skyrybą
- sutvarkyti į taisyklingą, skaitomą lietuvišką tekstą su pastraipomis
- IŠSAUGOTI autoriaus stilių, balsą ir nuomonę — netaisyk „gražiau", tik sutvarkyk
- NEPRIDĖTI jokių faktų, minčių ar informacijos, kurių nebuvo originale
- jei girdisi netikrumas dėl pavadinimo — palik kaip yra, nespėk
Grąžink TIK sutvarkytą tekstą, be jokių paaiškinimų ar preambulės.`

/**
 * Sutvarko žalią transkripciją. Visada grąžina tekstą — fallback į žalią
 * variantą bet kokios klaidos atveju.
 */
export async function cleanupTranscript(raw: string): Promise<string> {
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return trimmed // be rakto — grąžinam žalią

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: trimmed.slice(0, 12000) }],
      }),
    })

    const text = await res.text()
    if (!res.ok) return trimmed // klaida — fallback į žalią

    const data = JSON.parse(text)
    const out = data?.content?.[0]?.text?.trim()
    return out || trimmed
  } catch {
    return trimmed // tinklo/parse klaida — fallback į žalią
  }
}
