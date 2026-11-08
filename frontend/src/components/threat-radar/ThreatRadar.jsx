import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import RadarTooltip from './RadarTooltip'

const SIZE = 640
const CX = SIZE / 2
const CY = SIZE / 2
const R = 268
/** Full revolution — slower sweep so fade timing reads clearly */
const SWEEP_PERIOD_MS = 18000
/** Blip visible while fading for this fraction of a revolution */
const FADE_FRACTION = 0.75

function polar(angle, radius) {
  return {
    x: CX + Math.cos(angle - Math.PI / 2) * radius,
    y: CY + Math.sin(angle - Math.PI / 2) * radius,
  }
}

/**
 * How far the sweep has traveled past a blip, as a fraction of one revolution [0, 1).
 * 0 = just illuminated; approaches 1 just before the next pass.
 */
function sweepProgress(sweepAngle, blipAngle) {
  let d = sweepAngle - blipAngle
  d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return d / (Math.PI * 2)
}

/**
 * Opacity from radar persistence:
 * 0 → 0.75 rev: fade 1 → 0
 * 0.75 → 1.0 rev: stay at 0 (disappeared)
 */
function blipOpacity(progress) {
  if (progress >= FADE_FRACTION) return 0
  return 1 - progress / FADE_FRACTION
}

function SonarFace() {
  const ticks = useMemo(() => {
    const marks = []
    for (let i = 0; i < 180; i++) {
      const major = i % 15 === 0
      const medium = i % 5 === 0
      const angle = (i / 180) * Math.PI * 2
      const outer = R
      const inner = major ? R - 16 : medium ? R - 9 : R - 5
      const a = polar(angle, outer)
      const b = polar(angle, inner)
      marks.push({
        key: i,
        major,
        medium,
        d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      })
    }
    return marks
  }, [])

  const rings = [0.28, 0.52, 0.76, 1]

  return (
    <g>
      <circle cx={CX} cy={CY} r={R + 1} fill="var(--radar-fill)" stroke="var(--radar-ring)" strokeWidth="1" />

      {rings.map((t, i) => (
        <circle
          key={t}
          cx={CX}
          cy={CY}
          r={R * t}
          fill="none"
          stroke="var(--radar-ring)"
          strokeWidth={i === rings.length - 1 ? 1.15 : 0.7}
          opacity={i === rings.length - 1 ? 1 : 0.75}
        />
      ))}

      <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="var(--line)" strokeWidth="0.6" />
      <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="var(--line)" strokeWidth="0.6" />

      {ticks.map((tick) => (
        <path
          key={tick.key}
          d={tick.d}
          stroke={tick.major ? 'var(--radar-tick)' : tick.medium ? 'var(--radar-tick-soft)' : 'var(--radar-ring)'}
          strokeWidth={tick.major ? 1.15 : 0.55}
          strokeLinecap="square"
        />
      ))}

      <text
        x={CX}
        y={CY - R * 0.52 - 8}
        fill="var(--meta-soft)"
        fontSize="8"
        letterSpacing="2.4"
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-sans), Helvetica Neue, sans-serif' }}
      >
        CRITICAL FIELD
      </text>

      <circle cx={CX} cy={CY} r={3} fill="var(--ink)" />
      <circle cx={CX} cy={CY} r={7} fill="none" stroke="var(--radar-ring)" strokeWidth="0.75" />
    </g>
  )
}

function SweepBeam({ angle }) {
  const tip = polar(angle, R - 2)
  const spread = 0.18
  const left = polar(angle - spread, R - 2)
  const right = polar(angle + spread, R - 2)

  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="gw-sweep-fade" gradientUnits="userSpaceOnUse" x1={CX} y1={CY} x2={tip.x} y2={tip.y}>
          <stop offset="0%" stopColor="var(--radar-blip)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--radar-blip)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path
        d={`M ${CX} ${CY} L ${left.x} ${left.y} A ${R - 2} ${R - 2} 0 0 1 ${right.x} ${right.y} Z`}
        fill="url(#gw-sweep-fade)"
      />
      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--radar-blip)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.65"
      />
    </g>
  )
}

function SonarBlip({ threat, selected, opacity, onHover, onLeave, onSelect }) {
  const point = polar(threat.angle, threat.radius * R)
  const visible = opacity > 0.02 || selected
  const size = selected ? 6.8 : 5.2
  // Blip + score share the same fade curve so the label eases out, not hard-cuts
  const drawOpacity = selected ? Math.max(opacity, 0.85) : opacity
  const label = polar(threat.angle, Math.min(threat.radius * R + 22, R - 18))
  const riskLabel = Number(threat.risk_score).toFixed(3)

  if (!visible && !selected) return null

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={(event) => onHover(threat, event)}
      onMouseLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(threat)
      }}
    >
      <circle cx={point.x} cy={point.y} r={14} fill="transparent" />
      {opacity > 0.55 || selected ? (
        <circle
          cx={point.x}
          cy={point.y}
          r={size + 7}
          fill="var(--radar-blip)"
          opacity={(selected ? 0.12 : 0.1) * drawOpacity}
        />
      ) : null}
      <circle
        cx={point.x}
        cy={point.y}
        r={size}
        fill={threat.tone.fill}
        stroke={selected ? 'var(--ink)' : 'var(--radar-fill)'}
        strokeWidth={selected ? 1.4 : 1.15}
        opacity={drawOpacity}
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--ink)"
        fontSize="10"
        letterSpacing="0.4"
        opacity={drawOpacity}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          pointerEvents: 'none',
        }}
      >
        {riskLabel}
      </text>
    </g>
  )
}

export default function ThreatRadar({ threats, selectedId, onSelect }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [sweepAngle, setSweepAngle] = useState(0)
  const startRef = useRef(performance.now())

  useEffect(() => {
    let frame = 0
    const tick = (now) => {
      const elapsed = (now - startRef.current) % SWEEP_PERIOD_MS
      setSweepAngle((elapsed / SWEEP_PERIOD_MS) * Math.PI * 2)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleHover = (threat, event) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({
      threat,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  return (
    <div ref={wrapRef} className="relative mx-auto aspect-square w-full max-w-[min(92vw,560px)] lg:max-w-[640px]">
      <motion.svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-full w-full select-none"
        role="img"
        aria-label="SonarScan critical threat sonar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        onClick={() => onSelect(null)}
      >
        <SonarFace />
        <SweepBeam angle={sweepAngle} />
        {threats.map((threat) => {
          const progress = sweepProgress(sweepAngle, threat.angle)
          const opacity = blipOpacity(progress)
          return (
            <SonarBlip
              key={threat.cve_id}
              threat={threat}
              opacity={opacity}
              selected={selectedId === threat.cve_id}
              onHover={handleHover}
              onLeave={() => setHover(null)}
              onSelect={onSelect}
            />
          )
        })}
      </motion.svg>

      <RadarTooltip
        threat={hover?.threat}
        x={hover?.x || 0}
        y={hover?.y || 0}
        visible={Boolean(
          hover &&
            (selectedId === hover.threat.cve_id ||
              blipOpacity(sweepProgress(sweepAngle, hover.threat.angle)) > 0.02),
        )}
      />
    </div>
  )
}
