import { Link } from 'react-router-dom'
import DataTable from '../ui/DataTable'
import { formatDecimal } from '../../utils/format'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const PIE_COLORS = ['#C3F23B', '#FF2D78', '#2DD4BF', '#FFB800', '#8B5CF6', '#22C55E', '#EF4444', '#6366F1']
const AXIS = { fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }
const LINE = { stroke: '#22302B' }
const mono = (v) => <span className="font-mono">{v ?? '-'}</span>
const dec = (v) => <span className="font-mono">{v == null ? '-' : formatDecimal(v)}</span>
const phaseOf = (over) => (over <= 6 ? '#C3F23B' : over <= 15 ? '#FFB800' : '#FF2D78')
const POSITION_LABEL = { 1: 'Opener', 2: 'Opener', 3: 'No. 3', 4: 'No. 4', 5: 'No. 5', 6: 'No. 6', 7: 'No. 7' }

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#17211F] border border-[#2E3F39] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[#9AA69F] text-xs mb-1 font-mono">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color || '#F3F4EE' }}>
          {entry.name}: <span className="font-mono font-semibold">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  )
}

function Section({ title, color = 'cyan', note, children }) {
  const colorMap = { cyan: 'bg-accent-brand', magenta: 'bg-accent-magenta', lime: 'bg-accent-teal', amber: 'bg-accent-amber' }
  return (
    <section className="animate-in">
      <div className="flex items-baseline gap-3 mb-4">
        <div className={`w-1 h-6 self-center ${colorMap[color] || colorMap.cyan} rounded-full`} />
        <h2 className="text-xl font-heading font-bold text-text-primary">{title}</h2>
        {note && <span className="text-xs text-text-muted font-mono">{note}</span>}
      </div>
      {children}
    </section>
  )
}

const venueLink = (v) => <Link to={`/venues/${encodeURIComponent(v)}`} className="text-accent-brand hover:underline">{v}</Link>

export function BattingSplits({ splits }) {
  if (!splits) return null
  const positionCols = [
    { key: 'position', label: 'Position', render: (v) => <span className="text-text-primary">{v} <span className="text-text-muted text-xs">{POSITION_LABEL[v] || ''}</span></span> },
    { key: 'innings', label: 'Inn', align: 'right', render: mono },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-teal">{v}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: dec },
    { key: 'sr', label: 'SR', align: 'right', render: dec },
    { key: 'highest', label: 'HS', align: 'right', render: mono },
    { key: 'fifties', label: '50s', align: 'right', render: mono },
    { key: 'hundreds', label: '100s', align: 'right', render: mono },
  ]
  const venueCols = [
    { key: 'venue', label: 'Venue', render: venueLink },
    { key: 'innings', label: 'Inn', align: 'right', render: mono },
    { key: 'runs', label: 'Runs', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-teal">{v}</span> },
    { key: 'avg', label: 'Avg', align: 'right', render: dec },
    { key: 'sr', label: 'SR', align: 'right', render: dec },
    { key: 'highest', label: 'HS', align: 'right', render: mono },
    { key: 'sixes', label: '6s', align: 'right', render: mono },
  ]
  const dismissals = (splits.dismissals || []).map((d) => ({ name: d.kind, value: d.count }))
  const total = dismissals.reduce((n, d) => n + d.value, 0) || 1

  return (
    <div className="space-y-8">
      {splits.by_over?.length > 0 && (
        <Section title="Scoring by Over" color="lime" note="runs and strike rate in each over faced">
          <div className="card">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={splits.by_over} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22302B" />
                <XAxis dataKey="over" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                <YAxis yAxisId="runs" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                <YAxis yAxisId="sr" orientation="right" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                <Bar yAxisId="runs" dataKey="runs" name="Runs" radius={[3, 3, 0, 0]}>
                  {splits.by_over.map((r) => <Cell key={r.over} fill={phaseOf(r.over)} fillOpacity={0.85} />)}
                </Bar>
                <Line yAxisId="sr" type="monotone" dataKey="sr" name="Strike rate" stroke="#F3F4EE" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-text-muted font-mono mt-2">Bars: powerplay cyan, middle amber, death magenta.</p>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {splits.positions?.length > 0 && (
          <Section title="By Batting Position" color="amber">
            <DataTable columns={positionCols} data={splits.positions.map((r) => ({ ...r, id: r.position }))} />
          </Section>
        )}
        {splits.scores?.length > 0 && (
          <Section title="Innings by Score" color="cyan">
            <div className="card">
              <ResponsiveContainer width="100%" height={splits.positions?.length ? 300 : 240}>
                <BarChart data={splits.scores} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#22302B" horizontal={false} />
                  <XAxis type="number" tick={AXIS} axisLine={LINE} tickLine={LINE} allowDecimals={false} />
                  <YAxis type="category" dataKey="bucket" width={90} tick={AXIS} axisLine={LINE} tickLine={LINE} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="innings" name="Innings" fill="#C3F23B" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#9AA69F', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {splits.venues?.length > 0 && (
          <Section title="By Venue" color="lime">
            <DataTable columns={venueCols} data={splits.venues.map((r) => ({ ...r, id: r.venue }))} pageSize={10} />
          </Section>
        )}
        {dismissals.length > 0 && (
          <Section title="How Dismissed" color="magenta">
            <div className="card">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={dismissals} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name"
                    label={({ name, value }) => `${name} ${Math.round(value * 100 / total)}%`}>
                    {dismissals.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

export function BowlingSplits({ splits }) {
  if (!splits) return null
  const venueCols = [
    { key: 'venue', label: 'Venue', render: venueLink },
    { key: 'innings', label: 'Inn', align: 'right', render: mono },
    { key: 'balls', label: 'Balls', align: 'right', render: mono },
    { key: 'wickets', label: 'Wkts', align: 'right', render: (v) => <span className="font-mono font-semibold text-accent-magenta">{v}</span> },
    { key: 'economy', label: 'Econ', align: 'right', render: dec },
    { key: 'avg', label: 'Avg', align: 'right', render: dec },
    { key: 'dot_pct', label: 'Dot %', align: 'right', render: (v) => mono(v == null ? '-' : `${v}%`) },
  ]
  return (
    <div className="space-y-8">
      {splits.by_over?.length > 0 && (
        <Section title="Economy by Over" color="magenta" note="what each over costs and takes">
          <div className="card">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={splits.by_over} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22302B" />
                <XAxis dataKey="over" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                <YAxis yAxisId="econ" tick={AXIS} axisLine={LINE} tickLine={LINE} />
                <YAxis yAxisId="wkts" orientation="right" tick={AXIS} axisLine={LINE} tickLine={LINE} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
                <Bar yAxisId="econ" dataKey="economy" name="Economy" radius={[3, 3, 0, 0]}>
                  {splits.by_over.map((r) => <Cell key={r.over} fill={phaseOf(r.over)} fillOpacity={0.85} />)}
                </Bar>
                <Line yAxisId="wkts" type="monotone" dataKey="wickets" name="Wickets" stroke="#F3F4EE" strokeWidth={2} dot={{ r: 3, fill: '#F3F4EE' }} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-text-muted font-mono mt-2">Bars: powerplay cyan, middle amber, death magenta. Overs with very few balls swing wildly.</p>
          </div>
        </Section>
      )}
      {splits.venues?.length > 0 && (
        <Section title="By Venue" color="magenta">
          <DataTable columns={venueCols} data={splits.venues.map((r) => ({ ...r, id: r.venue }))} pageSize={10} />
        </Section>
      )}
    </div>
  )
}
