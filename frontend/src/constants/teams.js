export const TEAM_COLORS = {
  'Chennai Super Kings': { primary: '#FCCA06', secondary: '#0081E9', abbr: 'CSK' },
  'Mumbai Indians': { primary: '#2E8BF0', secondary: '#D1AB3E', abbr: 'MI' },
  'Royal Challengers Bangalore': { primary: '#EC1C24', secondary: '#2B2A29', abbr: 'RCB' },
  'Royal Challengers Bengaluru': { primary: '#EC1C24', secondary: '#2B2A29', abbr: 'RCB' },
  'Kolkata Knight Riders': { primary: '#7B5EA7', secondary: '#B3A123', abbr: 'KKR' },
  'Delhi Capitals': { primary: '#1768AC', secondary: '#EF1B23', abbr: 'DC' },
  'Delhi Daredevils': { primary: '#1768AC', secondary: '#EF1B23', abbr: 'DD' },
  'Punjab Kings': { primary: '#D4213D', secondary: '#A7A9AC', abbr: 'PBKS' },
  'Kings XI Punjab': { primary: '#D4213D', secondary: '#A7A9AC', abbr: 'KXIP' },
  'Rajasthan Royals': { primary: '#EA1A85', secondary: '#254AA5', abbr: 'RR' },
  'Sunrisers Hyderabad': { primary: '#FF822A', secondary: '#000000', abbr: 'SRH' },
  'Gujarat Titans': { primary: '#A7D8DE', secondary: '#1C1C2B', abbr: 'GT' },
  'Lucknow Super Giants': { primary: '#A72056', secondary: '#FFCC00', abbr: 'LSG' },
  'Deccan Chargers': { primary: '#C0C0CC', secondary: '#A7A9AC', abbr: 'DC' },
  'Rising Pune Supergiant': { primary: '#6F61AC', secondary: '#D63D70', abbr: 'RPS' },
  'Rising Pune Supergiants': { primary: '#6F61AC', secondary: '#D63D70', abbr: 'RPS' },
  'Gujarat Lions': { primary: '#E04F17', secondary: '#1C1C2B', abbr: 'GL' },
  'Pune Warriors': { primary: '#2F9BE3', secondary: '#E55B25', abbr: 'PWI' },
  'Kochi Tuskers Kerala': { primary: '#6F2C91', secondary: '#F7B731', abbr: 'KTK' },
  'Afghanistan': { primary: '#1D4ED8', secondary: '#EF4444', abbr: 'AFG', flag: '🇦🇫' },
  'Australia': { primary: '#FACC15', secondary: '#166534', abbr: 'AUS', flag: '🇦🇺' },
  'Bangladesh': { primary: '#15803D', secondary: '#DC2626', abbr: 'BAN', flag: '🇧🇩' },
  'Canada': { primary: '#DC2626', secondary: '#FFFFFF', abbr: 'CAN', flag: '🇨🇦' },
  'England': { primary: '#38BDF8', secondary: '#1E3A8A', abbr: 'ENG', flag: '🏴' },
  'Hong Kong': { primary: '#DC2626', secondary: '#FFFFFF', abbr: 'HKG', flag: '🇭🇰' },
  'India': { primary: '#2563EB', secondary: '#F97316', abbr: 'IND', flag: '🇮🇳' },
  'Ireland': { primary: '#16A34A', secondary: '#2563EB', abbr: 'IRE', flag: '🇮🇪' },
  'Italy': { primary: '#2563EB', secondary: '#FFFFFF', abbr: 'ITA', flag: '🇮🇹' },
  'Kenya': { primary: '#DC2626', secondary: '#15803D', abbr: 'KEN', flag: '🇰🇪' },
  'Namibia': { primary: '#2563EB', secondary: '#DC2626', abbr: 'NAM', flag: '🇳🇦' },
  'Nepal': { primary: '#DC2626', secondary: '#1D4ED8', abbr: 'NEP', flag: '🇳🇵' },
  'Netherlands': { primary: '#F97316', secondary: '#1D4ED8', abbr: 'NED', flag: '🇳🇱' },
  'New Zealand': { primary: '#CBD5E1', secondary: '#111827', abbr: 'NZ', flag: '🇳🇿' },
  'Oman': { primary: '#DC2626', secondary: '#15803D', abbr: 'OMA', flag: '🇴🇲' },
  'Pakistan': { primary: '#16A34A', secondary: '#064E3B', abbr: 'PAK', flag: '🇵🇰' },
  'Papua New Guinea': { primary: '#DC2626', secondary: '#111827', abbr: 'PNG', flag: '🇵🇬' },
  'Scotland': { primary: '#7C3AED', secondary: '#1D4ED8', abbr: 'SCO', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  'South Africa': { primary: '#16A34A', secondary: '#FACC15', abbr: 'SA', flag: '🇿🇦' },
  'Sri Lanka': { primary: '#1D4ED8', secondary: '#FACC15', abbr: 'SL', flag: '🇱🇰' },
  'Uganda': { primary: '#FACC15', secondary: '#DC2626', abbr: 'UGA', flag: '🇺🇬' },
  'United Arab Emirates': { primary: '#DC2626', secondary: '#15803D', abbr: 'UAE', flag: '🇦🇪' },
  'United States of America': { primary: '#2563EB', secondary: '#DC2626', abbr: 'USA', flag: '🇺🇸' },
  'West Indies': { primary: '#9F1239', secondary: '#FACC15', abbr: 'WI', flag: '🌴' },
  'Zimbabwe': { primary: '#DC2626', secondary: '#FACC15', abbr: 'ZIM', flag: '🇿🇼' },
}

export function getTeamColor(teamName) {
  return TEAM_COLORS[teamName]?.primary || '#9AA69F'
}

export function getTeamAbbr(teamName) {
  return TEAM_COLORS[teamName]?.abbr || teamName?.substring(0, 3).toUpperCase() || '???'
}

export function getTeamFlag(teamName) {
  return TEAM_COLORS[teamName]?.flag || null
}

// Team logo image filenames (stored in backend/team_images/)
const TEAM_LOGO_FILES = {
  'Chennai Super Kings': 'CSK.jpg',
  'Mumbai Indians': 'MI.jpg',
  'Royal Challengers Bangalore': 'RCB.jpg',
  'Royal Challengers Bengaluru': 'RCB.jpg',
  'Kolkata Knight Riders': 'KKR.png',
  'Delhi Capitals': 'DC.png',
  'Delhi Daredevils': 'DC.png',
  'Punjab Kings': 'PK.jpg',
  'Kings XI Punjab': 'PK.jpg',
  'Rajasthan Royals': 'RR.png',
  'Sunrisers Hyderabad': 'SRH.jpg',
  'Gujarat Titans': 'GT.png',
  'Lucknow Super Giants': 'LSG.png',
  'Deccan Chargers': 'Decaan.jpg',
  'Rising Pune Supergiant': 'RPSG.jpg',
  'Rising Pune Supergiants': 'RPSG.jpg',
  'Gujarat Lions': 'GL.jpg',
  'Pune Warriors': 'PW.jpg',
  'Kochi Tuskers Kerala': 'KT.png',
}

const API_BASE = import.meta.env.VITE_API_URL || ''

export function getTeamLogo(teamName) {
  const file = TEAM_LOGO_FILES[teamName]
  if (!file) return null
  return `${API_BASE}/api/team-images/${file}`
}
