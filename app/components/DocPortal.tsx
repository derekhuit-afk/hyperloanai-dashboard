'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

// ── TYPES ─────────────────────────────────────────────────────
interface DocFile {
  id: string
  original_filename: string
  file_size_bytes: number
  mime_type: string
}

interface ChecklistItem {
  type: string
  label: string
  desc: string
  category: string
  accept: string
  required: boolean
  uploaded: boolean
  files: DocFile[]
}

interface SessionData {
  session_id: string
  lead: { first_name: string; last_name: string; loan_purpose: string; employment_type: string; est_loan_amount?: number }
  checklist: ChecklistItem[]
  progress: { completed: number; total: number; pct: number }
  is_complete: boolean
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const API_BASE = `${SUPABASE_URL}/functions/v1/doc-upload`

const CAT_ICONS: Record<string, string>  = { income: '💵', identity: '🪪', assets: '🏦', property: '🏠', other: '📄' }
const CAT_LABELS: Record<string, string> = { income: 'Income Verification', identity: 'Identity', assets: 'Assets & Accounts', property: 'Property Documents', other: 'Additional Documents' }
const LOAN_PURPOSE_LABEL: Record<string, string> = { purchase: 'Purchase', refinance: 'Refinance', cashout: 'Cash-Out', investment: 'Investment' }

function fmtSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── TOAST ─────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: string; show: boolean }>({ msg: '', type: '', show: false })
  const timerRef = useRef<NodeJS.Timeout>()
  const show = useCallback((msg: string, type = '') => {
    clearTimeout(timerRef.current)
    setToast({ msg, type, show: true })
    timerRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3500)
  }, [])
  return { toast, show }
}

// ── DROP ZONE COMPONENT ───────────────────────────────────────
function DropZone({ docType, accept, uploading, onFiles }: {
  docType: string; accept: string; uploading: boolean; onFiles: (files: File[]) => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); onFiles(Array.from(e.dataTransfer.files)) }}
      style={{
        position: 'relative', border: `1.5px dashed ${dragging || uploading ? '#c9922a' : '#eae8e3'}`,
        borderRadius: '8px', padding: '24px 16px', textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
        background: dragging || uploading ? '#f5e4c0' : '#f9f7f4', transition: 'all 0.18s',
      }}
    >
      <input type="file" accept={accept} multiple disabled={uploading}
        onChange={e => { onFiles(Array.from(e.target.files ?? [])); (e.target as HTMLInputElement).value = '' }}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: uploading ? 'wait' : 'pointer', width: '100%', height: '100%' }}
      />
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📎</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0d1b2a', marginBottom: '4px' }}>
        {uploading ? 'Uploading...' : 'Drop files here or browse'}
      </div>
      <div style={{ fontSize: '12px', color: '#8a9bb0' }}>PDF, JPG, PNG — up to 25MB each</div>
    </div>
  )
}

