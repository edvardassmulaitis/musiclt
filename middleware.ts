import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const { pathname } = url

  // Seni bendruomenės hub URL'ai → /atrasti (308). Hub'as: /atradimai (V1) →
  // /feed (2026-06-05) → /atrasti (2026-06-05 v2). Middleware'e, kad apeitų
  // Vercel edge cache'uotą seną statinį puslapį (page-lygio permanentRedirect
  // to nepadaro, nes serveris atiduoda cache HIT).
  if (pathname === '/atradimai' || pathname.startsWith('/atradimai/')) {
    const dest = url.clone()
    dest.pathname = pathname.replace(/^\/atradimai/, '/atrasti')
    return NextResponse.redirect(dest, 308)
  }
  if (pathname === '/feed' || pathname.startsWith('/feed/')) {
    const dest = url.clone()
    dest.pathname = pathname.replace(/^\/feed/, '/atrasti')
    return NextResponse.redirect(dest, 308)
  }

  // Foto reportažai iškelti iš naujienų į atskirą /galerija (2026-06-14).
  // Senas tipo landing'as → galerija.
  if (pathname === '/naujienos/tipas/foto') {
    const dest = url.clone()
    dest.pathname = '/galerija'
    return NextResponse.redirect(dest, 308)
  }
  // Seni foto reportažų straipsniai (/news/FOTO-REPORTAZAS-… arba /news/FOTO-GALERIJA-…)
  // → /galerija. Konvertuotus į konkretų reportažą sutvarko /api/galerija/resolve.
  if (/^\/news\/foto-(reporta[zž]as|galerija)-/i.test(pathname)) {
    const dest = url.clone()
    dest.pathname = '/galerija'
    dest.search = `?from=${encodeURIComponent(pathname.slice('/news/'.length))}`
    return NextResponse.redirect(dest, 308)
  }

  // Redirect /lt/daina/{slug}/{id}/ → /dainos/{slug}-{id}
  const trackMatch = pathname.match(/^\/lt\/daina\/(.+?)\/(\d+)\/?$/)
  if (trackMatch) {
    const dest = url.clone()
    dest.pathname = `/dainos/${trackMatch[1]}-${trackMatch[2]}`
    return NextResponse.redirect(dest, 301)
  }

  // Redirect /lt/albumas/{slug}/{id}/ → /albumai/{slug}-{id}
  const albumMatch = pathname.match(/^\/lt\/albumas\/(.+?)\/(\d+)\/?$/)
  if (albumMatch) {
    const dest = url.clone()
    dest.pathname = `/albumai/${albumMatch[1]}-${albumMatch[2]}`
    return NextResponse.redirect(dest, 301)
  }

  // Legacy music.lt vartotojo profilis: /user/<username> → /@<username> (301).
  // Skirta senosios sistemos nuorodų (pvz. music.lt/user/4Blackberry)
  // perkėlimui po domeno cutover'io.
  const legacyUser = pathname.match(/^\/user\/([^/]+)\/?$/)
  if (legacyUser) {
    const dest = url.clone()
    dest.pathname = `/@${legacyUser[1]}`
    dest.search = ''
    return NextResponse.redirect(dest, 301)
  }

  // Kanoninis profilio URL: /@<username>(/sub) → vidinis rewrite į
  // /vartotojas/<username>(/sub). URL adreso juostoje lieka /@<username>.
  const at = pathname.match(/^\/@([^/]+)(\/.*)?$/)
  if (at) {
    const dest = url.clone()
    dest.pathname = `/vartotojas/${at[1]}${at[2] || ''}`
    return NextResponse.rewrite(dest)
  }

  return NextResponse.next()
}

export const config = {
  // Visi page-route'ai, išskyrus Next interninius, API ir statinius failus
  // (failai su plėtiniu, pvz. .js/.css/.png). Reikalinga, kad /@<username>
  // ir /user/<username> patektų į middleware.
  matcher: ['/((?!_next/|api/|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)'],
}
