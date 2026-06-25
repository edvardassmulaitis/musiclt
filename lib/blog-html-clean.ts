// lib/blog-html-clean.ts
//
// Migruotų music.lt įrašų turinyje liko senų „šiukšlinių" elementų:
//   • „Patinka? Spausk…" favorite-widget <table> blokai su javascript:favorite_a
//     nuorodomis ir /images/d/thumbs_gray_small.png paveiksliuku (relative path →
//     404 → redaktoriuje rodomas sulūžęs [?] vaizdas);
//   • kiti javascript: href'ai (mirę + nesaugūs).
// Šis valiklis naudojamas IR redaktoriuje (įkeliant turinį), IR viešame
// puslapyje (prieš dangerouslySetInnerHTML), kad rezultatas būtų vienodai švarus.
// Pure-regex (be DOM) — veikia ir serveryje, ir naršyklėje.

export function cleanLegacyBlogHtml(html: string | null | undefined): string {
  if (!html) return html || ''
  let out = html

  // 1) Visas legacy „favorite" widget <table> blokas (dažniausiai neuždarytas,
  //    likęs turinio gale). Atpažįstam pagal unikalius žymeklius; šalinam nuo
  //    <table> iki </table> arba teksto pabaigos.
  out = out.replace(
    /<table[^>]*>(?:(?!<\/table>)[\s\S])*?(?:javascript:favorite_|thumbs_gray_small|favorite_\d+_(?:img|link))[\s\S]*?(?:<\/table>|$)/gi,
    '',
  )

  // 2) Pavieniai mirę legacy paveiksliukai (favorite thumb), jei liko be table.
  out = out.replace(/<img[^>]*src="[^"]*thumbs_gray[^"]*"[^>]*>/gi, '')
  out = out.replace(/<img[^>]*\bid="favorite_[^"]*"[^>]*>/gi, '')

  // 3) javascript: nuorodos — išvyniojam (paliekam vidinį tekstą, jei toks yra).
  out = out.replace(/<a\b[^>]*href="javascript:[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 4) Tušti table griaučiai, likę po šalinimo.
  out = out.replace(/<table[^>]*>\s*(?:<tbody[^>]*>\s*)?(?:<tr[^>]*>\s*(?:<td[^>]*>\s*<\/td>\s*)*<\/tr>\s*)*(?:<\/tbody>\s*)?(?:<\/table>)?/gi, (m) => {
    const text = m.replace(/<[^>]+>/g, '').trim()
    return text ? m : ''
  })

  // 5) Nuvalom tuščius paragrafus / tarpus turinio gale.
  out = out.replace(/(?:\s|&nbsp;|<p>\s*<\/p>|<p><br\s*\/?><\/p>|<br\s*\/?>)+$/gi, '')

  return out
}
