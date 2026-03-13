import AuthForm from '../components/AuthForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Create Account — HyperLoan AI' }

interface Props {
  searchParams: Promise<{ invite?: string; token?: string; email?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams
  return (
    <AuthForm
      mode="signup"
      inviteToken={params.invite ?? null}
      onboardToken={params.token ?? null}
      prefillEmail={params.email ? decodeURIComponent(params.email) : null}
    />
  )
}
