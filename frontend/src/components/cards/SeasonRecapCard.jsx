import { NEON_COLORS, BOX_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, CARD_DIMENSIONS, scaledFont, WATERMARK_TEXT } from './cardStyles'
import { getTeamColor } from '../../constants/teams'
import { useTournament } from '../../contexts/TournamentContext'

function AwardRow({ label, value, color, boxColor, sf }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '22px 28px', background: boxColor?.bg || NEON_COLORS.bgCard,
      border: `1px solid ${boxColor?.border || NEON_COLORS.border}`, borderRadius: '12px',
    }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: sf ? sf(18) : '18px', color: boxColor?.accent || '#F0F0F5', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, opacity: 0.9 }}>
        {label}
      </div>
      <div style={{ fontFamily: FONTS.heading, fontSize: sf ? sf(26) : '26px', fontWeight: 700, color: color || '#F0F0F5' }}>
        {value || '-'}
      </div>
    </div>
  )
}

export default function SeasonRecapCard({ season, champion, orangeCap, purpleCap, mostSixes, bestEconomy, dimensions = CARD_DIMENSIONS.twitter }) {
  const tournament = useTournament()
  const champColor = champion ? getTeamColor(champion) : NEON_COLORS.amber
  const isPortrait = dimensions.height > dimensions.width
  const sf = (px) => scaledFont(px, dimensions)

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />

      <div style={{ height: '5px', background: `linear-gradient(90deg, ${NEON_COLORS.amber}, ${champColor})`, zIndex: 2 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: isPortrait ? '40px 40px 56px 40px' : '40px 56px 48px 56px', zIndex: 2, position: 'relative' }}>
        {/* Season header */}
        <div style={{ display: 'flex', flexDirection: isPortrait ? 'column' : 'row', justifyContent: isPortrait ? 'flex-start' : 'space-between', alignItems: isPortrait ? 'center' : 'flex-start', marginBottom: isPortrait ? '36px' : '28px', gap: isPortrait ? '24px' : '0', textAlign: isPortrait ? 'center' : undefined }}>
          <div style={{ textAlign: isPortrait ? 'center' : undefined }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(18), color: '#F0F0F5', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 700, opacity: 0.7 }}>
              Season Recap
            </div>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(60), fontWeight: 700, color: '#F0F0F5', lineHeight: 1 }}>
              {tournament.shortName} {season || '20XX'}
            </div>
          </div>

          <div style={{
            textAlign: isPortrait ? 'center' : 'right', padding: '24px 32px', background: `${champColor}15`,
            border: `1px solid ${champColor}44`, borderRadius: '14px',
          }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(16), color: NEON_COLORS.amber, letterSpacing: '0.12em', marginBottom: '10px', fontWeight: 700 }}>
              CHAMPION
            </div>
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(34), fontWeight: 700, color: champColor }}>
              {champion || 'TBD'}
            </div>
          </div>
        </div>

        <div style={{ height: '3px', background: `linear-gradient(90deg, ${NEON_COLORS.amber}66, transparent)`, marginBottom: '24px' }} />

        {/* Awards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isPortrait ? '1fr' : '1fr 1fr', gap: isPortrait ? '14px' : '16px', flex: 1 }}>
          <AwardRow label={tournament.awards.batting} value={orangeCap} color={NEON_COLORS.amber} boxColor={BOX_COLORS[3]} sf={sf} />
          <AwardRow label={tournament.awards.bowling} value={purpleCap} color={NEON_COLORS.magenta} boxColor={BOX_COLORS[1]} sf={sf} />
          <AwardRow label="Most Sixes" value={mostSixes} color={NEON_COLORS.cyan} boxColor={BOX_COLORS[0]} sf={sf} />
          <AwardRow label="Best Economy" value={bestEconomy} color={NEON_COLORS.lime} boxColor={BOX_COLORS[2]} sf={sf} />
        </div>
      </div>

      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
