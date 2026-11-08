import { useCallback, useEffect, useRef, useState } from 'react'

/** Fluid portal timeline (ms) — ~800ms spatial warp. */
export const PORTAL_TIMING = {
  total: 800,
  expandEnd: 240,
  warpEnd: 560,
  materializeEnd: 800,
}

/**
 * Portal morph state: idle | expand | warp | materialize
 */
export function usePortalTransition({ onForwardComplete, onReverseComplete } = {}) {
  const [direction, setDirection] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [origin, setOrigin] = useState(null)
  const [brick, setBrick] = useState(null)
  const raf = useRef(0)
  const startAt = useRef(0)
  const callbacks = useRef({ onForwardComplete, onReverseComplete })
  callbacks.current = { onForwardComplete, onReverseComplete }

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }, [])

  const run = useCallback(
    (dir, nextBrick, nextOrigin, duration = PORTAL_TIMING.total) => {
      stop()
      setDirection(dir)
      setBrick(nextBrick)
      setOrigin(nextOrigin)
      setPhase('expand')
      setProgress(0)
      startAt.current = performance.now()

      const tick = (now) => {
        const elapsed = now - startAt.current
        const t = Math.min(1, elapsed / duration)
        setProgress(t)

        if (dir === 'forward') {
          if (elapsed < PORTAL_TIMING.expandEnd) setPhase('expand')
          else if (elapsed < PORTAL_TIMING.warpEnd) setPhase('warp')
          else setPhase('materialize')
        } else {
          // Reverse: materialize → warp → expand (collapse)
          if (elapsed < duration * 0.3) setPhase('materialize')
          else if (elapsed < duration * 0.7) setPhase('warp')
          else setPhase('expand')
        }

        if (t < 1) {
          raf.current = requestAnimationFrame(tick)
          return
        }

        setPhase('idle')
        setDirection(null)
        setProgress(1)
        if (dir === 'forward') callbacks.current.onForwardComplete?.()
        else {
          setBrick(null)
          setOrigin(null)
          callbacks.current.onReverseComplete?.()
        }
      }

      raf.current = requestAnimationFrame(tick)
    },
    [stop],
  )

  const startForward = useCallback(
    (nextBrick, nextOrigin) => run('forward', nextBrick, nextOrigin, PORTAL_TIMING.total),
    [run],
  )

  const startReverse = useCallback(
    (nextBrick, nextOrigin) => run('reverse', nextBrick, nextOrigin, 720),
    [run],
  )

  useEffect(() => () => stop(), [stop])

  return {
    active: direction != null,
    direction,
    phase,
    progress,
    brick,
    origin,
    startForward,
    startReverse,
  }
}

export function originFromElement(el, fallback) {
  if (el?.getBoundingClientRect) {
    const r = el.getBoundingClientRect()
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    }
  }
  return (
    fallback || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      left: window.innerWidth / 2 - 40,
      top: window.innerHeight / 2 - 28,
      width: 80,
      height: 56,
    }
  )
}
