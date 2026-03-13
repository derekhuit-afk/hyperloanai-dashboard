import type { Metadata } from 'next'
import DocPortal from '../components/DocPortal'

export const metadata: Metadata = {
  title: 'Secure Document Upload — HyperLoan AI',
  description: 'Upload your mortgage documents securely.',
}

export default function DocsPage() {
  return <DocPortal />
}
