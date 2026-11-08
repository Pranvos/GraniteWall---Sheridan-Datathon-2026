import { AlertTriangle, ArrowUpRight, Gauge, Target } from 'lucide-react'
import { useState } from 'react'

const methodLabel = (method) => method.replaceAll('_', ' ')
const percent = (value) => `${(Number(value) * 100).toFixed(2)}%`
const readmeUrl = 'https://github.com/Pranvos/GraniteWall---Sheridan-Datathon-2026/blob/main/README.md'

function RecommendationCard({ recommendation, selected, onSelect }) {
  const { icon: Icon, tone, priority, title, action, evidence, impact, readmeSection } = recommendation
  return (
    <button type="button" onClick={onSelect} className={`soc-panel w-full p-5 text-left transition ${selected ? 'border-cyan-300/70 bg-cyan-300/[0.06]' : 'hover:border-slate-600 hover:bg-slate-900/60'}`}>
      <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] ${tone}`}>
        <Icon size={15} /> {priority}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{action}</p>
      <p className="mt-4 border-t border-slate-800 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
        Evidence · {evidence}
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-cyan-300">{selected ? 'Impact details open' : 'Click to view impact'}</p>
    </button>
  )
}

export default function EvaluationRecommendations({ summary, results, loading, error }) {
  const [selectedPriority, setSelectedPriority] = useState(null)

  if (!summary.length && !results.length) {
    return (
      <section className="soc-panel p-5 text-sm text-slate-500">
        {loading ? 'Loading evaluation feed…' : error ? `Recommendations unavailable: ${error}` : 'No evaluation data available for recommendations.'}
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

  const recommendations = []
  if (bestPrecision) {
    recommendations.push({
      icon: Target,
      tone: 'text-violet-400',
      priority: 'Priority 01 · precision',
      title: `Route top-of-queue triage through ${methodLabel(bestPrecision.method)}`,
      action: `Use this method when analyst time is constrained: it produces the strongest precision@500 in the evaluation summary, so the first review batch should contain fewer false positives.`,
      evidence: `${methodLabel(bestPrecision.method)} at ${percent(bestPrecision.precision)} precision@500`,
      impact: `A top-500 review would be expected to surface about ${Math.round(bestPrecision.precision * 500)} confirmed positives per evaluation window, helping analysts spend less time on false positives.`,
      impactValue: bestPrecision.precision * 100,
      readmeSection: 'evaluation-api',
    })
  }
  if (bestRecall) {
    recommendations.push({
      icon: Gauge,
      tone: 'text-emerald-400',
      priority: 'Priority 02 · coverage',
      title: `Use ${methodLabel(bestRecall.method)} for miss-sensitive reviews`,
      action: `For coverage-focused sweeps, prefer this method and accept a broader review queue. Its recall@500 is the strongest signal in the summary for finding future positives.`,
      evidence: `${methodLabel(bestRecall.method)} at ${percent(bestRecall.recall)} recall@500`,
      impact: `This maximizes coverage of future KEV additions in the top-500 review, which is the safer mode when missing an emerging exploit is more costly than reviewing extra records.`,
      impactValue: bestRecall.recall * 100,
      readmeSection: 'evaluation-api',
    })
  }
  if (latestWeakest && latestMonth) {
    recommendations.push({
      icon: AlertTriangle,
      tone: 'text-amber-400',
      priority: 'Priority 03 · monitoring',
      title: `Investigate ${methodLabel(latestWeakest.method)} before the next refresh`,
      action: `Review this method’s inputs and ranking changes for the latest evaluation month before relying on it for automated prioritization. This is the weakest latest-month precision among reported methods.`,
      evidence: `${latestMonth} · ${methodLabel(latestWeakest.method)} at ${percent(latestWeakest.precision)} precision@500`,
      impact: `The latest-month signal is the least reliable option for automatic prioritization, so keeping it in analyst review protects the queue from a sudden quality drop.`,
      impactValue: Math.max(0, 100 - latestWeakest.precision * 100),
      readmeSection: 'chosen-live-scoring-policy',
    })
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="panel-title">Actionable recommendations</h2>
        <p className="panel-subtitle">Priorities derived from the connected evaluation summary and monthly results</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {recommendations.map((recommendation, index) => (
          <RecommendationCard
            key={recommendation.priority}
            recommendation={recommendation}
            selected={selectedPriority === index}
            onSelect={() => setSelectedPriority(index)}
          />
        ))}
      </div>
      {selectedPriority !== null && recommendations[selectedPriority] ? (
        <section className="soc-panel border-cyan-300/30 p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">Visual impact</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-100">{recommendations[selectedPriority].title}</h3>
            </div>
            <a href={`${readmeUrl}#${recommendations[selectedPriority].readmeSection}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-cyan-300 hover:text-cyan-100">
              Read implementation context <ArrowUpRight size={13} />
            </a>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{recommendations[selectedPriority].impact}</p>
          <div className="mt-5">
            <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-slate-500"><span>Expected operational impact</span><span className="text-cyan-300">Selected priority</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-violet-400 to-emerald-400" style={{ width: `${Math.min(100, Math.max(5, recommendations[selectedPriority].impactValue))}%` }} />
            </div>
          </div>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-slate-600">Source: connected evaluation summary and monthly results · README section linked above</p>
        </section>
      ) : null}
    </section>
  )
}
