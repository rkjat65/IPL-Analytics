import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { getVenues } from '../lib/api'
import SEO from '../components/SEO'
import DataTable from '../components/ui/DataTable'
import Loading from '../components/ui/Loading'
import IndiaVenueMap from '../components/ui/IndiaVenueMap'
import { extractCityFromVenue } from '../components/ui/IndiaVenueMap'
import { useTournament } from '../contexts/TournamentContext'

export default function Venues() {
  const navigate = useNavigate()
  const tournament = useTournament()
  const { data: venues, loading, error } = useFetch(() => getVenues(), [])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-danger font-heading text-lg">Failed to load venues</p>
        <p className="text-text-secondary text-sm">{error}</p>
      </div>
    )
  }

  // Sort by matches descending, add city from venue name
  const sortedVenues = useMemo(() =>
    (venues || []).slice()
      .sort((a, b) => (b.matches || 0) - (a.matches || 0))
      .map(v => ({ ...v, city: v.city || extractCityFromVenue(v.venue) })),
    [venues]
  )

  const columns = [
    {
      key: 'venue',
      label: 'Venue',
      render: (val) => (
        <span className="text-accent-brand font-medium">{val}</span>
      ),
    },
    { key: 'city', label: 'City', render: (val) => <span className="text-text-secondary">{val || '-'}</span> },
    {
      key: 'matches',
      label: 'Matches',
      align: 'right',
      render: (val) => <span className="font-mono font-semibold text-text-primary">{val}</span>,
    },
  ]

  return (
    <div className="space-y-8">
      <SEO
        title={`${tournament.shortName} Venues — Stadium Stats & Records`}
        description={`${tournament.name} venue analytics with match counts, scoring records, toss decisions, chase success rates, and performance trends.`}
        url="/venues"
      />
      <div>
        <h1 className="text-3xl font-heading font-bold text-text-primary">Venue Analytics</h1>
        <p className="text-text-secondary text-sm mt-1">
          {loading ? 'Loading...' : `${sortedVenues.length} venues across all ${tournament.shortName} ${tournament.competitionLabelPlural.toLowerCase()}`}
        </p>
      </div>

      {loading ? (
        <Loading message="Loading venues..." />
      ) : (
        <>
          {tournament.isIPL && <IndiaVenueMap venues={sortedVenues} />}
          <DataTable
            columns={columns}
            data={sortedVenues}
            onRowClick={(row) => navigate(`/venues/${encodeURIComponent(row.venue)}`)}
          />
        </>
      )}
    </div>
  )
}
