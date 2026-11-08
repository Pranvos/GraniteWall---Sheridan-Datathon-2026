import { motion } from 'framer-motion'
import { Activity, ArrowLeft, Brain, Flame, ShieldAlert } from 'lucide-react'
import { MomentumChart, RiskBreakdownChart } from './AnalyticsCharts'

function StatCard({ icon: Icon, label, value, hint, accent, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="border border-[#0B0B0B]/10 bg-[#F9F9F9] p-5"
    >
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#0B0B0B]/4">
          {label}
        </span>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
      <div className="text-4xl font-black tracking-[-0.05em] text-[#0B0B0B]">{value}</div>
      {hint ? <p className="mt-2 text-xs text-[#0B0B0B]/45">{hint}</p> : null}
    </motion.div>
  )
}

function severityClass(severity) {
  if (severity === 'Critical') return 'text-[#FF334B]'
  if (severity === 'High') return 'text-[#F59E0B]'
  if (severity === 'Medium') return 'text-[#0033FF]'
  return 'text-[#737373]'
}

export default function DashboardView({ cluster, brick, onBack, embedded = false }) {
  // Support legacy `brick` shape during transition
  const source = cluster || brick
  const dash = source?.dashboard
  if (!dash) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F9F9] text-[#0B0B0B]/5">
        <button type="button" onClick={onBack} className="underline">
          ← Return to Overview
        </button>
      </div>
    )
  }

  const accent = dash.accent || source.color || '#0033FF'

  return (
    <div
      className={`relative overflow-x-hidden bg-[#F9F9F9] text-[#0B0B0B] ${
        embedded ? 'min-h-full' : 'min-h-screen'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 12% 0%, ${accent}22, transparent 50%)`,
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl flex-col gap-4 border-b border-[#0B0B0B]/10 px-4 pb-5 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:pb-6 sm:pt-8">
        <button
          type="button"
          data-cursor="hot"
          onClick={onBack}
          className="group inline-flex w-fit items-center gap-2 border border-[#0B0B0B] bg-[#0B0B0B] px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F9F9F9] transition hover:bg-[#0033FF] sm:px-4 sm:text-xs"
        >
          <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
          Return to Overview
        </button>

        <div className="text-left sm:text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#0B0B0B]/4">
            GraniteWall
          </p>
          <h1 className="mt-1 text-xl font-black uppercase tracking-[-0.04em] sm:text-2xl md:text-3xl">
            {dash.clusterName}
          </h1>
        </div>

        <div className="w-fit border border-[#0B0B0B]/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#0B0B0B]/55">
          Live feed
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 py-6 pb-16 sm:space-y-6 sm:px-6 sm:py-8">
        <section className="grid gap-px bg-[#0B0B0B]/10 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            delay={0.05}
            icon={Activity}
            label="Total Analyzed"
            value={dash.metrics.analyzed.toLocaleString()}
            hint="Assets scanned in cluster"
            accent={accent}
          />
          <StatCard
            delay={0.1}
            icon={Flame}
            label="Critical Hotspots"
            value={dash.metrics.hotspots}
            hint="Active high-signal nodes"
            accent="#FF334B"
          />
          <StatCard
            delay={0.15}
            icon={Brain}
            label="Model Confidence"
            value={`${Math.round(dash.metrics.graniteConfidence * 100)}%`}
            hint="Granite certainty"
            accent="#0033FF"
          />
          <StatCard
            delay={0.2}
            icon={ShieldAlert}
            label="Predicted Exploit"
            value={`${Math.round(dash.metrics.exploitRate * 100)}%`}
            hint="30-day likelihood"
            accent="#F59E0B"
          />
        </section>

        <section className="grid gap-px bg-[#0B0B0B]/10 lg:grid-cols-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.45 }}
            className="bg-[#F9F9F9] p-5 lg:col-span-3"
          >
            <div className="mb-4">
              <h2 className="text-lg font-black uppercase tracking-[-0.03em]">
                Vulnerability momentum
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0B0B]/4">
                Detections vs mitigations · 12 weeks
              </p>
            </div>
            <MomentumChart data={dash.weeks} accent={accent} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45 }}
            className="bg-[#F9F9F9] p-5 lg:col-span-2"
          >
            <div className="mb-4">
              <h2 className="text-lg font-black uppercase tracking-[-0.03em]">Risk breakdown</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0B0B]/4">
                Severity mix
              </p>
            </div>
            <RiskBreakdownChart data={dash.riskBreakdown} />
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: 0.45 }}
          className="border border-[#0B0B0B]/10 bg-[#F9F9F9]"
        >
          <div className="flex items-center justify-between border-b border-[#0B0B0B]/10 px-5 py-4">
            <div>
              <h2 className="text-lg font-black uppercase tracking-[-0.03em]">
                Cluster inspector
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0B0B0B]/4">
                Index {source.riskScore} · live Granite feed
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0B0B0B]/4">
                <tr className="border-b border-[#0B0B0B]/10">
                  <th className="px-5 py-3 font-medium">CVE</th>
                  <th className="px-5 py-3 font-medium">Finding</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Confidence</th>
                  <th className="px-5 py-3 font-medium">Exploit p</th>
                </tr>
              </thead>
              <tbody>
                {dash.vulns.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#0B0B0B]/05 transition hover:bg-[#0B0B0B]/[0.03]"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[#0B0B0B]/55">{row.id}</td>
                    <td className="px-5 py-3 font-medium text-[#0B0B0B]">{row.title}</td>
                    <td className={`px-5 py-3 font-bold ${severityClass(row.severity)}`}>
                      {row.severity}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-[#0B0B0B]/5">
                      {(row.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-5 py-3 tabular-nums text-[#0B0B0B]/5">
                      {(row.exploitProb * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      </main>
    </div>
  )
}
