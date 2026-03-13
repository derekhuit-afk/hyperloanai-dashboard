import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require auth
const PUBLIC_ROUTES = [
  '/login', '/signup', '/onboarding', '/prequal', '/docs',
  '/auth/callback', '/auth/confirm',
]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Allow public routes
  const isPublic = PUBLIC_ROUTES.some(r => path.startsWith(r)) || path === '/'
  if (isPublic) return supabaseResponse

  // Redirect unauthenticated users to login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(loginUrl)
  }

  // Check onboarding complete for dashboard routes
  if (path.startsWith('/dashboard') || path === '/') {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_done')
      .eq('id', user.id)
      .single()

    if (profile && !profile.onboarding_done) {
      const onboardUrl = request.nextUrl.clone()
      onboardUrl.pathname = '/onboarding'
      return NextResponse.redirect(onboardUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
