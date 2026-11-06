import { NEON_COLORS, BOX_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, formatNumber, formatDecimal, CARD_DIMENSIONS, scaledFont, scaledSize, WATERMARK_TEXT } from './cardStyles'
import PlayerAvatar from '../ui/PlayerAvatar'

/**
 * MatchupCard — Batsman vs Bowler head-to-head card (compact, prominent stats)
 * mode: 'bat_v_ball' = batsman perspective, 'ball_v_bat' = bowler perspective
 */
export default function MatchupCard({
  playerName,
  opponentName,
  stats = {},
  mode = 'bat_v_ball',
  dimensions = CARD_DIMENSIONS.twitter
}) {
  const isBatting = mode === 'bat_v_ball'
  const accentColor = isBatting ? NEON_COLORS.amber : NEON_COLORS.purple
  const secondaryColor = isBatting ? NEON_COLORS.cyan : NEON_COLORS.magenta
  const isPortrait = dimensions.height > dimensions.width
  const isSquare = !isPortrait && Math.abs(dimensions.width - dimensions.height) < 200
  const sf = (px) => scaledFont(px, dimensions)

  const battingGrid = [
    { label: 'Balls', value: formatNumber(stats.balls), color: BOX_COLORS[5] },
    { label: 'SR', value: formatDecimal(stats.sr), color: BOX_COLORS[3] },
    { label: '4s', value: formatNumber(stats.fours), color: BOX_COLORS[2] },
    { label: '6s', value: formatNumber(stats.sixes), color: BOX_COLORS[4] },
    { label: 'Dots', value: formatNumber(stats.dots), color: BOX_COLORS[6] },
    { label: 'Outs', value: formatNumber(stats.dismissals), color: BOX_COLORS[1] },
  ]

  const bowlingGrid = [
    { label: 'Runs', value: formatNumber(stats.runs), color: BOX_COLORS[1] },
    { label: 'Balls', value: formatNumber(stats.balls), color: BOX_COLORS[5] },
    { label: 'Econ', value: formatDecimal(stats.economy), color: BOX_COLORS[3] },
    { label: 'Dots', value: formatNumber(stats.dots), color: BOX_COLORS[2] },
  ]

  const gridItems = isBatting ? battingGrid : bowlingGrid
  const heroStat = isBatting
    ? { label: 'RUNS SCORED', value: formatNumber(stats.runs) }
    : { label: 'WICKETS TAKEN', value: formatNumber(stats.wickets) }

  const cols = isPortrait ? 3 : gridItems.length

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />

      {/* Top accent bar */}
      <div style={{ height: '15px', background: `linear-gradient(90deg, ${accentColor}, ${secondaryColor})`, zIndex: 2 }} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: isPortrait ? 'center' : 'space-between',
        gap: isPortrait ? '50px' : undefined,
        padding: isPortrait ? '48px 36px 52px 36px' : isSquare ? '36px 40px 48px 40px' : '28px 48px 36px 48px',
        zIndex: 2, position: 'relative'
      }}>
        {/* Header — Side-by-Side Layout (Responsive) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isPortrait ? '8px' : '24px', // Tighter gap for portrait
          flexDirection: 'row', // Forces horizontal side-by-side regardless of format
          width: '100%'
        }}>
          
          {/* Player 1 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: isPortrait ? '8px' : '12px' }}>
            <PlayerAvatar
              name={playerName || 'Player'}
              size={isPortrait ? scaledSize(280, dimensions) : scaledSize(180, dimensions)} // Scales down for portrait
              inline
              shape="rounded"
            />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: sf(isPortrait ? 18 : 16), color: accentColor, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                {isBatting ? 'BATSMAN' : 'BOWLER'}
              </div>
              <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 38 : 38), fontWeight: 700, color: '#F0F0F5', lineHeight: 1.15, marginTop: '4px' }}>
                {playerName || 'Select Player'}
              </div>
            </div>
          </div>

          {/* VS badge */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: isPortrait ? scaledSize(68, dimensions) : scaledSize(64, dimensions),
            height: isPortrait ? scaledSize(68, dimensions) : scaledSize(64, dimensions),
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${accentColor}25, ${secondaryColor}25)`,
            border: `2px solid ${accentColor}50`,
            flexShrink: 0,
            zIndex: 10,
          }}>
            <span style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 20 : 28), fontWeight: 800, color: accentColor }}>VS</span>
          </div>

          {/* Player 2 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: isPortrait ? '8px' : '12px' }}>
            <PlayerAvatar
              name={opponentName || 'Opponent'}
              size={isPortrait ? scaledSize(280, dimensions) : scaledSize(180, dimensions)} // Scales down for portrait
              inline
              shape="rounded"
            />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: sf(isPortrait ? 18 : 16), color: secondaryColor, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                {isBatting ? 'BOWLER' : 'BATSMAN'}
              </div>
              <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 38 : 34), fontWeight: 700, color: '#F0F0F5', lineHeight: 1.15, marginTop: '4px' }}>
                {opponentName || 'Select Player'}
              </div>
            </div>
          </div>
          
        </div>

        {/* Hero stat — centered, large */}
        <div style={{
          textAlign: 'center',
          padding: isPortrait ? '10px 0' : '1px 1px',
          background: `linear-gradient(135deg, ${accentColor}08, ${secondaryColor}08)`,
          borderRadius: '66px',
          border: `1px solid ${accentColor}15`,
        }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: sf(isPortrait ? 22 :26), color: accentColor, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '5px' }}>
            {heroStat.label}
          </div>
          <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 120 : 70), fontWeight: 1000, color: '#F0F0F5', lineHeight: 1.1, letterSpacing: '0.02em',}}>
            {heroStat.value}
          </div>
        </div>

        {/* Stats grid — tightly packed */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: isPortrait ? '16px' : '8px',
        }}>
          {gridItems.map((item, i) => {
            const c = item.color
            return (
              <div key={i} style={{
                background: c.bg,
                border: `2px solid ${c.border}`,
                borderRadius: '18px',
                padding: isPortrait ? '30px 22px' : '42px 18px',
                textAlign: 'center'
              }}>
                <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 18 : 18), color: 'whitesmoke', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '40px' }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 66 : 44), fontWeight: 700, color: c.accent }}>
                  {item.value}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Watermark */}
      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
