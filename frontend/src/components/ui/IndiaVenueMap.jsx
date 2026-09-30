import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps'

// Local GeoJSON for India states (includes J&K and Ladakh as part of India)
const INDIA_GEO_JSON = `${import.meta.env.BASE_URL}india-states.json`

// City lat/lon coordinates for IPL venues
const CITY_COORDINATES = {
  // Major IPL cities
  Mumbai: [72.8777, 19.076],
  Chennai: [80.2707, 13.0827],
  Kolkata: [88.3639, 22.5726],
  Bengaluru: [77.5946, 12.9716],
  Bangalore: [77.5946, 12.9716],
  Delhi: [77.1025, 28.7041],
  'New Delhi': [77.209, 28.6139],
  Hyderabad: [78.4867, 17.385],
  Jaipur: [75.7873, 26.9124],
  Chandigarh: [76.7794, 30.7333],
  Mohali: [76.7179, 30.7046],
  'New Chandigarh': [76.7179, 30.7046],
  Pune: [73.8567, 18.5204],
  Ahmedabad: [72.5714, 23.0225],
  Lucknow: [80.9462, 26.8467],
  Rajkot: [70.8022, 22.3039],
  Indore: [75.8577, 22.7196],
  Nagpur: [79.0882, 21.1458],
  Dharamsala: [76.3234, 32.219],
  Ranchi: [85.3096, 23.3441],
  Visakhapatnam: [83.2185, 17.6868],
  Vizag: [83.2185, 17.6868],
  Cuttack: [85.8245, 20.4625],
  Guwahati: [91.7362, 26.1445],
  Raipur: [81.6296, 21.2514],
  Kochi: [76.2673, 9.9312],
  Thiruvananthapuram: [76.9366, 8.5241],
  Kanpur: [80.3319, 26.4499],
  Jamtha: [79.0882, 21.1458], // Nagpur area
  Mullanpur: [76.5, 30.8], // Near Chandigarh
  Navi_Mumbai: [73.0169, 19.033],
  // UAE venues
  'Abu Dhabi': [54.3773, 24.4539],
  Dubai: [55.2708, 25.2048],
  Sharjah: [55.4033, 25.3463],
  // South Africa
  Centurion: [28.1878, -25.8603],
  'Port Elizabeth': [25.6022, -33.918],
  Durban: [31.0218, -29.8587],
  'Cape Town': [18.4241, -33.9249],
  Johannesburg: [28.0473, -26.2041],
  Kimberley: [24.7714, -28.7282],
  'East London': [27.9116, -32.983],
  Bloemfontein: [26.2269, -29.0852],
}

// Extract city name from venue string
export function extractCityFromVenue(venueName) {
  return extractCity(venueName)
}

