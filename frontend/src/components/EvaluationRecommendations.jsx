const methodLabel = (method) => String(method || '').replaceAll('_', ' ')
const percent = (value) => `${(Number(value) * 100).toFixed(2)}%`

/**
 * Recommendations as a short action story derived from evaluation.
 */
export default function EvaluationRecommendations({ summary, results, loading, error }) {
  if (!summary.length && !results.length) {
    return (
      <section
        className="border-b border-[var(--line)] py-10 text-sm text-[var(--meta)]"
        style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
      >
        {loading
          ? 'Loading evaluation feed…'
          : error
            ? `Recommendations unavailable: ${error}`
            : 'No evaluation data available for recommendations.'}
      </section>
    )
  }

  const bestPrecision = summary.reduce(
    (winner, row) => (!winner || row.precision > winner.precision ? row : winner),
    null,
  )
  const bestRecall = summary.reduce(
    (winner, row) => (!winner || row.recall > winner.recall ? row : winner),
    null,
  )
  const latestMonth = [...results].sort((a, b) => b.month.localeCompare(a.month))[0]?.month
  const latestResults = results.filter((row) => row.month === latestMonth)
  const latestWeakest = latestResults.reduce(
    (weakest, row) => (!weakest || row.precision < weakest.precision ? row : weakest),
    null,
  )

  const beats = []
  if (bestPrecision) {
    beats.push({
      step: '01',
      label: 'Precision',
      title: `Triage the queue with ${methodLabel(bestPrecision.method)}`,
      body: 'When review time is limited, start here. This method posts the strongest precision@500, so the first batch should carry fewer false positives into analyst work.',
      figure: percent(bestPrecision.precision),
      figureLabel: 'precision@500',
      impact: `Expect roughly ${Math.round(bestPrecision.precision * 500)} confirmed positives inside a top-500 pass.`,
    })
  }
  if (bestRecall) {
    beats.push({
      step: '02',
      label: 'Coverage',
      title: `Widen the net with ${methodLabel(bestRecall.method)}`,
      body: 'When missing a future exploit costs more than extra reviews, switch to the strongest recall@500. Accept a broader queue to recover more of the held-out positives.',
      figure: percent(bestRecall.recall),
      figureLabel: 'recall@500',
      impact: 'Use this mode for miss-sensitive sweeps before locking Critical items onto the sonar.',
    })
  }
  if (latestWeakest && latestMonth) {
    beats.push({
      step: '03',
      label: 'Caution',
      title: `Do not automate ${methodLabel(latestWeakest.method)} yet`,
      body: `In ${latestMonth}, this was the weakest precision among reported methods. Keep it out of automatic prioritization until the next evaluation refresh.`,
      figure: percent(latestWeakest.precision),
      figureLabel: `${latestMonth} precision@500`,
      impact: 'Treat this as a monitoring flag, not a live ranking policy for the queue.',
    })
  }

  return (
    <section
      className="mx-auto max-w-5xl bg-transparent"
      style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
    >
      <header className="border-b border-[var(--line)] pb-10 pt-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--meta)]">
          From evaluation to action
        </p>
        <h2 className="mt-4 max-w-[20ch] text-[clamp(1.85rem,3.5vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
          How to run the queue from what the rankings proved.
        </h2>
        <p className="mt-4 max-w-2xl text-[1.1rem] leading-relaxed text-[var(--meta)]">
          These priorities come straight from the held-out summary. They tell you which ranking
          method to lean on for triage, coverage, or caution — not a separate dashboard of advice cards.
        </p>
      </header>

      {beats.map((beat, index) => (
        <article
          key={beat.step}
          className={`grid gap-6 py-14 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-end ${
            index < beats.length - 1 ? 'border-b border-[var(--line)]' : ''
          }`}
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">
              {beat.step} · {beat.label}
            </p>
            <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
              {beat.title}
            </h3>
            <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
              {beat.body}
            </p>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-[var(--meta)]">{beat.impact}</p>
          </div>
          <div className="md:pl-6 md:text-right">
            <p className="text-[clamp(3.5rem,9vw,5.5rem)] font-semibold tabular-nums leading-[0.9] tracking-[-0.05em] text-[var(--ink)]">
              {beat.figure}
            </p>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--meta)]">
              {beat.figureLabel}
            </p>
          </div>
        </article>
      ))}
    </section>
  )
}
