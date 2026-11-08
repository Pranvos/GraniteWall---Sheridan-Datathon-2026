import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { buildRadarThreats, summarizeThreats } from '../../data/threatRadar'
import ThreatRadar from './ThreatRadar'
import ThreatMetrics from './ThreatMetrics'
import VulnerabilityInspector from './VulnerabilityInspector'

/**
 * Editorial hero — precision threat radar as the centrepiece.
 */
export default function GraniteWallHero({ riskPoints = [], onEnterOperations }) {
  const [selected, setSelected] = useState(null)

  const threats = useMemo(() => buildRadarThreats(riskPoints), [riskPoints])
  const summary = useMemo(() => summarizeThreats(threats, riskPoints), [threats, riskPoints])
  const sourceLabel =
    riskPoints.length > 0
      ? `Critical sonar · top 5% of ranked top-${riskPoints.length}`
      : 'Critical sonar · Granite top-priority band'

  const selectedThreat = selected
    ? threats.find((t) => t.cve_id === selected) || null
    : null

  return (
    <section className="relative bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-10 sm:px-8 lg:px-12 lg:pb-24 lg:pt-14">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10 lg:items-start">
          {/* Editorial */}
          <div className="lg:col-span-5 lg:pt-6">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[10px] font-bold uppercase tracking-[0.36em] text-[var(--meta)]"
              style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
            >
              Threat intelligence / Vulnerability analysis
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-6 max-w-[16ch] text-[clamp(2.1rem,4.4vw,3.35rem)] font-semibold leading-[1.12] tracking-[-0.035em] text-[var(--ink)] line-clamp-3"
              style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
            >
              An AI-powered early warning radar that predicts which vulnerabilities attackers will weaponize next.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--meta)]"
            >
              SonarScan ranks vulnerabilities with IBM Granite embeddings, EPSS, and exploit
              signals. The sonar shows only the Critical band, the top 5% of the scored top-500,
              spaced as blips so the most urgent findings stay readable.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-8 flex flex-wrap items-center gap-4"
            >
              <button
                type="button"
                onClick={() => onEnterOperations?.()}
                className="border border-[var(--ink)] bg-[var(--ink)] px-5 py-3 font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.22em] text-[var(--paper)] transition hover:bg-transparent hover:text-[var(--ink)]"
              >
                Enter operations
              </button>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--meta-soft)]">
                IBM Granite · Datathon
              </p>
            </motion.div>

            <div className="mt-12 border-t border-[var(--line)] pt-8">
              <ThreatMetrics summary={summary} sourceLabel={sourceLabel} />
            </div>
          </div>

          {/* Instrument */}
          <div className="lg:col-span-7">
            <div
              className={`grid gap-8 ${
                selectedThreat ? 'xl:grid-cols-[minmax(0,1fr)_minmax(16rem,18.5rem)] xl:items-center' : ''
              }`}
            >
              <div id="critical-sonar" className="flex scroll-mt-24 flex-col items-center">
                <p
                  className="mb-3 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--meta)]"
                  style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
                >
                  Critical sonar
                </p>
                <ThreatRadar
                  threats={threats}
                  selectedId={selected}
                  onSelect={(threat) => setSelected(threat?.cve_id || null)}
                />
                <p className="mt-5 max-w-sm text-center font-[family-name:var(--font-sans)] text-[11px] leading-relaxed text-[var(--meta-soft)]">
                  Blips appear when the sweep finds them, fade across ~¾ of a revolution,
                  then stay dark until the next pass. Higher risk closer to centre.
                </p>

              </div>

              <VulnerabilityInspector
                threat={selectedThreat}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
