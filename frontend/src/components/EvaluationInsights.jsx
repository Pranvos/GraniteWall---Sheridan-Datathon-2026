import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Target, Users, Zap } from 'lucide-react'

const chartTip = { background: '#ffffff', border: '1px solid rgba(11,11,11,0.12)', fontSize: 12, color: '#0b0b0b' }
const colors = ['#0f62fe', '#ff334b', '#f59e0b', '#3b82f6', '#a1a1aa']
const label = (method) => method.replaceAll('_', ' ')
const percent = (value) => `${(Number(value) * 100).toFixed(2)}%`
const tick = { fill: '#71717a', fontSize: 10 }
const grid = '#e4e4e7'

function Metric({ icon: Icon, title, value, detail, tone }) {
  return (
    <div className="soc-panel p-4">
      <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] ${tone}`}>
        <Icon size={14} /> {title}
      </div>
      <div className="mt-2 font-mono text-xl font-semibold text-[#0b0b0b]">{value}</div>
      <div className="mt-1 text-xs text-[#71717a]">{detail}</div>
    </div>
  )
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <div className="soc-panel p-5">
      <div className="mb-4"><h3 className="panel-title">{title}</h3><p className="panel-subtitle">{subtitle}</p></div>
      <div className="h-64">{children}</div>
    </div>
  )
}

export default function EvaluationInsights({ summary, results, loading, error }) {
  const methods = summary.map((row) => row.method)
  const monthly = [...results].sort((a, b) => a.month.localeCompare(b.month))
  const trend = monthly.reduce((months, row) => {
    const current = months.get(row.month) || { month: row.month }
    current[`${row.method}_hits`] = row.hits
    current[`${row.method}_precision`] = row.precision
    current[`${row.method}_recall`] = row.recall
    current[`${row.method}_candidates`] = row.candidates
    current[`${row.method}_positives`] = row.positives
    months.set(row.month, current)
    return months
  }, new Map())
  const trendRows = [...trend.values()]
  const best = summary.reduce((winner, row) => (!winner || row.precision > winner.precision ? row : winner), null)
  const totals = results.reduce((acc, row) => ({
    hits: acc.hits + row.hits,
    candidates: acc.candidates + row.candidates,
    positives: acc.positives + row.positives,
  }), { hits: 0, candidates: 0, positives: 0 })

  if (!summary.length && !results.length) {
    return (
      <div className="soc-panel p-5 text-sm text-[#71717a]">
        {loading ? 'Loading evaluation feed…' : error ? `Evaluation unavailable: ${error}` : 'No evaluation data available.'}
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Target} title="Best precision@500" value={best ? percent(best.precision) : '—'} detail={best ? label(best.method) : 'No method'} tone="text-[#0f62fe]" />
        <Metric icon={Activity} title="Total hits" value={totals.hits.toLocaleString()} detail="Across monthly evaluations" tone="text-[#0b0b0b]" />
        <Metric icon={Users} title="Candidates" value={totals.candidates.toLocaleString()} detail="Monthly ranking pools" tone="text-[#f59e0b]" />
        <Metric icon={Zap} title="Positives" value={totals.positives.toLocaleString()} detail="Future KEV additions" tone="text-[#ff334b]" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Method comparison" subtitle="Hits, precision@500, recall@500, candidates and positives">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary} layout="vertical" margin={{ left: 18, right: 18 }}>
              <CartesianGrid stroke={grid} horizontal={false} />
              <XAxis type="number" tick={tick} />
              <YAxis type="category" dataKey="method" width={105} tick={tick} tickFormatter={label} />
              <Tooltip contentStyle={chartTip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="hits" fill="#0f62fe" name="Hits" />
              <Bar dataKey="positives" fill="#ff334b" name="Positives" />
              <Bar dataKey="candidates" fill="#f59e0b" name="Candidates" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Precision and recall" subtitle="Ranking quality at the top 500">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary} margin={{ left: 4, right: 12 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="method" tick={tick} tickFormatter={label} />
              <YAxis tick={tick} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
              <Tooltip contentStyle={chartTip} formatter={(value) => percent(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="precision" fill="#0f62fe" name="Precision@500" />
              <Bar dataKey="recall" fill="#ff334b" name="Recall@500" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Monthly hits" subtitle="Confirmed ranking hits by method">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendRows} margin={{ right: 16 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} />
              <YAxis tick={tick} />
              <Tooltip contentStyle={chartTip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {methods.map((method, index) => <Line key={`${method}-hits`} type="monotone" dataKey={`${method}_hits`} stroke={colors[index % colors.length]} name={`${label(method)} hits`} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Monthly quality" subtitle="Precision@500 and recall@500 by method">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendRows} margin={{ right: 16 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} />
              <YAxis tick={tick} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
              <Tooltip contentStyle={chartTip} formatter={(value) => percent(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {methods.map((method, index) => <Line key={`${method}-precision`} type="monotone" dataKey={`${method}_precision`} stroke={colors[index % colors.length]} name={`${label(method)} precision`} strokeWidth={2} dot={false} />)}
              {methods.map((method, index) => <Line key={`${method}-recall`} type="monotone" dataKey={`${method}_recall`} stroke={colors[index % colors.length]} strokeDasharray="4 4" name={`${label(method)} recall`} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Monthly volume" subtitle="Candidates and future positives by method">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendRows} margin={{ right: 16 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} />
              <YAxis tick={tick} />
              <Tooltip contentStyle={chartTip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {methods.map((method, index) => <Line key={`${method}-candidates`} type="monotone" dataKey={`${method}_candidates`} stroke={colors[index % colors.length]} name={`${label(method)} candidates`} strokeWidth={2} dot={false} />)}
              {methods.map((method, index) => <Line key={`${method}-positives`} type="monotone" dataKey={`${method}_positives`} stroke={colors[index % colors.length]} strokeDasharray="4 4" name={`${label(method)} positives`} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="overflow-x-auto soc-panel">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-black/10 font-mono text-[10px] uppercase tracking-wider text-[#71717a]">
            <tr>{['Month', 'Method', 'Hits', 'Precision@500', 'Recall@500', 'Candidates', 'Positives'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
          </thead>
          <tbody>{monthly.map((row) => <tr key={`${row.month}-${row.method}`} className="border-b border-black/10/70 text-[#3f3f46]">
            <td className="px-4 py-3 font-mono">{row.month}</td><td className="px-4 py-3">{label(row.method)}</td><td className="px-4 py-3 font-mono">{row.hits}</td><td className="px-4 py-3 font-mono">{percent(row.precision)}</td><td className="px-4 py-3 font-mono">{percent(row.recall)}</td><td className="px-4 py-3 font-mono">{row.candidates}</td><td className="px-4 py-3 font-mono">{row.positives}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}
