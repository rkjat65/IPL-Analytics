import { NEON_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, CARD_DIMENSIONS, scaledFont, WATERMARK_TEXT } from './cardStyles'
import { getTeamColor, getTeamAbbr } from '../../constants/teams'

export default function MatchSummaryCard({ team1, team2, team1Score, team2Score, winner, margin, venue, date, potm, dimensions = CARD_DIMENSIONS.twitter }) {
  const t1Color = getTeamColor(team1)
  const t2Color = getTeamColor(team2)
  const t1Abbr = getTeamAbbr(team1)
  const t2Abbr = getTeamAbbr(team2)
  const isT1Winner = winner === team1
  const isPortrait = dimensions.height > dimensions.width
  const sf = (px) => scaledFont(px, dimensions)

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />

      <div style={{ height: '5px', background: `linear-gradient(90deg, ${t1Color}, ${t2Color})`, zIndex: 2 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: isPortrait ? '40px 40px 56px 40px' : '40px 56px 48px 56px', zIndex: 2, position: 'relative' }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: sf(18), color: '#F0F0F5', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 700, opacity: 0.7, textAlign: 'center' }}>
          Match Summary
        </div>

        {/* Teams & Scores */}
        <div style={{ display: 'flex', flexDirection: isPortrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isPortrait ? '32px' : '48px', flex: 1 }}>
          <div style={{ textAlign: 'center', flex: isPortrait ? undefined : 1 }}>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(28), fontWeight: 600, color: isT1Winner ? '#F0F0F5' : NEON_COLORS.textSecondary, marginBottom: '10px', lineHeight: 1.3 }}>
              {team1 || 'Team 1'}
            </div>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(40), fontWeight: 700, color: t1Color, letterSpacing: '0.05em', marginBottom: '14px' }}>
              {t1Abbr}
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(64), fontWeight: 700, color: isT1Winner ? '#00E5FF' : NEON_COLORS.textSecondary, lineHeight: 1, textShadow: isT1Winner ? '0 0 30px rgba(0,229,255,0.2)' : 'none' }}>
              {team1Score || '-'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: isPortrait ? 'row' : 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: isPortrait ? '60px' : '2px', height: isPortrait ? '2px' : '60px', background: NEON_COLORS.border }} />
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(28), fontWeight: 700, color: '#F0F0F5', opacity: 0.5 }}>VS</div>
            <div style={{ width: isPortrait ? '60px' : '2px', height: isPortrait ? '2px' : '60px', background: NEON_COLORS.border }} />
          </div>

          <div style={{ textAlign: 'center', flex: isPortrait ? undefined : 1 }}>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(28), fontWeight: 600, color: !isT1Winner ? '#F0F0F5' : NEON_COLORS.textSecondary, marginBottom: '10px', lineHeight: 1.3 }}>
              {team2 || 'Team 2'}
            </div>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(40), fontWeight: 700, color: t2Color, letterSpacing: '0.05em', marginBottom: '14px' }}>
              {t2Abbr}
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(64), fontWeight: 700, color: !isT1Winner ? '#00E5FF' : NEON_COLORS.textSecondary, lineHeight: 1, textShadow: !isT1Winner ? '0 0 30px rgba(0,229,255,0.2)' : 'none' }}>
              {team2Score || '-'}
            </div>
          </div>
        </div>

        {/* Result */}
        <div style={{ textAlign: 'center', fontFamily: FONTS.heading, fontSize: sf(28), fontWeight: 600, color: NEON_COLORS.lime, marginBottom: isPortrait ? '28px' : '20px' }}>
          {winner ? `${winner} won${margin ? ' by ' + margin : ''}` : 'Result pending'}
        </div>

        {/* Footer info */}
        <div style={{
          display: 'flex', flexDirection: isPortrait ? 'column' : 'row', justifyContent: 'space-between', alignItems: isPortrait ? 'center' : 'center',
          borderTop: `1px solid ${NEON_COLORS.border}`, paddingTop: '18px', gap: isPortrait ? '16px' : '0',
          textAlign: isPortrait ? 'center' : undefined,
        }}>
          <div style={{ textAlign: isPortrait ? 'center' : undefined }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(16), color: '#F0F0F5', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700, opacity: 0.6 }}>VENUE</div>
            <div style={{ fontFamily: FONTS.body, fontSize: sf(20), color: '#F0F0F5', maxWidth: '350px', wordWrap: 'break-word', overflowWrap: 'break-word', opacity: 0.85 }}>{venue || '-'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(16), color: '#F0F0F5', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700, opacity: 0.6 }}>DATE</div>
            <div style={{ fontFamily: FONTS.body, fontSize: sf(20), color: '#F0F0F5', opacity: 0.85 }}>{date || '-'}</div>
          </div>
          <div style={{ textAlign: isPortrait ? 'center' : 'right' }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(16), color: '#F0F0F5', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700, opacity: 0.6 }}>PLAYER OF MATCH</div>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(24), fontWeight: 700, color: NEON_COLORS.amber }}>{potm || '-'}</div>
          </div>
        </div>
      </div>

      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
