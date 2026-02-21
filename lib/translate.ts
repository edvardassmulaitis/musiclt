/**
 * Translation via server route /api/translate
 * Server uses ANTHROPIC_API_KEY env var set in Vercel
 */
export async function translateToLT(text: string): Promise<{ result: string; ok: boolean; error?: string }> {
  if (!text?.trim()) return { result: text, ok: false }

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    const data = await res.json()

    if (!res.ok || data.error) {
      return { result: text, ok: false, error: data.error || `HTTP_${res.status}` }
    }

    if (data.translated) {
      return { result: data.translated, ok: true }
    }

    return { result: text, ok: false, error: 'EMPTY_RESPONSE' }
  } catch (e: any) {
    return { result: text, ok: false, error: e.message }
  }
}
