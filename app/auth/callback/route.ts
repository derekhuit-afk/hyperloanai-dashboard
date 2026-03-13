import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code         = searchParams.get('code')
  const token_hash   = searchParams.get('token_hash')
  const type         = searchParams.get('type')
  const next         = searchParams.get('next') ?? '/dashboard'
  const onboardToken = searchParams.get('onboard_token')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch {}
          })
        },
      },
    }
  )

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type: type as any, token_hash })
    if (!error) {
      const redirectTo = onboardToken
        ? `${origin}/onboarding?token=${onboardToken}`
        : `${origin}${next}`
      return NextResponse.redirect(redirectTo)
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
