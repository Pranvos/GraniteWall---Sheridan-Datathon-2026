import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

const colors = {
  precision: '#0f62fe',
  recall: '#A65A48',
  winner: '#0f62fe',
  baseline: '#A1A1AA',
}
const tick = { fill: 'var(--meta)', fontSize: 11, fontFamily: 'Montserrat, sans-serif' }
const grid = 'var(--line)'

const label = (method) => String(method || '').replaceAll('_', ' ')
const percent = (value, digits = 1) => `${(Number(value) * 100).toFixed(digits)}%`
const percentLabel = (value) => percent(value, 1)

/**
 * Risk rankings as a short evaluation story — fewer figures, each explained.
 */
export default function EvaluationInsights({ summary, results, loading, error }) {
  const ranked = [...summary].sort((a, b) => b.precision - a.precision)
  const best = ranked[0] || null
  const baseline = ranked.find((row) => row.method === 'cvss3') || ranked[ranked.length - 1] || null
  const runnerUp = ranked[1] || null

  const chartData = ranked.map((row) => ({
    ...row,
    methodLabel: label(row.method),
  }))

  const methodsToPlot = [best?.method, baseline?.method].filter(Boolean)
  const monthly = [...results].sort((a, b) => a.month.localeCompare(b.month))
  const trendRows = monthly.reduce((months, row) => {
    if (!methodsToPlot.includes(row.method)) return months
    const current = months.get(row.month) || { month: row.month }
    current[row.method] = row.hits
    months.set(row.month, current)
    return months
  }, new Map())
  const trendData = [...trendRows.values()]

  const hitLift =
    best && baseline && baseline.hits > 0
      ? ((best.hits - baseline.hits) / baseline.hits) * 100
      : null

  if (!summary.length && !results.length) {
    return (
      <div
        className="border border-[var(--line)] px-5 py-8 text-sm text-[var(--meta)]"
        style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
      >
        {loading
          ? 'Loading evaluation feed…'
          : error
            ? `Evaluation unavailable: ${error}`
            : 'No evaluation data available.'}
      </div>
    )
  }

  return (
    <section
      className="mx-auto max-w-5xl space-y-0 bg-transparent"
      style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
    >
      <header className="border-b border-[var(--line)] pb-10 pt-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--meta)]">
          Held-out ranking evaluation
        </p>
        <h2 className="mt-4 max-w-[22ch] text-[clamp(1.85rem,3.5vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
          Does the ranking recover future exploited CVEs?
        </h2>
        <p className="mt-4 max-w-2xl text-[1.1rem] leading-relaxed text-[var(--meta)]">
          Each month we hide later KEV additions, rank the pool, and score the top 500.
          Precision asks how many of those 500 were truly exploited later. Recall asks how many
          of the future exploits we caught.
        </p>
      </header>

      {/* Beat 1 — winning method */}
      <article className="grid gap-6 border-b border-[var(--line)] py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-center">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">01</p>
          <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
            Best precision@500
          </h3>
          <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
            {best
              ? `${label(best.method)} leads the evaluation window. That is the ranking signal we trust when placing Critical findings on the sonar.`
              : 'No winning method available yet.'}
          </p>
          {runnerUp ? (
            <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-[var(--meta)]">
              Next closest: {label(runnerUp.method)} at {percent(runnerUp.precision)}.
            </p>
          ) : null}
        </div>
        <div className="md:pl-6 md:text-right">
          <p className="text-[clamp(4.5rem,12vw,7.5rem)] font-semibold tabular-nums leading-[0.9] tracking-[-0.05em] text-[var(--ink)]">
            {best ? percent(best.precision) : '—'}
          </p>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--meta)]">
            {best ? label(best.method) : 'best method'}
          </p>
        </div>
      </article>

      {/* Beat 2 — precision / recall figure */}
      <article className="border-b border-[var(--line)] py-14">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">02</p>
        <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
          Precision and recall across methods
        </h3>
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
          Blue is precision@500: how clean the top slice is. Terracotta is recall@500: how much of
          the future-exploited set that slice recovers. CVSS alone barely moves the needle.
        </p>

        <div className="mt-10 h-[22rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 28, right: 12, left: 4, bottom: 8 }}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="methodLabel" tick={tick} axisLine={false} tickLine={false} />
              <YAxis
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                width={42}
              />
              <Bar
                dataKey="precision"
                fill={colors.precision}
                name="Precision@500"
                maxBarSize={42}
                isAnimationActive={false}
                activeBar={false}
              >
                <LabelList
                  dataKey="precision"
                  position="top"
                  formatter={percentLabel}
                  style={{ fill: 'var(--ink)', fontSize: 11, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}
                />
              </Bar>
              <Bar
                dataKey="recall"
                fill={colors.recall}
                name="Recall@500"
                maxBarSize={42}
                isAnimationActive={false}
                activeBar={false}
              >
                <LabelList
                  dataKey="recall"
                  position="top"
                  formatter={percentLabel}
                  style={{ fill: 'var(--ink)', fontSize: 11, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-6 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--meta)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: colors.precision }} /> Precision@500
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: colors.recall }} /> Recall@500
          </span>
        </div>
      </article>

      {/* Beat 3 — lift vs weak baseline */}
      {best && baseline && best.method !== baseline.method ? (
        <article className="grid gap-6 border-b border-[var(--line)] py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">03</p>
            <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
              Hits versus a weak baseline
            </h3>
            <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
              Average monthly hits in the top 500. {label(best.method)} recovers far more future
              exploited CVEs than {label(baseline.method)}, which is why severity alone is not
              enough for the sonar.
            </p>
          </div>
          <div className="md:pl-6 md:text-right">
            <p className="text-[clamp(4.5rem,12vw,7.5rem)] font-semibold tabular-nums leading-[0.9] tracking-[-0.05em] text-[var(--ink)]">
              {best.hits.toFixed(1)}
            </p>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--meta)]">
              avg hits / month · {label(best.method)}
            </p>
            {hitLift != null ? (
              <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--meta-soft)]">
                {hitLift >= 0 ? '+' : ''}
                {hitLift.toFixed(0)}% vs {label(baseline.method)}
              </p>
            ) : null}
          </div>
        </article>
      ) : null}

      {/* Beat 4 — one trend line only */}
      {trendData.length > 1 && methodsToPlot.length >= 1 ? (
        <article className="border-b border-[var(--line)] py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">04</p>
          <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
            Monthly hits over the evaluation window
          </h3>
          <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
            One chart, two methods: the leader against the weak baseline. Stability across months
            matters more than a single lucky window.
          </p>

          <div className="mt-10 h-[20rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                {best ? (
                  <Line
                    type="monotone"
                    dataKey={best.method}
                    stroke={colors.winner}
                    strokeWidth={2.25}
                    dot={false}
                    isAnimationActive={false}
                    name={label(best.method)}
                  />
                ) : null}
                {baseline && baseline.method !== best?.method ? (
                  <Line
                    type="monotone"
                    dataKey={baseline.method}
                    stroke={colors.baseline}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name={label(baseline.method)}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-6 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--meta)]">
            {best ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: colors.winner }} /> {label(best.method)}
              </span>
            ) : null}
            {baseline && baseline.method !== best?.method ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: colors.baseline }} /> {label(baseline.method)}
              </span>
            ) : null}
          </div>
        </article>
      ) : null}

      {/* Compact method strip — replaces the giant monthly table */}
      <article className="py-14">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">05</p>
        <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
          Method scoreboard
        </h3>
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
          Aggregated across the held-out months. Use this as the shortlist, not a raw dump of every
          monthly cell.
        </p>

        <div className="mt-8 divide-y divide-black/10 border-y border-[var(--line)]">
          {ranked.map((row, index) => (
            <div
              key={row.method}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 py-5 sm:grid-cols-[3rem_1fr_repeat(3,minmax(0,5.5rem))]"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--meta-soft)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {label(row.method)}
              </span>
              <span className="text-right font-semibold tabular-nums text-[var(--ink)] sm:text-left">
                {percent(row.precision)}
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--meta-soft)]">
                  precision
                </span>
              </span>
              <span className="col-span-3 hidden text-right font-semibold tabular-nums text-[var(--ink)] sm:col-span-1 sm:block sm:text-left">
                {percent(row.recall)}
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--meta-soft)]">
                  recall
                </span>
              </span>
              <span className="col-span-3 hidden text-right font-semibold tabular-nums text-[var(--ink)] sm:col-span-1 sm:block sm:text-left">
                {row.hits.toFixed(1)}
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--meta-soft)]">
                  avg hits
                </span>
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
