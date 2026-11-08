import { memo, useEffect, useMemo, useRef, useState } from 'react'

const MAX_VISIBLE_NODES = 96

const severityStyles = {
  Critical: { color: '#fb334b', glow: '#ff7a8a' },
  High: { color: '#f97316', glow: '#fdba74' },
  Medium: { color: '#f59e0b', glow: '#fcd34d' },
}

function getLayout(count) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.45)))
  return { columns, rows: Math.max(1, Math.ceil(count / columns)) }
}

function getPosition(index, layout) {
  const row = Math.floor(index / layout.columns)
  const column = index % layout.columns
  const xStep = 100 / (layout.columns + 1)
  const yStep = 100 / (layout.rows + 1)
  return {
    x: Math.min(96, xStep * (column + 1) + (row % 2 ? xStep * 0.3 : 0)),
    y: yStep * (row + 1),
    curve: Math.abs(column - (layout.columns - 1) / 2) * 1.2,
  }
}

const WallNode = memo(function WallNode({ cluster, position, cursor, onSelect }) {
  const dx = cursor.x - position.x
  const dy = cursor.y - position.y
  const distance = Math.hypot(dx, dy)
  const influence = cursor.active ? Math.max(0, 1 - distance / 42) : 0
  const tone = severityStyles[cluster.category] || severityStyles.Medium

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(cluster, event.currentTarget.getBoundingClientRect())
      }}
      className="group absolute grid h-6 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-sm border border-white/10 bg-slate-800/30 transition-transform duration-100 hover:scale-150 focus:outline-none focus:ring-2 focus:ring-cyan-300"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        color: tone.color,
        transform: `translate(-50%, -50%) translate3d(0, 0, ${influence * 28}px) rotateX(${-dy * influence * 0.18}deg) rotateY(${dx * influence * 0.18 + position.curve}deg)`,
      }}
      aria-label={`Inspect ${cluster.cve_id || cluster.name}`}
    >
      <span className="absolute inset-0 rounded-full opacity-30 blur-[5px] transition-opacity group-hover:opacity-90" style={{ backgroundColor: tone.glow }} />
      <span className="relative h-2 w-2 rounded-full border border-white/50 shadow-[0_0_12px_currentColor]" style={{ backgroundColor: tone.color }} />
      <span className="pointer-events-none absolute -right-1 top-1 h-4 w-1 origin-left skew-y-[-20deg] bg-black/30" />
    </button>
  )
})

export default function BrickWall({ clusters = [], interactive = true, onSelect, onCycle }) {
  const [cursor, setCursor] = useState({ x: 50, y: 50, active: false })
  const [rotation, setRotation] = useState({ x: 1, y: -7 })
  const dragRef = useRef(null)
  const frameRef = useRef(0)
  const pendingPointerRef = useRef(null)
  const displayClusters = useMemo(() => clusters.slice(0, MAX_VISIBLE_NODES), [clusters])
  const layout = useMemo(() => getLayout(displayClusters.length), [displayClusters.length])
  const positions = useMemo(
    () => displayClusters.map((_, index) => getPosition(index, layout)),
    [displayClusters, layout],
  )

  useEffect(() => {
    if (!onCycle) return undefined
    const timer = window.setInterval(onCycle, 7000)
    return () => window.clearInterval(timer)
  }, [onCycle])

  useEffect(() => () => window.cancelAnimationFrame(frameRef.current), [])

  const updatePointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    pendingPointerRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      active: true,
    }
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      if (pendingPointerRef.current) setCursor(pendingPointerRef.current)
    })
  }

  const handlePointerMove = (event) => {
    if (dragRef.current) {
      const dx = event.clientX - dragRef.current.x
      const dy = event.clientY - dragRef.current.y
      setRotation((current) => ({
        x: Math.max(-18, Math.min(18, dragRef.current.rotation.x - dy * 0.18)),
        y: Math.max(-28, Math.min(28, dragRef.current.rotation.y + dx * 0.18)),
      }))
    }
    updatePointer(event)
  }

  const handlePointerDown = (event) => {
    if (!interactive) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, rotation }
  }

  const handlePointerUp = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const aspectRatio = Math.max(1.15, layout.columns / layout.rows)
  const wallStyle = {
    width: '84%',
    aspectRatio,
    transform: `translate(-50%, -50%) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
  }

  return (
    <div
      className="relative h-full min-h-[58vh] overflow-hidden border-l border-slate-800/80 bg-[#090d16] [perspective:1100px]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        dragRef.current = null
        setCursor((current) => ({ ...current, active: false }))
      }}
    >
      <div className="absolute left-1/2 top-1/2 rounded-sm bg-[#050811] shadow-[-28px_28px_45px_rgba(0,0,0,0.65)]" style={{ ...wallStyle, transform: `${wallStyle.transform} translateZ(-65px)` }} aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]" style={wallStyle}>
        <div
          className="absolute inset-0 rounded-sm border border-slate-700/70 bg-[#111827]"
          style={{
            backgroundImage: `
              radial-gradient(circle at ${cursor.x}% ${cursor.y}%, rgba(3, 7, 18, ${cursor.active ? 0.7 : 0}) 0 2.5rem, rgba(125, 211, 252, ${cursor.active ? 0.1 : 0}) 3.5rem, transparent 6rem),
              repeating-linear-gradient(0deg, rgba(2, 6, 23, 0.72) 0 2px, transparent 2px ${100 / layout.rows}%),
              repeating-linear-gradient(90deg, rgba(2, 6, 23, 0.72) 0 2px, transparent 2px ${100 / layout.columns}%)
            `,
          }}
        />
        <div className="pointer-events-none absolute -right-7 inset-y-3 w-8 origin-left bg-[#0a101d] [transform:rotateY(-18deg)_skewY(-8deg)]" />
        <div className="pointer-events-none absolute -top-6 inset-x-4 h-7 origin-bottom bg-[#182235] [transform:rotateX(35deg)_skewX(-15deg)]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.06),transparent_35%,rgba(0,0,0,0.3))]" />
      <div className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]" style={wallStyle}>
        {displayClusters.map((cluster, index) => (
          <WallNode key={cluster.id} cluster={cluster} position={positions[index]} cursor={cursor} onSelect={interactive ? onSelect : undefined} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-5 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-slate-600">GraniteWall · interactive risk surface</div>
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">Drag to rotate · move cursor to deform</div>
    </div>
  )
}
