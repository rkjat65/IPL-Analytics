import { NEON_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, formatNumber, formatDecimal, CARD_DIMENSIONS, scaledSize, scaledFont, WATERMARK_TEXT } from './cardStyles'
import PlayerAvatar from '../ui/PlayerAvatar'

function StatBar({ label, val1, val2, sf }) {
  const n1 = parseFloat(val1) || 0
  const n2 = parseFloat(val2) || 0
  const max = Math.max(n1, n2, 1)
  const p1 = (n1 / max) * 100
  const p2 = (n2 / max) * 100
  const w1 = n1 >= n2
  const w2 = n2 >= n1

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
      {/* P1 value */}
      <div style={{
        width: '100px', textAlign: 'right',
        fontFamily: FONTS.mono, fontSize: sf ? sf(26) : '26px', fontWeight: 700,
        color: w1 ? '#C3F23B' : '#F0F0F5',
        opacity: w1 ? 1 : 0.6,
      }}>
        {val1}
      </div>
      {/* P1 bar */}
      <div style={{ flex: 1, height: '12px', background: NEON_COLORS.bgElevated, borderRadius: '6px', overflow: 'hidden', direction: 'rtl' }}>
        <div style={{ width: `${p1}%`, height: '100%', background: w1 ? NEON_COLORS.cyan : NEON_COLORS.textMuted, borderRadius: '6px', transition: 'width 0.3s' }} />
      </div>
      {/* Label */}
      <div style={{
        width: '120px', textAlign: 'center',
        fontFamily: FONTS.mono, fontSize: sf ? sf(15) : '15px', color: '#F0F0F5',
        letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, opacity: 0.7,
      }}>
        {label}
      </div>
      {/* P2 bar */}
      <div style={{ flex: 1, height: '12px', background: NEON_COLORS.bgElevated, borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ width: `${p2}%`, height: '100%', background: w2 ? NEON_COLORS.magenta : NEON_COLORS.textMuted, borderRadius: '6px', transition: 'width 0.3s' }} />
      </div>
      {/* P2 value */}
      <div style={{
        width: '100px', textAlign: 'left',
        fontFamily: FONTS.mono, fontSize: sf ? sf(26) : '26px', fontWeight: 700,
        color: w2 ? NEON_COLORS.magenta : '#F0F0F5',
        opacity: w2 ? 1 : 0.6,
      }}>
        {val2}
      </div>
    </div>
  )
}

function getStatRows(stats, type) {
  if (type === 'batting') {
    return {
      primary: { label: 'Runs', value: formatNumber(stats.runs) },
      rows: [
        { key: 'avg', label: 'Average', value: formatDecimal(stats.avg) },
        { key: 'sr', label: 'Strike Rate', value: formatDecimal(stats.sr) },
        { key: 'matches', label: 'Matches', value: formatNumber(stats.matches) },
        { key: 'fifties', label: '50s', value: formatNumber(stats.fifties) },
        { key: 'hundreds', label: '100s', value: formatNumber(stats.hundreds) },
        { key: 'sixes', label: '6s', value: formatNumber(stats.sixes) },
      ]
    }
  }
  return {
    primary: { label: 'Wickets', value: formatNumber(stats.wickets) },
    rows: [
      { key: 'avg', label: 'Average', value: formatDecimal(stats.avg) },
      { key: 'economy', label: 'Economy', value: formatDecimal(stats.economy) },
      { key: 'sr', label: 'Strike Rate', value: formatDecimal(stats.sr) },
      { key: 'matches', label: 'Matches', value: formatNumber(stats.matches) },
      { key: 'four_w', label: '4W', value: formatNumber(stats.four_wickets) },
      { key: 'five_w', label: '5W', value: formatNumber(stats.five_wickets) },
    ]
  }
}

