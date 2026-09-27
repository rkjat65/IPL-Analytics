import { getTeamLogo, getTeamAbbr, getTeamColor, getTeamFlag } from '../../constants/teams'

export default function TeamLogo({ team, size = 24, className = '' }) {
  const logo = getTeamLogo(team)
  const abbr = getTeamAbbr(team)
  const color = getTeamColor(team)
  const flag = getTeamFlag(team)

  if (!logo) {
    if (flag) {
      return (
        <span
          className={`inline-flex items-center justify-center shrink-0 ${className}`}
          style={{ width: size, height: size, fontSize: size * 0.72, lineHeight: 1 }}
          role="img"
          aria-label={`${team} flag`}
          title={team}
        >
          {flag}
        </span>
      )
    }
    return (
      <div
        className={`rounded-md flex items-center justify-center font-heading font-bold text-white shrink-0 ${className}`}
        style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}
      >
        {abbr}
      </div>
    )
  }

  return (
    <img
      src={logo}
      alt={team}
      className={`rounded-md object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={(e) => {
        e.target.style.display = 'none'
        const fallback = e.target.nextElementSibling
        if (fallback) fallback.style.display = 'flex'
      }}
    />
  )
}
