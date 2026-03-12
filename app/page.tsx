import { Suspense } from 'react'
import Dashboard from './components/Dashboard'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ background: '#070a0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', color: '#4a6280', letterSpacing: '3px', fontSize: '12px' }}>LOADING COMMAND CENTER...</div>}>
      <Dashboard />
    </Suspense>
  )
}