function extractCity(venueName) {
  if (!venueName) return null

  // Direct city mentions at end after comma
  const parts = venueName.split(',')
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim()
    if (CITY_COORDINATES[lastPart]) return lastPart
    // Try second-to-last part
    if (parts.length > 2) {
      const secondLast = parts[parts.length - 2].trim()
      if (CITY_COORDINATES[secondLast]) return secondLast
    }
  }

  // Match known city names anywhere in venue name
  const knownCities = [
    'Mumbai',
    'Chennai',
    'Kolkata',
    'Bengaluru',
    'Bangalore',
    'Delhi',
    'Hyderabad',
    'Jaipur',
    'Chandigarh',
    'Mohali',
    'Pune',
    'Ahmedabad',
    'Lucknow',
    'Rajkot',
    'Indore',
    'Nagpur',
    'Dharamsala',
    'Ranchi',
    'Visakhapatnam',
    'Vizag',
    'Cuttack',
    'Guwahati',
    'Raipur',
    'Kochi',
    'Thiruvananthapuram',
    'Kanpur',
    'Mullanpur',
    'Abu Dhabi',
    'Dubai',
    'Sharjah',
    'Centurion',
    'Port Elizabeth',
    'Durban',
    'Cape Town',
    'Johannesburg',
    'Kimberley',
    'East London',
    'Bloemfontein',
  ]
  for (const city of knownCities) {
    if (venueName.includes(city)) return city
  }

  // Venue-specific mappings
  const venueMap = {
    'Eden Gardens': 'Kolkata',
    'Wankhede Stadium': 'Mumbai',
    'M Chinnaswamy Stadium': 'Bengaluru',
    'M.Chinnaswamy Stadium': 'Bengaluru',
    'Feroz Shah Kotla': 'Delhi',
    'Arun Jaitley Stadium': 'Delhi',
    'Sawai Mansingh Stadium': 'Jaipur',
    'Narendra Modi Stadium': 'Ahmedabad',
    'Sardar Patel Stadium': 'Ahmedabad',
    'Punjab Cricket Association Stadium': 'Mohali',
    'Punjab Cricket Association IS Bindra Stadium': 'Mohali',
    'MA Chidambaram Stadium': 'Chennai',
    'Chepauk': 'Chennai',
    'Rajiv Gandhi International Stadium': 'Hyderabad',
    'Uppal': 'Hyderabad',
    'Brabourne Stadium': 'Mumbai',
    'Dr DY Patil Sports Academy': 'Mumbai',
    'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium': 'Visakhapatnam',
    'Subrata Roy Sahara Stadium': 'Pune',
    'Maharashtra Cricket Association Stadium': 'Pune',
    'Holkar Cricket Stadium': 'Indore',
    'Nehru Stadium': 'Chennai',
    'Green Park': 'Kanpur',
    'Barabati Stadium': 'Cuttack',
    'Saurashtra Cricket Association Stadium': 'Rajkot',
    'JSCA International Stadium Complex': 'Ranchi',
    'Himachal Pradesh Cricket Association Stadium': 'Dharamsala',
    'Shaheed Veer Narayan Singh International Stadium': 'Raipur',
    'Vidarbha Cricket Association Stadium': 'Nagpur',
    'Barsapara Cricket Stadium': 'Guwahati',
    'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium': 'Lucknow',
    'Zayed Cricket Stadium': 'Abu Dhabi',
    'Sheikh Zayed Stadium': 'Abu Dhabi',
    'Dubai International Cricket Stadium': 'Dubai',
    'Sharjah Cricket Stadium': 'Sharjah',
    'SuperSport Park': 'Centurion',
    'Kingsmead': 'Durban',
    Newlands: 'Cape Town',
    'New Wanderers Stadium': 'Johannesburg',
    "St George's Park": 'Port Elizabeth',
    'Buffalo Park': 'East London',
    'De Beers Diamond Oval': 'Kimberley',
    'OUTsurance Oval': 'Bloemfontein',
    'Maharaja Yadavindra Singh International Cricket Stadium': 'Mullanpur',
  }

  for (const [key, city] of Object.entries(venueMap)) {
    if (venueName.includes(key)) return city
  }

  return null
}

