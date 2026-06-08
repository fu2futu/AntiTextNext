import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/admin';

const ACCESS_VISITOR_COOKIE = 'textnext_visitor_id';

const isAdminBasicAuthConfigured = () =>
  Boolean(process.env.ADMIN_BASIC_USER && process.env.ADMIN_BASIC_PASSWORD);

const verifyAdminBasicAuth = (request: NextRequest) => {
  if (!isAdminBasicAuthConfigured()) return true;

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = atob(authorization.slice('Basic '.length));
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return (
      user === process.env.ADMIN_BASIC_USER &&
      password === process.env.ADMIN_BASIC_PASSWORD
    );
  } catch {
    return false;
  }
};

const adminBasicAuthResponse = () =>
  new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="TextNext Admin", charset="UTF-8"',
    },
  });

const shouldTrackAccess = (request: NextRequest, pathname: string) => {
  if (request.method !== 'GET') return false;
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) return false;
  if (request.headers.get('next-router-prefetch') === '1') return false;
  if (request.headers.get('purpose') === 'prefetch') return false;
  if (request.headers.get('sec-purpose')?.includes('prefetch')) return false;

  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
};

const hashVisitorId = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=()'
  );

  const { data: { session } } = await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith('/admin');

  if (shouldTrackAccess(request, pathname)) {
    let visitorId = request.cookies.get(ACCESS_VISITOR_COOKIE)?.value;

    if (!visitorId) {
      visitorId = crypto.randomUUID();
      response.cookies.set({
        name: ACCESS_VISITOR_COOKIE,
        value: visitorId,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    const visitorSource = session?.user?.id ? `user:${session.user.id}` : `anon:${visitorId}`;
    const visitorHash = await hashVisitorId(visitorSource);
    const { error } = await (supabase as any).rpc('increment_site_access', {
      target_visitor_hash: visitorHash,
      target_time: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to track site access:', error);
    }
  }

  // 除外パス（これらのページはリダイレクトしない）
  const excludedPaths = [
    '/auth/login',
    '/auth/signup',
    '/auth/callback',
    '/auth/forgot-password',
    '/auth/update-password',
    '/auth/setup-profile',
    '/auth/add-to-home',
    '/api/',
    '/contact',
    '/settings',
  ];

  const isExcluded = excludedPaths.some(path => pathname.startsWith(path));

  if (isAdminRoute) {
    if (!verifyAdminBasicAuth(request)) {
      return adminBasicAuthResponse();
    }

    if (!session?.user) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const isAdmin = await isCurrentUserAdmin(supabase as any);

    if (!isAdmin) {
      return NextResponse.redirect(new URL('/profile', request.url));
    }
  }

  // セッションがあり、除外パスでない場合の処理（制限チェックやプロフィール未設定チェック）は
  // パフォーマンスのためクライアントの auth-provider.tsx で非同期に行います。
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icons (PWA icons)
     * - manifest.json
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json).*)',
  ],
};
