// Shared styles and constants for card templates

export const CARD_DIMENSIONS = {
  twitter: { width: 1200, height: 675 },
  instagram: { width: 1080, height: 1080 },
  linkedin: { width: 1200, height: 628 },
  portrait: { width: 1080, height: 1920 },
}

export const NEON_COLORS = {
  cyan: '#C3F23B',
  magenta: '#FF2D78',
  lime: '#2DD4BF',
  amber: '#FFB800',
  purple: '#8B5CF6',
  bg: '#0C1210',
  bgCard: '#111916',
  bgElevated: '#1A1A25',
  textPrimary: '#F0F0F5',
  textSecondary: '#AEB8B2',
  textMuted: '#60607A',
  border: '#2E3F39',
}

// Subtle distinct box colors for stat grid cards
export const BOX_COLORS = [
  { bg: '#0D1B2A', border: '#C3F23B25', accent: '#C3F23B' },   // Deep blue / cyan
  { bg: '#1A0D1F', border: '#FF2D7825', accent: '#FF2D78' },   // Deep purple / magenta
  { bg: '#0D1A12', border: '#2DD4BF25', accent: '#2DD4BF' },   // Deep green / lime
  { bg: '#1A1508', border: '#FFB80025', accent: '#FFB800' },    // Deep amber / gold
  { bg: '#120D1F', border: '#8B5CF625', accent: '#8B5CF6' },   // Deep indigo / purple
  { bg: '#0D1A1A', border: '#22D3EE25', accent: '#22D3EE' },   // Teal
  { bg: '#1A0D0D', border: '#EF444425', accent: '#EF4444' },   // Deep red
  { bg: '#0D1A0D', border: '#22C55E25', accent: '#22C55E' },   // Deep green
  { bg: '#1A170D', border: '#FBBF2425', accent: '#FBBF24' },   // Warm amber
]

export const FONTS = {
  heading: "'Space Grotesk', 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'Consolas', monospace",
  body: "'Inter', 'Segoe UI', sans-serif",
}

// Font scale factor based on canvas size relative to Twitter (base)
export function fontScale(dimensions = CARD_DIMENSIONS.twitter) {
  const baseArea = CARD_DIMENSIONS.twitter.width * CARD_DIMENSIONS.twitter.height
  const area = dimensions.width * dimensions.height
  const ratio = area / baseArea

  // Portrait (1080x1920) is ~2.56x Twitter area → scale up ~1.35x
  // Instagram (1080x1080) is ~1.44x Twitter area → scale up ~1.15x
  // LinkedIn is roughly same as Twitter → ~1.0x
  if (ratio > 2) return 1.35
  if (ratio > 1.2) return 1.15
  return 1.0
}

// Get scaled font size
export function scaledFont(basePx, dimensions) {
  return `${Math.round(basePx * fontScale(dimensions))}px`
}

// Get scaled pixel size (for avatars, spacing etc) — returns number not string
export function scaledSize(basePx, dimensions) {
  return Math.round(basePx * fontScale(dimensions))
}

export function cardContainerStyle(dimensions = CARD_DIMENSIONS.twitter) {
  return {
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    background: NEON_COLORS.bg,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: FONTS.body,
    color: NEON_COLORS.textPrimary,
  }
}

export function dotGridBackground() {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `radial-gradient(${NEON_COLORS.textMuted}22 1px, transparent 1px)`,
    backgroundSize: '20px 20px',
    pointerEvents: 'none',
    zIndex: 0,
  }
}

// Every exported card carries the site address so shares lead back here.
export const WATERMARK_TEXT = 'crickrida.com • Cricket via Stats'

export function watermarkStyle() {
  return {
    position: 'absolute',
    bottom: '20px',
    right: '32px',
    fontFamily: FONTS.mono,
    fontSize: '18px',
    color: NEON_COLORS.textMuted,
    letterSpacing: '0.05em',
    zIndex: 10,
  }
}

export function formatNumber(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString('en-IN')
}

export function formatDecimal(n, digits = 2) {
  if (n == null) return '-'
  return Number(n).toFixed(digits)
}
