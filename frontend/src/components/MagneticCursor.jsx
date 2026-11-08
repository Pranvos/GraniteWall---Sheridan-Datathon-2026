import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

/**
 * Sleek magnetic follower ring for light Swiss surfaces.
 */
export default function MagneticCursor({ enabled = true }) {
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 380, damping: 32, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 380, damping: 32, mass: 0.4 })
  const [hot, setHot] = useState(false)
  const [visible, setVisible] = useState(false)
  const fine = useRef(true)

  useEffect(() => {
    fine.current = window.matchMedia('(pointer: fine)').matches
    if (!fine.current || !enabled) return undefined

    const onMove = (e) => {
      x.set(e.clientX)
      y.set(e.clientY)
      setVisible(true)
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const interactive = Boolean(
        el?.closest('button, a, [data-cursor="hot"], [role="button"], canvas'),
      )
      setHot(interactive)
    }
    const onLeave = () => setVisible(false)

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [enabled, x, y])

  if (!enabled) return null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[90]"
      style={{
        x: sx,
        y: sy,
        translateX: '-50%',
        translateY: '-50%',
        opacity: visible ? 1 : 0,
      }}
    >
      <motion.div
        className="rounded-full border border-[#0B0B0B]"
        animate={{
          width: hot ? 42 : 12,
          height: hot ? 42 : 12,
          backgroundColor: hot ? 'rgba(11,11,11,0.06)' : 'rgba(11,11,11,0.85)',
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      />
    </motion.div>
  )
}
