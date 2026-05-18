/**
 * DOCX press release tekstą extract'inimas.
 *
 * Press release email'ai dažnai turi .docx attachment'ą su pilnu pranešimu —
 * profesinaliai parašytas tekstas su antrašte. Mūsų pipeline'ui geriau naudoti
 * docx turinį (ne email subject + body), nes:
 *   - .docx headline jau editorialinis (admin'as ją mato kaip yra)
 *   - body išplėstinis, profesionalus, mažai redagavimo
 *   - Email body kartais tik trumpa "look at attachment" žinutė
 *
 * Naudojam `mammoth` lib'ą — Word document parser, extract'ina plain text
 * arba HTML. Ignoruoja images, tables (kol kas).
 */

import mammoth from 'mammoth'

export interface ExtractedDocx {
  title: string | null         // pirma heading arba pirma eilutė (jei panaši į antraštę)
  body_html: string            // paragraphų <p> HTML
  body_text: string            // plain text be HTML
  has_content: boolean         // false jei docx tuščias arba nepavyko parse'int
}

const EMPTY: ExtractedDocx = {
  title: null,
  body_html: '',
  body_text: '',
  has_content: false,
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Pagrindinis entry — gauni Buffer (iš Gmail API attachment), grąžini struct'ą.
 *
 * Strategija:
 *   1) mammoth.convertToHtml — gauna HTML su h1/h2/p tag'ais
 *   2) Pirma <h1>/<h2> arba pirma eilutė (jei žiūri kaip antraštė) — title
 *   3) Visi <p> + <h*> kombinuoti į body_html
 *   4) plain text variantas — mammoth.extractRawText
 */
export async function extractDocxFromBuffer(buf: Buffer): Promise<ExtractedDocx> {
  try {
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ buffer: buf }),
      mammoth.extractRawText({ buffer: buf }),
    ])

    const rawHtml = (htmlResult.value || '').trim()
    const rawText = (textResult.value || '').trim()

    if (!rawText) return EMPTY

    // Title extraction
    let title: string | null = null

    // Pirma — žiūrim ar yra h1/h2 tag'ų
    const headingMatch = rawHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
    if (headingMatch) {
      title = headingMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200)
    }

    // Jei heading'o nėra, naudojam pirmą "ne tuščią" eilutę kaip antraštę
    // jei ji palyginti trumpa (< 200 chars) ir nesibaigia tašku (= antraštės požymis)
    if (!title) {
      const firstLine = rawText.split(/\n/).map(l => l.trim()).find(l => l.length > 0) || ''
      if (firstLine.length > 5 && firstLine.length < 200 && !firstLine.endsWith('.')) {
        title = firstLine
      }
    }

    // Body HTML — jei mammoth gavo HTML, naudojam (jau turi paragraphus + headings).
    // Jei ne — fallback iš rawText su <p> per paragraph.
    let bodyHtml = rawHtml
    if (!bodyHtml || bodyHtml.length < 50) {
      bodyHtml = rawText
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('\n')
    }

    return {
      title,
      body_html: bodyHtml,
      body_text: rawText,
      has_content: rawText.length > 50,  // ne tuščias docs
    }
  } catch (e: any) {
    console.warn('[docx-extract] failed:', e?.message || e)
    return EMPTY
  }
}
