import type { Metadata } from 'next'
import OnboardingWizard from '../components/OnboardingWizard'

export const metadata: Metadata = { title: 'Account Setup — HyperLoan AI' }

export default function OnboardingPage() {
  return <OnboardingWizard />
}
