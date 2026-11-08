import { AnimatePresence, motion } from 'framer-motion'
import { PORTAL_TIMING } from '../hooks/usePortalTransition'

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v))
}

function easeOutCubic(t) {
  const x = clamp(t, 0, 1)
  return 1 - (1 - x) ** 3
}

/**
 * High-end fluid portal morph — clip-path circle from cluster into dashboard.
 */
export default function PortalTransition({
  active,
  direction = 'forward',
  phase,
  progress = 0,
  origin,
  accent = '#0033FF',
  children = null,
}) {
  const forward = direction !== 'reverse'
  const cx = origin?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0)
  const cy = origin?.y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0)

  const maxR =
    typeof window !== 'undefined'
      ? Math.hypot(window.innerWidth, window.innerHeight) * 1.05
      : 2000

  // Forward: 0 → full; reverse: full → 0
  let radiusT = 0
  if (forward) {
    if (phase === 'expand') radiusT = 0.08 * easeOutCubic(progress / (PORTAL_TIMING.expandEnd / PORTAL_TIMING.total))
    else if (phase === 'warp') {
      const local =
        (progress - PORTAL_TIMING.expandEnd / PORTAL_TIMING.total) /
        ((PORTAL_TIMING.warpEnd - PORTAL_TIMING.expandEnd) / PORTAL_TIMING.total)
      radiusT = 0.08 + 0.92 * easeOutCubic(local)
    } else if (phase === 'materialize') radiusT = 1
  } else {
    radiusT = 1 - easeOutCubic(progress)
  }

  const radius = Math.max(8, radiusT * maxR)
  const showContent =
    active &&
    ((forward && (phase === 'warp' || phase === 'materialize')) ||
      (!forward && progress < 0.55))

  const contentOpacity = forward
    ? phase === 'materialize'
      ? easeOutCubic(
          (progress - PORTAL_TIMING.warpEnd / PORTAL_TIMING.total) /
            ((PORTAL_TIMING.total - PORTAL_TIMING.warpEnd) / PORTAL_TIMING.total),
        )
      : phase === 'warp'
        ? Math.max(0, (radiusT - 0.45) / 0.55) * 0.55
        : 0
    : Math.max(0, 1 - progress / 0.45)

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className="fixed inset-0 z-[60]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Atmospheric veil behind the lens */}
          <div
            className="absolute inset-0 bg-neutral-950/40 backdrop-blur-[2px]"
            style={{
              opacity: forward
                ? phase === 'expand'
                  ? progress * 0.5
                  : 0.55 + radiusT * 0.35
                : 0.85 * (1 - progress),
            }}
          />

          {/* Glassmorphic portal lens */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              clipPath: `circle(${radius}px at ${cx}px ${cy}px)`,
              WebkitClipPath: `circle(${radius}px at ${cx}px ${cy}px)`,
              background:
                forward && phase === 'materialize'
                  ? '#F9F9F9'
                  : `linear-gradient(145deg, rgba(249,249,249,0.9) 0%, rgba(249,249,249,0.72) 40%, ${accent}22 100%)`,
              backdropFilter: phase === 'materialize' && forward ? 'none' : 'blur(22px) saturate(1.4)',
              WebkitBackdropFilter:
                phase === 'materialize' && forward ? 'none' : 'blur(22px) saturate(1.4)',
              boxShadow: `0 0 0 1px rgba(255,255,255,0.35) inset, 0 0 80px ${accent}33`,
            }}
          >
            {/* Sheen */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.55) 48%, transparent 62%)',
                transform: `translateX(${(forward ? radiusT : 1 - progress) * 30 - 15}%)`,
                opacity: phase === 'materialize' && forward ? 0.12 : 0.5,
              }}
            />

            {showContent && children ? (
              <div
                className="h-full w-full overflow-auto"
                style={{
                  opacity: contentOpacity,
                  transform: `translateY(${forward ? (1 - contentOpacity) * 16 : progress * 10}px)`,
                  pointerEvents: contentOpacity > 0.85 ? 'auto' : 'none',
                }}
              >
                {children}
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
