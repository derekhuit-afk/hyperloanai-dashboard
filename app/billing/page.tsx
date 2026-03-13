import type { Metadata } from 'next'
import BillingPage from '../components/BillingPage'

export const metadata: Metadata = {
  title: 'Billing & Plans — HyperLoan AI',
}

export default function Billing() {
  return <BillingPage />
}
