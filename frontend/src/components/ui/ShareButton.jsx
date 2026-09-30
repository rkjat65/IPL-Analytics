import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { exportAsImage, downloadImage, copyToClipboard } from '../../utils/exportCard'

export default function ShareButton({ targetRef, filename = 'rkjat65-stat', className = '' }) {
  const [showModal, setShowModal] = useState(false)
  const [status, setStatus] = useState(null)
  const navigate = useNavigate()

  const handleDownload = useCallback(async () => {
    try {
      setStatus('Exporting...')
      const dataUrl = await exportAsImage(targetRef.current, filename, 'png')
      downloadImage(dataUrl, `${filename}.png`)
      setStatus('Downloaded!')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      setStatus('Export failed')
      console.error('Export failed:', err)
      setTimeout(() => setStatus(null), 2000)
    }
  }, [targetRef, filename])

  const handleCopy = useCallback(async () => {
    try {
      setStatus('Copying...')
      await copyToClipboard(targetRef.current)
      setStatus('Copied!')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      setStatus('Copy failed')
      console.error('Copy failed:', err)
      setTimeout(() => setStatus(null), 2000)
    }
  }, [targetRef])

  const handleOpenStudio = useCallback(() => {
    navigate('/content-studio')
    setShowModal(false)
  }, [navigate])

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Share trigger button */}
      <button
        onClick={() => setShowModal(!showModal)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg
          bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20
          hover:bg-accent-cyan/20 hover:border-accent-cyan/40 transition-all duration-200"
        title="Share / Export"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        Share
      </button>

      {/* Modal */}
      {showModal && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowModal(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl p-2">
            {status && (
              <div className="px-3 py-2 text-xs font-mono text-accent-cyan text-center mb-1">
                {status}
              </div>
            )}
            <button
              onClick={handleDownload}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card rounded-lg transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PNG
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card rounded-lg transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy to Clipboard
            </button>
            <div className="h-px bg-border-subtle my-1" />
            <button
              onClick={handleOpenStudio}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card rounded-lg transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Open Content Studio
            </button>
          </div>
        </>
      )}
    </div>
  )
}
