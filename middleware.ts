import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const { pathname } = url

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
