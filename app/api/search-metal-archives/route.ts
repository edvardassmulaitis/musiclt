import { NextRequest, NextResponse } from 'next/server'

// Paieška: https://www.metal-archives.com/search/ajax-band-search/?field=name&query=X&sEcho=1
// Grupės puslapis: https://www.metal-archives.com/bands/BandName/BAND_ID
// Nuotrauka: https://www.metal-archives.com/images/BAND_ID_t.jpg (ne visada yra)

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const bandId = req.nextUrl.searchParams.get('bandId')?.trim()

  // Jei bandId — grąžinti detalią info (veiklos metai, aprašymas, nuotrauka)
  if (bandId) {
    return fetchBandDetails(bandId)
  }

  // Paieška
  if (!q || q.length < 2) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${encodeURIComponent(q)}&sEcho=1&iColumns=3&iDisplayStart=0&iDisplayLength=10`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*',
          'Referer': 'https://www.metal-archives.com/',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `Metal Archives klaida: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()

    // aaData: [["<a href='...bands/Name/ID'>Name</a>", "Genre", "Country"], ...]
    const results = (data.aaData || []).map((row: string[]) => {
      const nameHtml = row[0] || ''
      const genre = row[1] || ''
      const country = row[2] || ''

      // Ištraukti pavadinimą ir ID iš HTML
      const nameMatch = nameHtml.match(/>([^<]+)<\/a>/)
      const idMatch = nameHtml.match(/\/bands\/[^/]+\/(\d+)/)
      const urlMatch = nameHtml.match(/href="([^"]+)"/)

      const name = nameMatch?.[1] || ''
      const id = idMatch?.[1] || ''
      const url = urlMatch?.[1] || ''

      return { name, id, url, genre, country }
    }).filter((r: any) => r.name && r.id)

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function fetchBandDetails(bandId: string) {
  try {
    // Reikia URL su pavadinimu — naudojame placeholder (MA redirect'ina)
    const res = await fetch(
      `https://www.metal-archives.com/bands/_/${bandId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Referer': 'https://www.metal-archives.com/',
        },
      }
    )

    if (!res.ok) return NextResponse.json({ error: `Klaida: ${res.status}` }, { status: 500 })

    const html = await res.text()

    // Veiklos metai
    const yearsMatch = html.match(/Years active:<\/dt>\s*<dd[^>]*>([^<]+)/)
    const years = yearsMatch?.[1]?.trim() || ''

    // Įkūrimo metai
    const formedMatch = html.match(/Formed in:<\/dt>\s*<dd[^>]*>([^<]+)/)
    const formed = formedMatch?.[1]?.trim() || ''

    // Tematika
    const themesMatch = html.match(/Themes:<\/dt>\s*<dd[^>]*>([^<]+)/)
    const themes = themesMatch?.[1]?.trim() || ''

    // Etiketė
    const labelMatch = html.match(/Last label:<\/dt>\s*<dd[^>]*><[^>]+>([^<]+)/)
    const label = labelMatch?.[1]?.trim() || ''

    // Aprašymas (jei yra wiki sekcija)
    const descMatch = html.match(/<div class="band_comment[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    let description = ''
    if (descMatch) {
      description = descMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
    }

    // Nuotrauka — MA saugo pagal ID
    // Pattern: /images/bands/X/Y/Z/bandId_photo1.jpg arba tiesiog bandId_t.jpg
    const photoMatch = html.match(/id="photo"[^>]*src="([^"]+)"/)
    const photo = photoMatch?.[1] || ''

    // Logotipas
    const logoMatch = html.match(/id="logo"[^>]*src="([^"]+)"/)
    const logo = logoMatch?.[1] || ''

    return NextResponse.json({ formed, years, themes, label, description, photo, logo })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
