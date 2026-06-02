import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Define public routes
  const isPublicRoute = path === '/login' || path === '/forgot-password' || path === '/contact-admin';

  // Get token from cookies
  const token = request.cookies.get('jwt')?.value;

  // Redirect to login if accessing protected route without token
  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user is logged in, parse token role
  if (token) {
    try {
      // In Edge runtime, full JWT verification might need Jose library.
      // For basic routing, we decode the payload part of the JWT.
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
      
      const role = decodedPayload.role;

      // Redirect authenticated users away from login page
      if (isPublicRoute) {
        if (role === 'ADMIN') {
          return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        } else {
          return NextResponse.redirect(new URL('/employee/dashboard', request.url));
        }
      }

      // Role-based access control
      if (path.startsWith('/admin') && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/employee/dashboard', request.url));
      }

      if (path.startsWith('/employee') && role !== 'EMPLOYEE') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    } catch (e) {
      console.error('Error decoding token in middleware', e);
      // On error, just clear cookie and redirect to login
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('jwt');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
