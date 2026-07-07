import { NextRequest, NextResponse } from 'next/server'

export function proxy(req: NextRequest) {
  const hasCookie = req.cookies.has('racs2_session')
  const isLoginPage = req.nextUrl.pathname === '/login'

  if (!hasCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (hasCookie && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
