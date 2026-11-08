import { AnimatePresence, motion } from 'framer-motion'

export default function RadarTooltip({ threat, x, y, visible }) {
  return (
    <AnimatePresence>
      {visible && threat ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          transition={{ duration: 0.16 }}
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-[120%] border border-[var(--line-strong)] bg-[var(--paper-elevated)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          style={{ left: x, top: y }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--meta)]">{threat.severity}</p>
          <p className="mt-1 font-mono text-[12px] text-[var(--ink)]">{threat.cve_id}</p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--meta)]">
            Risk {Number(threat.risk_score).toFixed(3)}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
