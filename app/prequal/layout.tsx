import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mortgage Pre-Qualification — HyperLoan AI',
  description: 'Find out what you qualify for in under 60 seconds. No credit check required.',
  openGraph: {
    title: 'Find Out What You Qualify For',
    description: '60-second mortgage pre-qualification. No credit pull. Free results.',
    type: 'website',
  }
}

export default function PrequalLayout({ children }: { children: React.ReactNode }) {
  return children
}
