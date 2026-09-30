import { useState, useMemo, useEffect } from 'react'
import { apiUrl } from '../../lib/api'

// Singleton: fetched once, shared across all avatar instances
let _availableImages = null // Set of player names with images
let _fetchPromise = null

function fetchAvailableImages() {
  if (_availableImages) return Promise.resolve(_availableImages)
  if (_fetchPromise) return _fetchPromise
  _fetchPromise = fetch(apiUrl('/players/available-images'))
    .then(r => r.ok ? r.json() : [])
    .then(names => { _availableImages = new Set(names); return _availableImages })
    .catch(() => { _availableImages = new Set(); return _availableImages })
  return _fetchPromise
}

// Gradient pairs for avatar backgrounds based on player name hash
const GRADIENT_PAIRS = [
  ['#00E5FF', '#0066FF'],  // cyan → blue
  ['#FF2D78', '#FF6B00'],  // magenta → orange
  ['#B8FF00', '#00CC88'],  // lime → teal
  ['#FFB800', '#FF4500'],  // amber → red-orange
  ['#8B5CF6', '#EC4899'],  // purple → pink
  ['#06B6D4', '#3B82F6'],  // sky → blue
  ['#F59E0B', '#EF4444'],  // yellow → red
  ['#10B981', '#6366F1'],  // emerald → indigo
  ['#E879F9', '#6366F1'],  // fuchsia → indigo
  ['#22D3EE', '#A78BFA'],  // cyan → violet
]

function hashName(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function PlayerAvatar({
  name = '',
  imageUrl,
  teamColor,
  size = 48,
  className = '',
  showBorder = true,
  shape = 'circle',
  inline = false,
  style = {},
}) {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [resolvedUrl, setResolvedUrl] = useState(imageUrl || null)

  useEffect(() => {
    if (imageUrl) { setResolvedUrl(imageUrl); setImgError(false); setImgLoaded(false); return }
    if (!name) return
    // Fetch the available images list (single request, cached globally)
    fetchAvailableImages().then(available => {
      if (available.has(name)) {
        // Ask for a thumbnail at the rendered size (2x for sharp retina/exports)
        setResolvedUrl(`/api/players/${encodeURIComponent(name)}/image?w=${Math.min(512, Math.ceil(size * 2))}`)
        setImgError(false)
        setImgLoaded(false)
      } else {
        setResolvedUrl(null)
      }
    })
  }, [name, imageUrl, size])

  const { initials, gradient, fontSize } = useMemo(() => {
    const h = hashName(name)
    const pair = GRADIENT_PAIRS[h % GRADIENT_PAIRS.length]
    return {
      initials: getInitials(name),
      gradient: pair,
      fontSize: size < 32 ? size * 0.4 : size < 64 ? size * 0.38 : size * 0.32,
    }
  }, [name, size])

  const showImage = resolvedUrl && !imgError
  const borderRadius = shape === 'circle' ? '50%' : `${Math.max(size * 0.15, 6)}px`
  const borderColor = teamColor || gradient[0]

  // For inline card templates (uses style objects, no Tailwind)
  if (inline) {
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius,
        position: 'relative',
        flexShrink: 0,
        ...(showBorder ? {
          boxShadow: `0 0 ${size * 0.2}px ${borderColor}33, inset 0 0 ${size * 0.1}px ${borderColor}11`,
          border: `2px solid ${borderColor}88`,
        } : {}),
        ...style,
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius,
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: showImage && imgLoaded ? 0 : 1,
          transition: 'opacity 0.3s',
        }}>
          <span style={{
            fontSize: `${fontSize}px`,
            fontWeight: 700,
            color: '#0A0A0F',
            fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
            letterSpacing: '-0.02em',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
            userSelect: 'none',
          }}>
            {initials}
          </span>
        </div>

        {showImage && (
          <img
            src={resolvedUrl}
            alt={name}
            onError={() => setImgError(true)}
            onLoad={() => setImgLoaded(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              borderRadius,
              objectFit: 'cover',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
          />
        )}
      </div>
    )
  }

  // Tailwind version for regular pages
  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...(showBorder ? {
          boxShadow: `0 0 ${size * 0.2}px ${borderColor}33`,
          border: `2px solid ${borderColor}55`,
        } : {}),
        borderRadius,
        ...style,
      }}
    >
      <div
        className="w-full h-full flex items-center justify-center transition-opacity duration-300"
        style={{
          borderRadius,
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
          opacity: showImage && imgLoaded ? 0 : 1,
        }}
      >
        <span
          className="font-heading font-bold select-none"
          style={{
            fontSize: `${fontSize}px`,
            color: '#0A0A0F',
            letterSpacing: '-0.02em',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {initials}
        </span>
      </div>

      {showImage && (
        <img
          loading="lazy"
          decoding="async"
          src={resolvedUrl}
          alt={name}
          onError={() => setImgError(true)}
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{
            borderRadius,
            opacity: imgLoaded ? 1 : 0,
          }}
        />
      )}
    </div>
  )
}
