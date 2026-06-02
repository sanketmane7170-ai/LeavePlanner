import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// JWT_SECRET must match the backend. Provided as a server-only env var (no
// NEXT_PUBLIC_ prefix) so it is never shipped to the browser.
const secret = process.env.JWT_SECRET
  ? new TextEncoder().encode(process.env.JWT_SECRET)
  : null;

const CHANGE_PASSWORD_PATH = '/employee/change-password';

function redirectToLogin(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', request.url));
  res.cookies.delete('jwt');
  return res;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path === '/login' || path === '/forgot-password' || path === '/contact-admin';

  const token = request.cookies.get('jwt')?.value;

  // No token → only public routes allowed
  if (!token) {
    return isPublicRoute ? NextResponse.next() : redirectToLogin(request);
  }

  // If the secret isn't configured we cannot verify — fail safe to login
  // (except on public routes) rather than trusting an unverified token.
  if (!secret) {
    return isPublicRoute ? NextResponse.next() : redirectToLogin(request);
  }

  // Cryptographically VERIFY the token (signature + expiry), not just decode it.
  let role: string;
  let isFirstLogin: boolean;
  try {
    const { payload } = await jwtVerify(token, secret);
    role = String(payload.role ?? '');
    isFirstLogin = payload.isFirstLogin === true;
  } catch {
    // Invalid/forged/expired token → treat as logged out
    return isPublicRoute ? NextResponse.next() : redirectToLogin(request);
  }

  // Authenticated users should not see the login/forgot pages
  if (isPublicRoute) {
    const dest = role === 'ADMIN' ? '/admin/dashboard' : '/employee/dashboard';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Force first-login employees to set a new password before anything else.
  // (Temp passwords are an employee-only flow; admins set their own at seed time.)
  if (isFirstLogin && role === 'EMPLOYEE' && path !== CHANGE_PASSWORD_PATH) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url));
  }

  // Role-based access control
  if (path.startsWith('/admin') && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/employee/dashboard', request.url));
  }
  if (path.startsWith('/employee') && role !== 'EMPLOYEE') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
