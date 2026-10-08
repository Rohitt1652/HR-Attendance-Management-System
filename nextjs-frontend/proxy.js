import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/favicon.ico'];

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/employee')) {
    const token = request.cookies.get('portal_token')?.value;
    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/employee/:path*', '/login'],
};