export default function IndiaVenueMap({ venues = [] }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Process venues: group by city, aggregate matches
  const { indianVenues, uaeVenues, otherVenues } = useMemo(() => {
    const cityMap = {}

    venues.forEach((v) => {
      const city = v.city || extractCity(v.venue)
      if (!city) return
      const coords = CITY_COORDINATES[city]
      if (!coords) return

      if (!cityMap[city]) {
        cityMap[city] = {
          city,
          coordinates: coords,
          matches: 0,
          venues: [],
        }
      }
      cityMap[city].matches += v.matches || 0
      cityMap[city].venues.push(v)
    })

    const all = Object.values(cityMap)
    const indian = all.filter(
      (c) =>
        c.coordinates[0] > 65 &&
        c.coordinates[0] < 100 &&
        c.coordinates[1] > 6 &&
        c.coordinates[1] < 40
    )
    const uae = all.filter(
      (c) => c.coordinates[0] > 50 && c.coordinates[0] < 60
    )
    const other = all.filter(
      (c) =>
        !indian.includes(c) && !uae.includes(c)
    )

    return {
      indianVenues: indian.sort((a, b) => b.matches - a.matches),
      uaeVenues: uae.sort((a, b) => b.matches - a.matches),
      otherVenues: other.sort((a, b) => b.matches - a.matches),
    }
  }, [venues])

  const maxMatches = Math.max(
    ...indianVenues.map((v) => v.matches),
    1
  )

  // States that have IPL venues (mapped from city to state)
  const statesWithVenues = useMemo(() => {
    const cityToState = {
      Mumbai: 'Maharashtra', Pune: 'Maharashtra', Nagpur: 'Maharashtra', Navi_Mumbai: 'Maharashtra',
      Chennai: 'Tamil Nadu', Bengaluru: 'Karnataka', Bangalore: 'Karnataka',
      Kolkata: 'West Bengal', Delhi: 'Delhi', 'New Delhi': 'Delhi',
      Hyderabad: 'Telangana', Jaipur: 'Rajasthan',
      Chandigarh: 'Chandigarh', Mohali: 'Punjab', 'New Chandigarh': 'Punjab', Mullanpur: 'Punjab',
      Ahmedabad: 'Gujarat', Rajkot: 'Gujarat',
      Lucknow: 'Uttar Pradesh', Kanpur: 'Uttar Pradesh',
      Indore: 'Madhya Pradesh', Ranchi: 'Jharkhand',
      Visakhapatnam: 'Andhra Pradesh', Vizag: 'Andhra Pradesh',
      Cuttack: 'Odisha', Guwahati: 'Assam', Raipur: 'Chhattisgarh',
      Kochi: 'Kerala', Thiruvananthapuram: 'Kerala',
      Dharamsala: 'Himachal Pradesh',
    }
    const states = new Set()
    indianVenues.forEach((v) => {
      const state = cityToState[v.city]
      if (state) states.add(state)
    })
    return states
  }, [indianVenues])

  const handleMouseMove = (e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="card">
      <h3 className="text-lg font-heading font-semibold text-text-primary mb-1">
        IPL Venue Map
      </h3>
      <p className="text-text-muted text-xs mb-4">
        Click on a venue to explore detailed analytics
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* India Map */}
        <div
          className="lg:col-span-3 relative bg-[#0D0D14] rounded-xl border border-border-subtle overflow-hidden"
          onMouseMove={handleMouseMove}
        >
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 650,
              center: [82, 22],
            }}
            style={{ width: '100%', height: 'auto' }}
            width={600}
            height={460}
          >
            <ZoomableGroup center={[82, 22]} zoom={1} minZoom={1} maxZoom={3}>
              {/* India GeoJSON */}
              <Geographies geography={INDIA_GEO_JSON}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const stateName = geo.properties?.ST_NM || ''
                    const hasVenue = statesWithVenues.has(stateName)
                    return (
                      <Geography
                        key={geo.rpiKey || stateName || geo.id}
                        geography={geo}
                        fill={hasVenue ? '#1A1A28' : '#121a17'}
                        stroke="#2E3F39"
                        strokeWidth={0.5}
                        style={{
                          default: { outline: 'none' },
                          hover: { fill: '#222233', outline: 'none' },
                          pressed: { outline: 'none' },
                        }}
                      />
                    )
                  })
                }
              </Geographies>

              {/* Venue markers */}
              {indianVenues.map((v) => {
                const size = 4 + (v.matches / maxMatches) * 10
                const isHov = hovered === v.city
                return (
                  <Marker
                    key={v.city}
                    coordinates={v.coordinates}
                    onMouseEnter={() => setHovered(v.city)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      // Navigate to the venue with most matches in this city
                      const topVenue = [...v.venues].sort((a, b) => (b.matches || 0) - (a.matches || 0))[0]
                      if (topVenue) {
                        navigate(`/venues/${encodeURIComponent(topVenue.venue)}`)
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Glow ring */}
                    <circle
                      r={size + 4}
                      fill="#C3F23B"
                      opacity={isHov ? 0.25 : 0.06}
                    />
                    {/* Pulse animation on hover */}
                    {isHov && (
                      <circle r={size + 8} fill="none" stroke="#C3F23B" strokeWidth={1} opacity={0.3}>
                        <animate attributeName="r" from={size + 4} to={size + 16} dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {/* Main dot */}
                    <circle
                      r={size}
                      fill={isHov ? '#C3F23B' : '#C3F23B'}
                      opacity={isHov ? 1 : 0.75}
                      stroke={isHov ? '#fff' : 'none'}
                      strokeWidth={isHov ? 1.5 : 0}
                    />
                    {/* City label - always visible for top venues */}
                    {(isHov || v.matches > maxMatches * 0.3) && (
                      <text
                        textAnchor="middle"
                        y={-(size + 6)}
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: isHov ? 10 : 8,
                          fill: isHov ? '#F0F0F5' : '#9AA69F',
                          fontWeight: isHov ? 600 : 400,
                          pointerEvents: 'none',
                        }}
                      >
                        {v.city}
                      </text>
                    )}
                  </Marker>
                )
              })}
            </ZoomableGroup>
          </ComposableMap>

          {/* Floating tooltip */}
          {hovered && (
            <div
              className="fixed z-50 pointer-events-none bg-[#17211F] border border-[#2E3F39] rounded-lg px-3 py-2 shadow-xl"
              style={{
                left: tooltipPos.x + 16,
                top: tooltipPos.y - 10,
              }}
            >
              <p className="text-text-primary text-sm font-semibold font-heading">
                {hovered}
              </p>
              <p className="text-accent-brand text-xs font-mono">
                {indianVenues.find((v) => v.city === hovered)?.matches || 0}{' '}
                matches
              </p>
              {(() => {
                const v = indianVenues.find((vv) => vv.city === hovered)
                if (v && v.venues.length > 1) {
                  return (
                    <p className="text-text-muted text-[10px] mt-0.5">
                      {v.venues.length} grounds
                    </p>
                  )
                }
                return null
              })()}
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-[#121a17]/90 border border-border-subtle rounded-lg px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] text-text-muted mb-1.5 font-heading uppercase tracking-wider">
              Matches
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-accent-brand opacity-60" />
                <span className="text-[9px] text-text-muted font-mono">
                  Few
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-accent-brand opacity-80" />
                <span className="text-[9px] text-text-muted font-mono">
                  Many
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* UAE Venues */}
          {uaeVenues.length > 0 && (
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <p className="text-xs text-text-muted uppercase tracking-wider font-heading">
                  UAE Venues
                </p>
              </div>
              {uaeVenues.map((v, i) =>
                v.venues.map((vv, j) => (
                  <button
                    key={`${i}-${j}`}
                    onClick={() =>
                      navigate(`/venues/${encodeURIComponent(vv.venue)}`)
                    }
                    className="w-full text-left flex items-center justify-between py-2 px-2 rounded-lg hover:bg-bg-card transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-accent-brand text-sm group-hover:text-white transition-colors truncate block">
                        {v.city}
                      </span>
                      <span className="text-text-muted text-[10px] truncate block">
                        {vv.venue}
                      </span>
                    </div>
                    <span className="text-amber-400 text-xs font-mono font-bold ml-2">
                      {vv.matches}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* South Africa Venues */}
          {otherVenues.length > 0 && (
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-xs text-text-muted uppercase tracking-wider font-heading">
                  South Africa
                </p>
              </div>
              {otherVenues.map((v, i) =>
                v.venues.map((vv, j) => (
                  <button
                    key={`${i}-${j}`}
                    onClick={() =>
                      navigate(`/venues/${encodeURIComponent(vv.venue)}`)
                    }
                    className="w-full text-left flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-bg-card transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-text-primary text-xs group-hover:text-accent-brand transition-colors truncate block">
                        {v.city}
                      </span>
                    </div>
                    <span className="text-emerald-400 text-[10px] font-mono font-bold ml-2">
                      {vv.matches}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Top Indian Venues */}
          <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-brand" />
              <p className="text-xs text-text-muted uppercase tracking-wider font-heading">
                Top Venues
              </p>
            </div>
            {indianVenues.slice(0, 10).map((v, i) => (
              <button
                key={i}
                onClick={() => {
                  const topVenue = [...v.venues].sort((a, b) => (b.matches || 0) - (a.matches || 0))[0]
                  if (topVenue) navigate(`/venues/${encodeURIComponent(topVenue.venue)}`)
                }}
                onMouseEnter={() => setHovered(v.city)}
                onMouseLeave={() => setHovered(null)}
                className="w-full text-left flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-bg-card transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-text-muted text-[10px] font-mono w-4 text-right">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-text-primary text-xs truncate group-hover:text-accent-brand transition-colors">
                      {v.city}
                    </p>
                    {v.venues.length > 1 && (
                      <p className="text-text-muted text-[10px]">
                        {v.venues.length} grounds
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-accent-teal text-xs font-mono font-bold ml-2">
                  {v.matches}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
