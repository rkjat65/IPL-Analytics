import { NEON_COLORS, BOX_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, formatNumber, formatDecimal, CARD_DIMENSIONS, scaledFont, scaledSize, WATERMARK_TEXT } from './cardStyles'
import { getTeamColor } from '../../constants/teams'
import PlayerAvatar from '../ui/PlayerAvatar'

export default function PlayerStatCard({ playerName, stats = {}, type = 'batting', teamName, imageUrl, dimensions = CARD_DIMENSIONS.twitter }) {
  const accentColor = type === 'batting' ? NEON_COLORS.cyan : NEON_COLORS.magenta
  const teamColor = teamName ? getTeamColor(teamName) : accentColor
  const isPortrait = dimensions.height > dimensions.width
  const sf = (px) => scaledFont(px, dimensions)

  const battingGrid = [
    { label: 'Runs', value: formatNumber(stats.runs) },
    { label: 'Matches', value: formatNumber(stats.matches) },
    { label: 'Innings', value: formatNumber(stats.innings) },
    { label: 'Average', value: formatDecimal(stats.avg) },
    { label: 'Strike Rate', value: formatDecimal(stats.sr) },
    { label: '50s', value: formatNumber(stats.fifties) },
    { label: '100s', value: formatNumber(stats.hundreds) },
    { label: '6s', value: formatNumber(stats.sixes) },
    { label: '4s', value: formatNumber(stats.fours) },
  ]

  const bowlingGrid = [
    { label: 'Wickets', value: formatNumber(stats.wickets) },
    { label: 'Matches', value: formatNumber(stats.matches) },
    { label: 'Innings', value: formatNumber(stats.innings) },
    { label: 'Average', value: formatDecimal(stats.avg) },
    { label: 'Economy', value: formatDecimal(stats.economy) },
    { label: 'Strike Rate', value: formatDecimal(stats.sr) },
    { label: 'Best', value: stats.best_figures || '-' },
    { label: '4W', value: formatNumber(stats.four_wickets) },
    { label: '5W', value: formatNumber(stats.five_wickets) },
  ]

  const gridItems = type === 'batting' ? battingGrid : bowlingGrid
  const heroStat = type === 'batting' ? { label: 'RUNS', value: formatNumber(stats.runs) } : { label: 'WICKETS', value: formatNumber(stats.wickets) }

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />

      <div style={{ height: '5px', background: `linear-gradient(90deg, ${accentColor}, ${teamColor})`, zIndex: 2 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: isPortrait ? '48px 40px 56px 40px' : '44px 56px 48px 56px', zIndex: 2, position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: isPortrait ? 'column' : 'row', justifyContent: isPortrait ? 'flex-start' : 'space-between', alignItems: isPortrait ? 'center' : 'flex-start', marginBottom: isPortrait ? '40px' : '32px', gap: isPortrait ? '28px' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isPortrait ? '28px' : '28px', flexDirection: isPortrait ? 'column' : 'row', textAlign: isPortrait ? 'center' : 'left' }}>
            <PlayerAvatar
              name={playerName || 'Player Name'}
              imageUrl={imageUrl}
              teamColor={teamColor}
              size={isPortrait ? scaledSize(200, dimensions) : scaledSize(140, dimensions)}
              inline
              shape="rounded"
            />
            <div>
              <div style={{ fontFamily: FONTS.mono, fontSize: sf(18), color: accentColor, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 700 }}>
                {type === 'batting' ? 'Batting Stats' : 'Bowling Stats'}
              </div>
              <div style={{ fontFamily: FONTS.heading, fontSize: sf(52), fontWeight: 700, color: '#F0F0F5', lineHeight: 1.1, letterSpacing: '-0.02em', wordWrap: 'break-word', overflowWrap: 'break-word', maxWidth: '550px' }}>
                {playerName || 'Player Name'}
              </div>
            </div>
          </div>
          <div style={{ textAlign: isPortrait ? 'center' : 'right' }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(76), fontWeight: 700, color: '#C3F23B', lineHeight: 1, textShadow: '0 0 30px rgba(195,242,59,0.2)' }}>
              {heroStat.value}
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: sf(18), color: '#F0F0F5', letterSpacing: '0.1em', marginTop: '6px', fontWeight: 700, opacity: 0.8 }}>
              {heroStat.label}
            </div>
          </div>
        </div>

        <div style={{ height: '3px', background: `linear-gradient(90deg, ${accentColor}66, transparent)`, marginBottom: '28px' }} />

        {/* Stats Grid - each box with distinct color */}
        <div style={{ display: 'grid', gridTemplateColumns: isPortrait ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isPortrait ? '4px' : '16px', flex: 1 }}>
          {gridItems.slice(1).map((item, i) => {
            const boxColor = BOX_COLORS[i % BOX_COLORS.length]
            return (
              <div key={item.label} style={{
                background: boxColor.bg, borderRadius: '12px',
                padding: isPortrait ? '20px 16px' : '8px 10px',
                border: `1px solid ${boxColor.border}`, textAlign: 'center',
              }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: sf(24), color: boxColor.accent, letterSpacing: '0.1em', textTransform: 'uppercase',  fontWeight: 700, opacity: 0.8, }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: FONTS.mono, fontSize: sf(46), fontWeight: 700, color: '#F0F0F5' }}>
                  {item.value}
                </div>
              </div>
            )
          })}
        </div>

        {teamName && (
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '5px', height: '60%', background: teamColor, borderRadius: '0 4px 0 0' }} />
        )}
      </div>

      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
