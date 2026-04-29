import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const url = req.nextUrl

  // Redirect /lt/daina/{slug}/{id}/ → /dainos/{slug}-{id}
  const trackMatch = url.pathname.match(/^\/lt\/daina\/(.+?)\/(\d+)\/?$/)
  if (trackMatch) {
    const dest = url.clone()
    dest.pathname = `/dainos/${trackMatch[1]}-${trackMatch[2]}`
    return NextResponse.redirect(dest, 301)
  }

  // Redirect /lt/albumas/{slug}/{id}/ → /albumai/{slug}-{id}
  const albumMatch = url.pathname.match(/^\/lt\/albumas\/(.+?)\/(\d+)\/?$/)
  if (albumMatch) {
    const dest = url.clone()
    dest.pathname = `/albumai/${albumMatch[1]}-${albumMatch[2]}`
    return NextResponse.redirect(dest, 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/lt/daina/:path*', '/lt/albumas/:path*'],
}
