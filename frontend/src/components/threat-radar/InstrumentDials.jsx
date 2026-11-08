import { motion } from 'framer-motion'

/**
 * Chronograph-style subsidiary dials under the Critical sonar.
 */
const DIALS = [
  {
    key: 'critical',
    label: 'Critical',
    sub: 'On sonar',
    valueKey: 'critical',
    maxKey: 'cohortCritical',
    accent: '#A65A48',
  },
  {
    key: 'epss',
    label: 'EPSS',
    sub: 'Avg field',
    valueKey: 'epssPct',
    max: 100,
    suffix: '%',
    accent: '#9A7B4A',
  },
  {
    key: 'confidence',
    label: 'Granite',
    sub: 'Avg conf.',
    valueKey: 'confidencePct',
    max: 100,
    suffix: '%',
    accent: '#171717',
  },
]

function Gauge({ label, sub, value, max, suffix = '', accent, delay = 0 }) {
  const safeMax = Math.max(max || 1, 1)
  const ratio = Math.min(1, Math.max(0, value / safeMax))
  const start = -135
  const sweep = 270 * ratio
  const needle = start + sweep
  const size = 112
  const cx = size / 2
  const cy = size / 2
  const r = 42

  const ticks = []
  for (let i = 0; i <= 27; i++) {
    const major = i % 3 === 0
    const deg = start + (270 * i) / 27
    const rad = (deg * Math.PI) / 180
    const outer = r
    const inner = major ? r - 7 : r - 3.5
    ticks.push({
      key: i,
      major,
      x1: cx + Math.cos(rad) * inner,
      y1: cy + Math.sin(rad) * inner,
      x2: cx + Math.cos(rad) * outer,
      y2: cy + Math.sin(rad) * outer,
    })
  }

  const needleRad = (needle * Math.PI) / 180
  const tip = {
    x: cx + Math.cos(needleRad) * (r - 10),
    y: cy + Math.sin(needleRad) * (r - 10),
  }
  const tail = {
    x: cx - Math.cos(needleRad) * 8,
    y: cy - Math.sin(needleRad) * 8,
  }

  const display =
    suffix === '%' ? Math.round(value) : Number.isInteger(value) ? value : Number(value).toFixed(0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex flex-col items-center"
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[7rem] w-[7rem] sm:h-[7.5rem] sm:w-[7.5rem]" aria-hidden>
        <circle cx={cx} cy={cy} r={r + 1} fill="#FFFFFF" stroke="#D9D9D9" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke="#EFEFEF" strokeWidth="0.75" />

        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? '#343434' : '#C8C8C8'}
            strokeWidth={t.major ? 1.1 : 0.55}
            strokeLinecap="square"
          />
        ))}

        <path d={describeArc(cx, cy, r - 1, start, start + 270)} fill="none" stroke="#E8E8E8" strokeWidth="1.25" />
        <path
          d={describeArc(cx, cy, r - 1, start, needle)}
          fill="none"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="square"
        />

        <line
          x1={tail.x}
          y1={tail.y}
          x2={tip.x}
          y2={tip.y}
          stroke="#171717"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={2.2} fill="#171717" />

        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fill="#171717"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
        >
          {display}
          {suffix}
        </text>
      </svg>
      <p className="mt-1 font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.28em] text-[#171717]">
        {label}
      </p>
      <p className="mt-0.5 font-[family-name:var(--font-sans)] text-[9px] uppercase tracking-[0.18em] text-[#A5A5A5]">
        {sub}
      </p>
    </motion.div>
  )
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  if (Math.abs(endAngle - startAngle) < 0.01) {
    const p = polarToCartesian(cx, cy, r, startAngle)
    return `M ${p.x} ${p.y}`
  }
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const large = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
}

export default function InstrumentDials({ summary }) {
  const confidencePct = Math.round((summary.avgConfidence || 0) * 100)
  const epssPct = Math.round((summary.avgEpss || 0) * 100)

  const values = {
    critical: summary.critical,
    epssPct,
    confidencePct,
    cohortCritical: Math.max(summary.cohortCritical || summary.critical, 1),
  }

  return (
    <div className="mt-10 w-full border-t border-[#EFEFEF] pt-8">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <p className="font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.32em] text-[#A5A5A5]">
          Instrument registers
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#C0C0C0]">
          Critical band only
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        {DIALS.map((dial, index) => (
          <Gauge
            key={dial.key}
            label={dial.label}
            sub={dial.sub}
            value={values[dial.valueKey]}
            max={dial.max ?? values[dial.maxKey]}
            suffix={dial.suffix || ''}
            accent={dial.accent}
            delay={0.15 + index * 0.06}
          />
        ))}
      </div>
    </div>
  )
}