export default function ComparisonCard({ player1 = {}, player2 = {}, metric = 'batting', metric2, dimensions = CARD_DIMENSIONS.twitter }) {
  const s1 = player1.stats || {}
  const s2 = player2.stats || {}
  const p1Type = metric
  const p2Type = metric2 || metric
  const isPortrait = dimensions.height > dimensions.width
  const sf = (px) => scaledFont(px, dimensions)

  // When both same type, use the classic bar comparison
  const sameType = p1Type === p2Type

  let rows
  if (sameType) {
    const battingRows = [
      { label: 'Runs', val1: formatNumber(s1.runs), val2: formatNumber(s2.runs) },
      { label: 'Average', val1: formatDecimal(s1.avg), val2: formatDecimal(s2.avg) },
      { label: 'Strike Rate', val1: formatDecimal(s1.sr), val2: formatDecimal(s2.sr) },
      { label: 'Matches', val1: formatNumber(s1.matches), val2: formatNumber(s2.matches) },
      { label: '50s', val1: formatNumber(s1.fifties), val2: formatNumber(s2.fifties) },
      { label: '100s', val1: formatNumber(s1.hundreds), val2: formatNumber(s2.hundreds) },
      { label: '6s', val1: formatNumber(s1.sixes), val2: formatNumber(s2.sixes) },
    ]
    const bowlingRows = [
      { label: 'Wickets', val1: formatNumber(s1.wickets), val2: formatNumber(s2.wickets) },
      { label: 'Average', val1: formatDecimal(s1.avg), val2: formatDecimal(s2.avg) },
      { label: 'Economy', val1: formatDecimal(s1.economy), val2: formatDecimal(s2.economy) },
      { label: 'Strike Rate', val1: formatDecimal(s1.sr), val2: formatDecimal(s2.sr) },
      { label: 'Matches', val1: formatNumber(s1.matches), val2: formatNumber(s2.matches) },
      { label: '4W', val1: formatNumber(s1.four_wickets), val2: formatNumber(s2.four_wickets) },
      { label: '5W', val1: formatNumber(s1.five_wickets), val2: formatNumber(s2.five_wickets) },
    ]
    rows = p1Type === 'batting' ? battingRows : bowlingRows
  }

  // Mixed-type: show each player's stats side by side
  const p1Rows = getStatRows(s1, p1Type)
  const p2Rows = getStatRows(s2, p2Type)

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />

      {/* Top bar */}
      <div style={{ height: '5px', background: `linear-gradient(90deg, ${NEON_COLORS.cyan}, ${NEON_COLORS.magenta})`, zIndex: 2 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: isPortrait ? '40px 36px 56px 36px' : '40px 56px 48px 56px', zIndex: 2, position: 'relative' }}>
        {/* Header — always horizontal: avatar + name | VS | name + avatar */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isPortrait ? '28px' : '28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1 }}>
            <PlayerAvatar name={player1.name || 'Player 1'} imageUrl={player1.imageUrl} teamColor={NEON_COLORS.cyan} size={isPortrait ? scaledSize(120, dimensions) : scaledSize(110, dimensions)} inline shape="circle" />
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(30), fontWeight: 700, color: '#C3F23B', textAlign: 'center', lineHeight: 1.2 }}>
              {player1.name || 'Player 1'}
            </div>
          </div>
          <div style={{
            fontFamily: FONTS.heading, fontSize: sf(22), fontWeight: 700,
            color: '#F0F0F5', padding: '6px 20px', opacity: 0.5,
            border: `2px solid ${NEON_COLORS.border}`, borderRadius: '24px', flexShrink: 0,
          }}>
            VS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1 }}>
            <PlayerAvatar name={player2.name || 'Player 2'} imageUrl={player2.imageUrl} teamColor={NEON_COLORS.magenta} size={isPortrait ? scaledSize(120, dimensions) : scaledSize(110, dimensions)} inline shape="circle" />
            <div style={{ fontFamily: FONTS.heading, fontSize: sf(30), fontWeight: 700, color: NEON_COLORS.magenta, textAlign: 'center', lineHeight: 1.2 }}>
              {player2.name || 'Player 2'}
            </div>
          </div>
        </div>

        {/* Type label */}
        <div style={{ textAlign: 'center', fontFamily: FONTS.mono, fontSize: sf(16), color: '#F0F0F5', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '24px', fontWeight: 600, opacity: 0.7 }}>
          {sameType
            ? (p1Type === 'batting' ? 'Batting Comparison' : 'Bowling Comparison')
            : `${p1Type === 'batting' ? 'Batting' : 'Bowling'} vs ${p2Type === 'batting' ? 'Batting' : 'Bowling'}`
          }
        </div>

        {/* Stat bars or mixed layout */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {sameType ? (
            rows.map((r) => (
              <StatBar key={r.label} label={r.label} val1={r.val1} val2={r.val2} sf={sf} />
            ))
          ) : (
            /* Mixed type: side-by-side stat panels */
            <div style={{ display: 'flex', flexDirection: dimensions.height > dimensions.width ? 'column' : 'row', gap: '32px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: '14px', color: '#C3F23B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600 }}>
                  {p1Type}
                </div>
                <div style={{ fontFamily: FONTS.mono, fontSize: '36px', fontWeight: 700, color: '#C3F23B', marginBottom: '16px' }}>
                  {p1Rows.primary.value}
                  <span style={{ fontSize: '15px', color: '#F0F0F5', marginLeft: '8px', opacity: 0.6 }}>{p1Rows.primary.label}</span>
                </div>
                {p1Rows.rows.map(r => (
                  <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${NEON_COLORS.border}` }}>
                    <span style={{ fontFamily: FONTS.mono, fontSize: '15px', color: '#F0F0F5', opacity: 0.7 }}>{r.label}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: '20px', fontWeight: 700, color: '#F0F0F5' }}>{r.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ width: dimensions.height > dimensions.width ? '100%' : '2px', height: dimensions.height > dimensions.width ? '2px' : 'auto', background: `linear-gradient(${dimensions.height > dimensions.width ? '90deg' : '180deg'}, ${NEON_COLORS.cyan}, ${NEON_COLORS.magenta})`, borderRadius: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: '14px', color: NEON_COLORS.magenta, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600, textAlign: dimensions.height > dimensions.width ? 'left' : 'right' }}>
                  {p2Type}
                </div>
                <div style={{ fontFamily: FONTS.mono, fontSize: '36px', fontWeight: 700, color: NEON_COLORS.magenta, marginBottom: '16px', textAlign: dimensions.height > dimensions.width ? 'left' : 'right' }}>
                  {p2Rows.primary.value}
                  <span style={{ fontSize: '15px', color: '#F0F0F5', marginLeft: '8px', opacity: 0.6 }}>{p2Rows.primary.label}</span>
                </div>
                {p2Rows.rows.map(r => (
                  <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${NEON_COLORS.border}` }}>
                    <span style={{ fontFamily: FONTS.mono, fontSize: '15px', color: '#F0F0F5', opacity: 0.7 }}>{r.label}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: '20px', fontWeight: 700, color: '#F0F0F5' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
