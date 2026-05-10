// /favicon.ico — Chrome ir kai kurie kiti browser'iai užklausia šio path'o
// pirmiau už <link rel="icon"> tag'us. Default Next.js'e nėra to failo,
// tad atsakymas — homepage HTML, kurią browser'is traktuoja kaip nepavykus
// fetch ir naudoja CACHE'INTĄ Vercel default favicon'ą.
//
// Sprendimas: route handler grąžina mūsų SVG ikoną tiesiai su SVG
// content-type. Browser'iai (Chrome, Firefox, Safari) priima SVG favicon'us
// nepriklausomai nuo URL extension'o.

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0a0f1a"/>
  <g fill="#f97316">
    <rect x="5"  y="13" width="3.4" height="6"  rx="1.4"/>
    <rect x="10" y="9"  width="3.4" height="14" rx="1.4"/>
    <rect x="15" y="6"  width="3.4" height="20" rx="1.4"/>
    <rect x="20" y="11" width="3.4" height="10" rx="1.4"/>
    <rect x="25" y="14" width="3.4" height="4"  rx="1.4"/>
  </g>
</svg>`

export function GET() {
  return new Response(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
