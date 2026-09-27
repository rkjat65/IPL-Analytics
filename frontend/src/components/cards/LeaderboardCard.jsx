import { NEON_COLORS, BOX_COLORS, FONTS, cardContainerStyle, dotGridBackground, watermarkStyle, CARD_DIMENSIONS, scaledFont, scaledSize, WATERMARK_TEXT } from './cardStyles'
import PlayerAvatar from '../ui/PlayerAvatar'
import { useTournament } from '../../contexts/TournamentContext'

// Top-5 leaderboard: "Most runs in 2024", "Most sixes all-time", ...
export default function LeaderboardCard({ title, subtitle, rows = [], valueLabel, dimensions = CARD_DIMENSIONS.twitter }) {
  const tournament = useTournament()
  const isPortrait = dimensions.height > dimensions.width
  const sf = (px) => scaledFont(px, dimensions)
  const avatar = scaledSize(isPortrait ? 72 : 52, dimensions)
  const top = rows[0]?.value || 1
  const accents = [NEON_COLORS.amber, NEON_COLORS.cyan, NEON_COLORS.magenta, NEON_COLORS.lime, NEON_COLORS.purple]

  return (
    <div style={cardContainerStyle(dimensions)}>
      <div style={dotGridBackground()} />
      <div style={{ height: '5px', background: `linear-gradient(90deg, ${NEON_COLORS.amber}, ${NEON_COLORS.magenta})`, zIndex: 2 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isPortrait ? '56px 48px 80px' : '36px 56px 56px', zIndex: 2, position: 'relative', gap: isPortrait ? '28px' : '18px' }}>
        <div style={{ textAlign: isPortrait ? 'center' : 'left' }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: sf(16), color: NEON_COLORS.amber, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
            {tournament.shortName} · {subtitle || 'All-time'}
          </div>
          <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 64 : 46), fontWeight: 700, color: NEON_COLORS.textPrimary, lineHeight: 1.05 }}>
            {title || 'Leaderboard'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: isPortrait ? '18px' : '10px', flex: 1, justifyContent: 'center' }}>
          {rows.slice(0, 5).map((row, i) => {
            const box = BOX_COLORS[i % BOX_COLORS.length]
            const pct = Math.max(8, Math.round(((row.value || 0) / top) * 100))
            return (
              <div key={row.player} style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: '18px',
                padding: isPortrait ? '18px 24px' : '8px 18px', borderRadius: '14px',
                background: box.bg, border: `1px solid ${box.border}`, overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${accents[i]}22, transparent)` }} />
                <div style={{ position: 'relative', fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 40 : 28), fontWeight: 700, color: accents[i], width: sf(isPortrait ? 44 : 30), textAlign: 'center' }}>
                  {i + 1}
                </div>
                <PlayerAvatar name={row.player} size={avatar} inline showBorder={false} style={{ position: 'relative' }} />
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 34 : 26), fontWeight: 700, color: NEON_COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.player}
                  </div>
                  {row.detail && (
                    <div style={{ fontFamily: FONTS.mono, fontSize: sf(isPortrait ? 18 : 14), color: NEON_COLORS.textSecondary }}>{row.detail}</div>
                  )}
                </div>
                <div style={{ position: 'relative', textAlign: 'right' }}>
                  <div style={{ fontFamily: FONTS.heading, fontSize: sf(isPortrait ? 48 : 34), fontWeight: 700, color: accents[i], lineHeight: 1 }}>
                    {row.display ?? row.value}
                  </div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: sf(12), color: NEON_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{valueLabel}</div>
                </div>
              </div>
            )
          })}
          {rows.length === 0 && (
            <div style={{ fontFamily: FONTS.body, fontSize: sf(22), color: NEON_COLORS.textMuted, textAlign: 'center' }}>Pick a stat to rank players</div>
          )}
        </div>
      </div>

      <div style={watermarkStyle()}>{WATERMARK_TEXT}</div>
    </div>
  )
}
