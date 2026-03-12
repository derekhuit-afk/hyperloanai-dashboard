import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HyperLoan AI — Command Center',
  description: 'Huit AI Agent Operations Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