// ── DOC CARD COMPONENT ────────────────────────────────────────
function DocCard({ item, onUpload, onRemove }: {
  item: ChecklistItem & { localFiles?: DocFile[] }
  onUpload: (files: File[]) => void
  onRemove: (fileId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const files = item.localFiles ?? item.files ?? []
  const isComplete = files.length > 0

  async function handleFiles(rawFiles: File[]) {
    setUploading(true)
    setOpen(true)
    for (let i = 0; i < rawFiles.length; i++) {
      setUploadPct(Math.round(100 * i / rawFiles.length))
      await onUpload([rawFiles[i]])
    }
    setUploadPct(100)
    await new Promise(r => setTimeout(r, 400))
    setUploading(false)
    setUploadPct(0)
  }

  return (
    <div style={{
      background: '#fff', border: `1px solid ${isComplete ? 'rgba(30,122,85,0.3)' : '#eae8e3'}`,
      borderRadius: '10px', overflow: 'hidden', marginBottom: '8px',
      boxShadow: '0 1px 4px rgba(13,27,42,0.12)', transition: 'box-shadow 0.18s',
    }}>
      {/* Header */}
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ width: 42, height: 42, borderRadius: '8px', background: isComplete ? '#e4f4ec' : '#eae8e3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
          {CAT_ICONS[item.category] ?? '📄'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0d1b2a', lineHeight: 1.2 }}>{item.label}</div>
          <div style={{ fontSize: '12px', color: '#8a9bb0', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '99px', background: isComplete ? '#e4f4ec' : '#eae8e3', color: isComplete ? '#1e7a55' : '#8a9bb0', whiteSpace: 'nowrap' }}>
            {isComplete ? `✓ ${files.length} file${files.length > 1 ? 's' : ''}` : 'Needed'}
          </span>
          <span style={{ fontSize: '12px', color: '#8a9bb0', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop: '1px solid #eae8e3', padding: '16px 20px 20px' }}>
          {/* Uploaded files */}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#e4f4ec', borderRadius: '8px', border: '1px solid rgba(30,122,85,0.2)' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{f.mime_type?.startsWith('image') ? '🖼️' : '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#0d1b2a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.original_filename}</div>
                    <div style={{ fontSize: '11px', color: '#8a9bb0', marginTop: '1px' }}>{fmtSize(f.file_size_bytes)}</div>
                  </div>
                  <span onClick={() => onRemove(f.id)} style={{ fontSize: '13px', color: '#8a9bb0', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>✕</span>
                </div>
              ))}
            </div>
          )}

          <DropZone docType={item.type} accept={item.accept} uploading={uploading} onFiles={handleFiles} />

          {uploading && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ height: '4px', background: '#eae8e3', borderRadius: '99px', overflow: 'hidden', marginBottom: '6px' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #c9922a, #9e6d12)', width: `${uploadPct}%`, transition: 'width 0.2s', borderRadius: '99px' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#8a9bb0', textAlign: 'center' }}>Uploading...</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
export default function DocPortal() {
  const searchParams = useSearchParams()
  const token = searchParams.get('t') ?? searchParams.get('token')

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [session, setSession]   = useState<SessionData | null>(null)
  // Local file state overlaid on checklist
  const [localFiles, setLocalFiles] = useState<Record<string, DocFile[]>>({})
  const [isComplete, setIsComplete] = useState(false)
  const { toast, show: showToast } = useToast()

  // ── LOAD SESSION ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setError('No upload link found. Please use the link from your loan officer.'); setLoading(false); return }
    fetch(`${API_BASE}?token=${token}`, { headers: { Authorization: `Bearer ${SUPABASE_ANON}` } })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setSession(data)
        // Seed local files from API
        const init: Record<string, DocFile[]> = {}
        data.checklist.forEach((d: ChecklistItem) => { init[d.type] = d.files ?? [] })
        setLocalFiles(init)
        setIsComplete(data.is_complete)
      })
      .catch(() => setError('Connection error — please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  // ── UPLOAD ────────────────────────────────────────────────────
  const handleUpload = useCallback(async (docType: string, files: File[]) => {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { showToast(`${file.name} too large (max 25MB)`, 'error'); continue }
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${API_BASE}?token=${token}&type=${docType}`, {
          method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON}` }, body: fd,
        })
        const result = await res.json()
        if (!res.ok || result.error) { showToast(result.error ?? 'Upload failed', 'error'); continue }

        const newFile: DocFile = {
          id: result.doc_id, original_filename: file.name,
          file_size_bytes: file.size, mime_type: file.type,
        }
        setLocalFiles(prev => ({ ...prev, [docType]: [...(prev[docType] ?? []), newFile] }))
        showToast(`${file.name} uploaded ✓`, 'success')
        if (result.all_complete) setIsComplete(true)
      } catch { showToast(`Upload failed for ${file.name}`, 'error') }
    }
  }, [token, showToast])

  // ── REMOVE ────────────────────────────────────────────────────
  const handleRemove = useCallback(async (docType: string, fileId: string) => {
    if (!confirm('Remove this document?')) return
    try {
      const res = await fetch(`${API_BASE}?token=${token}&doc=${fileId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${SUPABASE_ANON}` },
      })
      if (res.ok) {
        setLocalFiles(prev => ({ ...prev, [docType]: (prev[docType] ?? []).filter(f => f.id !== fileId) }))
        setIsComplete(false)
        showToast('Document removed', 'success')
      } else { showToast('Could not remove document', 'error') }
    } catch { showToast('Could not remove document', 'error') }
  }, [token, showToast])

  // ── PROGRESS ──────────────────────────────────────────────────
  const checklist = session?.checklist ?? []
  const total     = checklist.length
  const completed = checklist.filter(d => (localFiles[d.type]?.length ?? 0) > 0).length
  const pct       = total > 0 ? Math.round(100 * completed / total) : 0

  // ── GROUP BY CATEGORY ────────────────────────────────────────
  const byCategory: Record<string, ChecklistItem[]> = {}
  checklist.forEach(d => { const c = d.category ?? 'other'; if (!byCategory[c]) byCategory[c] = []; byCategory[c].push(d) })
  const catOrder = ['identity', 'income', 'assets', 'property', 'other']

  const C = styles

  if (loading) return (
    <div style={C.loadingScreen}>
      <div style={C.loaderRing} />
      <div style={C.loadingText}>Loading your portal...</div>
    </div>
  )

  return (
    <div style={C.root}>
      {/* TOAST */}
      <div style={{ ...C.toast, ...(toast.show ? C.toastShow : {}), ...(toast.type === 'success' ? C.toastSuccess : toast.type === 'error' ? C.toastError : {}) }}>
        {toast.msg}
      </div>

      {/* TOPBAR */}
      <header style={C.topbar}>
        <div style={C.topbarBrand}>
          <div style={C.brandGem}>◆</div>
          <span style={C.brandName}>HyperLoan AI</span>
        </div>
        <div style={C.topbarSecure}>🔒 Secure Document Portal</div>
      </header>

      {/* MAIN */}
      <main style={C.main}>
        {error ? (
          <div style={C.errorScreen}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔒</div>
            <div style={C.errorTitle}>Link Invalid</div>
            <div style={C.errorSub}>{error}</div>
          </div>
        ) : session && (
          <>
            {/* HERO */}
            <div style={C.hero}>
              <div style={C.eyebrow}>Document Upload</div>
              <div style={C.heroTitle}>Secure Document<br/>Upload Portal</div>
              <div style={C.heroSub}>Upload your documents below. Bank-level 256-bit encryption. Only your loan officer can access these files.</div>
              <div style={C.borrowerBadge}>
                <div style={C.badgeDot} />
                {session.lead.first_name} {session.lead.last_name} — {LOAN_PURPOSE_LABEL[session.lead.loan_purpose] ?? 'Mortgage'} Loan
              </div>
            </div>

            {/* PROGRESS */}
            <div style={C.progressCard}>
              <div style={C.progressHeader}>
                <span style={C.progressLabel}>{pct === 100 ? '✓ All Documents Complete' : 'Documents Required'}</span>
                <span style={C.progressCount}>{completed} of {total} complete</span>
              </div>
              <div style={C.progressTrack}>
                <div style={{ ...C.progressFill, width: `${pct}%`, background: pct === 100 ? 'linear-gradient(90deg, #1e7a55, #16a364)' : 'linear-gradient(90deg, #c9922a, #9e6d12)' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                {checklist.map(d => {
                  const done = (localFiles[d.type]?.length ?? 0) > 0
                  return (
                    <span key={d.type} style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', background: done ? '#e4f4ec' : '#eae8e3', color: done ? '#1e7a55' : '#8a9bb0' }}>
                      {d.label.split(' ')[0]}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* DOC SECTIONS */}
            {catOrder.map(cat => {
              if (!byCategory[cat]) return null
              return (
                <div key={cat} style={{ marginBottom: '24px' }}>
                  <div style={C.sectionLabel}>{CAT_LABELS[cat]}</div>
                  {byCategory[cat].map(item => (
                    <DocCard
                      key={item.type}
                      item={{ ...item, localFiles: localFiles[item.type] ?? item.files ?? [] }}
                      onUpload={files => handleUpload(item.type, files)}
                      onRemove={fileId => handleRemove(item.type, fileId)}
                    />
                  ))}
                </div>
              )
            })}

            {/* COMPLETE BANNER */}
            {isComplete && (
              <div style={C.completeBanner}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
                <div style={C.completeTitle}>All Documents Received</div>
                <div style={C.completeSub}>Your loan officer has been notified and will review your file. You'll hear from us within 1 business day.</div>
                <div style={C.divider} />
                <div style={C.nextStepsLabel}>What Happens Next</div>
                {['Your loan officer reviews your documents (1–2 business days)', 'We may request additional items if needed', 'Pre-approval letter issued once everything clears', 'Your LO contacts you to discuss next steps'].map((s, i) => (
                  <div key={i} style={C.nextStep}>
                    <div style={C.nextStepNum}>{i + 1}</div>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer style={C.footer}>
        {['🔒 256-bit encryption', '🛡️ SOC 2 compliant', '📋 NMLS #203980', '🔐 Private & secure'].map(item => (
          <span key={item} style={C.footerItem}>{item}</span>
        ))}
      </footer>
    </div>
  )
}

// ── STYLES ────────────────────────────────────────────────────
const styles = {
  root:          { display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '100dvh', background: '#f9f7f4', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#0d1b2a' },
  loadingScreen: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '16px', background: '#f9f7f4' },
  loaderRing:    { width: '40px', height: '40px', border: '3px solid #eae8e3', borderTopColor: '#c9922a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText:   { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#0d1b2a' },
  topbar:        { background: '#0d1b2a', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky' as const, top: 0, zIndex: 100, boxShadow: '0 1px 0 rgba(201,146,42,0.3)' },
  topbarBrand:   { display: 'flex', alignItems: 'center', gap: '10px' },
  brandGem:      { width: 28, height: 28, background: 'linear-gradient(135deg, #c9922a, #9e6d12)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px' },
  brandName:     { fontFamily: 'system-ui', fontSize: '13px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.9)' },
  topbarSecure:  { fontSize: '11px', fontWeight: 500, color: '#8a9bb0', letterSpacing: '0.5px' },
  main:          { maxWidth: '720px', width: '100%', margin: '0 auto', padding: '32px 20px 48px' },
  hero:          { marginBottom: '32px' },
  eyebrow:       { fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#c9922a', marginBottom: '8px' },
  heroTitle:     { fontFamily: 'Georgia, serif', fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 500, color: '#0d1b2a', lineHeight: 1.2, marginBottom: '10px' },
  heroSub:       { fontSize: '14px', color: '#5a6e84', lineHeight: 1.6, maxWidth: '520px' },
  borrowerBadge: { display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '16px', background: '#0d1b2a', color: 'rgba(255,255,255,0.85)', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 },
  badgeDot:      { width: '6px', height: '6px', borderRadius: '50%', background: '#c9922a', flexShrink: 0 },
  progressCard:  { background: '#fff', border: '1px solid #eae8e3', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(13,27,42,0.12)', display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  progressHeader:{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  progressLabel: { fontSize: '13px', fontWeight: 600, color: '#0d1b2a' },
  progressCount: { fontSize: '12px', color: '#8a9bb0', fontWeight: 500 },
  progressTrack: { height: '6px', background: '#eae8e3', borderRadius: '99px', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: '99px', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' },
  sectionLabel:  { fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#8a9bb0', padding: '0 4px', marginBottom: '10px' },
  completeBanner:{ background: 'linear-gradient(135deg, #0d1b2a, #162236)', borderRadius: '10px', padding: '28px 24px', color: 'white', marginTop: '8px' },
  completeTitle: { fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: 500, marginBottom: '8px', color: '#f5e4c0' },
  completeSub:   { fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: '20px' },
  divider:       { height: '1px', background: 'rgba(201,146,42,0.3)', margin: '20px 0' },
  nextStepsLabel:{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#8a9bb0', marginBottom: '12px' },
  nextStep:      { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' },
  nextStepNum:   { width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(201,146,42,0.2)', border: '1px solid rgba(201,146,42,0.4)', color: '#c9922a', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' },
  footer:        { background: '#0d1b2a', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' as const },
  footerItem:    { fontSize: '12px', color: '#8a9bb0', fontWeight: 500 },
  errorScreen:   { padding: '48px 24px', textAlign: 'center' as const, maxWidth: '440px', margin: '0 auto' },
  errorTitle:    { fontFamily: 'Georgia, serif', fontSize: '24px', color: '#0d1b2a', marginBottom: '8px' },
  errorSub:      { fontSize: '14px', color: '#5a6e84', lineHeight: 1.6 },
  toast:         { position: 'fixed' as const, bottom: '24px', left: '50%', transform: 'translateX(-50%) translateY(80px)', background: '#0d1b2a', color: 'white', padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, boxShadow: '0 12px 48px rgba(13,27,42,0.24)', zIndex: 300, whiteSpace: 'nowrap' as const, transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' },
  toastShow:     { transform: 'translateX(-50%) translateY(0)' },
  toastSuccess:  { background: '#1e7a55' },
  toastError:    { background: '#c0392b' },
}
