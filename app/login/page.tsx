import AuthForm from '../components/AuthForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign In — HyperLoan AI' }

export default function LoginPage() {
  return <AuthForm mode="login" />
}
