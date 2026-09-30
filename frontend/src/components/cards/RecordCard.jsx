import { NEON_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, CARD_DIMENSIONS, scaledFont, WATERMARK_TEXT } from './cardStyles'

export default function RecordCard({ title, value, subtitle, description, dimensions = CARD_DIMENSIONS.twitter }) {
  const isPortrait = dimensions.height > dimensions.width
  const sf = (px) => scaledFont(px, dimensions)

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />

      <div style={{ height: '5px', background: `linear-gradient(90deg, ${NEON_COLORS.amber}, ${NEON_COLORS.lime})`, zIndex: 2 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: isPortrait ? '60px 48px' : '48px 64px', zIndex: 2, position: 'relative', textAlign: 'center' }}>
        <div style={{
          fontFamily: FONTS.mono, fontSize: sf(20), color: NEON_COLORS.amber,
          letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: isPortrait ? '40px' : '28px',
          padding: '12px 36px', border: `1px solid ${NEON_COLORS.amber}44`,
          borderRadius: '24px', background: `${NEON_COLORS.amber}0A`, fontWeight: 700,
        }}>
          {subtitle || 'Did you know?'}
        </div>

        <div style={{
          fontFamily: FONTS.heading, fontSize: sf(42), fontWeight: 600,
          color: '#F0F0F5', marginBottom: isPortrait ? '48px' : '24px', lineHeight: 1.4,
          maxWidth: '800px', wordWrap: 'break-word', overflowWrap: 'break-word',
        }}>
          {title || 'Record Title'}
        </div>

        <div style={{
          fontFamily: FONTS.mono, fontSize: sf(120), fontWeight: 700,
          color: '#C3F23B', lineHeight: 1, marginBottom: isPortrait ? '48px' : '24px',
          textShadow: `0 0 40px ${NEON_COLORS.cyan}33`,
        }}>
          {value || '0'}
        </div>

        <div style={{
          fontFamily: FONTS.body, fontSize: sf(26), color: '#F0F0F5',
          lineHeight: 1.5, maxWidth: '700px', wordWrap: 'break-word', overflowWrap: 'break-word',
          opacity: 0.85,
        }}>
          {description || 'Description of this incredible record.'}
        </div>
      </div>

      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
