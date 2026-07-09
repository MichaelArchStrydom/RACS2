import { NextRequest, NextResponse } from 'next/server'

// FIX: this used to also redirect '/login' -> '/' whenever a cookie was
// present, on the assumption that "has a cookie" means "is logged in". That
// assumption breaks the moment the cookie's session no longer exists in the
// DB (expired, revoked, or — as happened locally — pointing at a different
// database entirely): app/page.tsx's requireMember() would correctly bounce
// back to /login, but this rule would immediately bounce back to '/' again,
// forever. Proxy only checks cookie *presence* (it's meant for optimistic,
// DB-free checks — see Next.js's Proxy guide), so it can't tell a valid
// cookie from a stale one. That real validity check — and the "already
// logged in, skip the login page" redirect — now lives in app/login/page.tsx,
// which actually queries the session before deciding.
export function proxy(req: NextRequest) {
  const hasCookie = req.cookies.has('racs2_session')
  const isLoginPage = req.nextUrl.pathname === '/login'

  if (!hasCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
