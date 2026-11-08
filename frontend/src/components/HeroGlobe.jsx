import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

const GLOBE_R = 1.55
const FACE_DOT = 0.1
const SPIN_SPEED = 0.07
/** Min chord on the unit sphere between seats (~55°). Used when few markers. */
const MIN_SEAT_DIST = 0.95
const REST_SCALE = 0.86
const REST_SCALE_MOBILE = 0.58
/** Uniform marker size — never scale individual CVE dots differently. */
const DOT_R = 0.02
const GLOW_SCALE = 2.15

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec2 uPointer;
uniform float uDistort;
varying float vWave;

void main() {
  vec3 pos = position;
  float waveY = sin(pos.y * 3.1 + uTime * 0.8) * 0.045;
  float waveX = sin(pos.x * 4.2 + uTime * 0.55) * 0.028;
  vec2 p = uPointer * 1.65;
  float dist = distance(pos.xy, p);
  float bulge = (1.0 - smoothstep(0.0, 2.2, dist)) * 0.22 * uDistort;
  float wave = waveY + waveX + bulge;
  pos += normal * wave;
  vWave = wave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const fragmentShader = /* glsl */ `
varying float vWave;

void main() {
  // Ink wire on paper — dark stroke, not a night-void fill
  float shade = 0.08 + smoothstep(0.0, 0.14, abs(vWave)) * 0.16;
  gl_FragColor = vec4(vec3(shade), 0.72);
}
`

/** Same displacement as the wireframe shader — keeps dots on the visible intersections. */
function displaceVertex(pos, time, pointer, distort, out = new THREE.Vector3()) {
  const waveY = Math.sin(pos.y * 3.1 + time * 0.8) * 0.045
  const waveX = Math.sin(pos.x * 4.2 + time * 0.55) * 0.028
  const px = pointer.x * 1.65
  const py = pointer.y * 1.65
  const dist = Math.hypot(pos.x - px, pos.y - py)
  const t = THREE.MathUtils.clamp(dist / 2.2, 0, 1)
  const bulge = (1 - t * t * (3 - 2 * t)) * 0.22 * distort
  const wave = waveY + waveX + bulge
  const len = pos.length() || 1
  return out.copy(pos).addScaledVector(pos, wave / len)
}

/** Unique mesh vertices = wireframe intersection points. */
function extractMeshVertices(geometry) {
  const pos = geometry.getAttribute('position')
  const verts = []
  const seen = new Set()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    verts.push(new THREE.Vector3(x, y, z))
  }
  return verts
}

function unitChord(a, b) {
  return a.clone().normalize().distanceTo(b.clone().normalize())
}

function isVertexFarFrom(verts, index, occupied) {
  const v = verts[index]
  return occupied.every((j) => unitChord(v, verts[j]) >= MIN_SEAT_DIST)
}

/**
 * Tetrahedral seats — at least one hub stays camera-facing at every spin angle,
 * so the wall never goes fully empty.
 */
const SEED_DIRS = [
  new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(GLOBE_R),
  new THREE.Vector3(1, -1, -1).normalize().multiplyScalar(GLOBE_R),
  new THREE.Vector3(-1, 1, -1).normalize().multiplyScalar(GLOBE_R),
  new THREE.Vector3(-1, -1, 1).normalize().multiplyScalar(GLOBE_R),
]

function nearestMeshVertexIndex(verts, position, occupied = []) {
  const occupiedSet = new Set(occupied)
  const target = new THREE.Vector3(position[0], position[1], position[2])
  let best = -1
  let bestDistance = Infinity
  let fallback = 0
  let fallbackDistance = Infinity
  for (let index = 0; index < verts.length; index++) {
    const distance = verts[index].distanceToSquared(target)
    if (distance < fallbackDistance) {
      fallback = index
      fallbackDistance = distance
    }
    if (occupiedSet.has(index)) continue
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best >= 0 ? best : fallback
}

function pickInitialVertexIndices(verts, count) {
  const picked = []
  for (let i = 0; i < count; i++) {
    const target = SEED_DIRS[i % SEED_DIRS.length]
    const ranked = verts
      .map((v, idx) => ({ idx, d: v.distanceToSquared(target) }))
      .sort((a, b) => a.d - b.d)
    let chosen = ranked[0]?.idx ?? 0
    for (const { idx } of ranked) {
      if (picked.includes(idx)) continue
      if (picked.length < 8 && !isVertexFarFrom(verts, idx, picked)) continue
      chosen = idx
      break
    }
    picked.push(chosen)
  }
  return picked
}

/** Assign each cluster a unique mesh vertex (prefer basePosition when present). */
function assignClusterPlacements(verts, clusters) {
  const occupied = []
  const placements = {}
  const seeded = pickInitialVertexIndices(verts, clusters.length)
  clusters.forEach((cluster, i) => {
    const idx = cluster.basePosition
      ? nearestMeshVertexIndex(verts, cluster.basePosition, occupied)
      : seeded[i] ?? nearestMeshVertexIndex(verts, SEED_DIRS[i % SEED_DIRS.length].toArray(), occupied)
    occupied.push(idx)
    placements[cluster.id] = idx
  })
  return placements
}

function ClusterMarker({
  cluster,
  basePosition,
  distortRef,
  interactive,
  dragRef,
  onSelect,
  filterActive = true,
}) {
  const groupRef = useRef(null)
  const mesh = useRef(null)
  const facingRef = useRef(true)
  const persist = Boolean(cluster.persistVisible)
  const dotR = cluster.dotRadius ?? DOT_R
  const [labelFacing, setLabelFacing] = useState(Boolean(cluster.showLabel))
  const { camera, gl } = useThree()
  const worldPos = useMemo(() => new THREE.Vector3(), [])
  const toCam = useMemo(() => new THREE.Vector3(), [])
  const displaced = useMemo(() => new THREE.Vector3(), [])
  const base = useMemo(
    () => new THREE.Vector3(basePosition[0], basePosition[1], basePosition[2]),
    [basePosition[0], basePosition[1], basePosition[2]],
  )

  useFrame((state, delta) => {
    if (!groupRef.current) return

    const d = distortRef.current
    displaceVertex(
      base,
      d?.time ?? state.clock.elapsedTime,
      d?.pointer ?? { x: 0, y: 0 },
      d?.distort ?? 0,
      displaced,
    )
    groupRef.current.position.copy(displaced)

    groupRef.current.getWorldPosition(worldPos)
    toCam.copy(camera.position).sub(worldPos).normalize()
    const outward = worldPos.clone().normalize()
    const front = outward.dot(toCam) > FACE_DOT

    // Filter hides non-selected hubs; persist hubs still dim on the far side
    facingRef.current = front
    groupRef.current.visible = filterActive && (persist || front)
    const showLabel = Boolean(cluster.showLabel) && filterActive && front
    if (cluster.showLabel && labelFacing !== showLabel) setLabelFacing(showLabel)

    const targetScale = front ? 1 : persist ? 0.72 : 1
    const s = THREE.MathUtils.damp(groupRef.current.scale.x || 1, targetScale, 8, delta)
    groupRef.current.scale.setScalar(s)
  })

  return (
    <group ref={groupRef} position={basePosition}>
      <mesh
        ref={mesh}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (!interactive || (!facingRef.current && !persist)) return
          e.stopPropagation()
          if (dragRef.current?.moved) return
          if (!facingRef.current) return
          groupRef.current.getWorldPosition(worldPos)
          const rect = gl.domElement.getBoundingClientRect()
          const projected = worldPos.clone().project(camera)
          const x = ((projected.x + 1) / 2) * rect.width + rect.left
          const y = ((-projected.y + 1) / 2) * rect.height + rect.top
          onSelect?.(cluster, {
            x,
            y,
            left: x - 24,
            top: y - 24,
            width: 48,
            height: 48,
          })
        }}
      >
        <sphereGeometry args={[dotR, 12, 12]} />
        <meshBasicMaterial color={cluster.color} toneMapped={false} depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh scale={GLOW_SCALE}>
        <sphereGeometry args={[dotR, 12, 12]} />
        <meshBasicMaterial
          color={cluster.color}
          transparent
          opacity={0.2}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {cluster.showLabel && labelFacing ? (
        <Html
          center
          transform={false}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          zIndexRange={[100, 80]}
          occlude={false}
        >
          <div
            className="pointer-events-none whitespace-nowrap border border-black/10 bg-[#f9f9f9]/95 px-3 py-2 text-center backdrop-blur-sm"
            style={{
              transform: 'translateY(-52px)',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            }}
          >
            <p className="font-mono text-[9px] font-medium uppercase leading-none tracking-[0.14em] text-[#0b0b0b]">
              {cluster.name}
            </p>
            <p className="mt-1.5 max-w-[11rem] text-[8px] leading-snug tracking-[0.02em] text-[#71717a]">
              {cluster.description}
            </p>
            {cluster.count != null ? (
              <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#71717a]">
                {cluster.count} of top 500
              </p>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  )
}

function PaperClear() {
  const { gl } = useThree()
  useEffect(() => {
    gl.setClearColor(0xf9f9f9, 1)
    gl.setClearAlpha(1)
  }, [gl])
  return null
}

function GlobeMesh({ reducedMotion, clusters, interactive, onSelect, selectedCategory = 'all' }) {
  const group = useRef(null)
  const { size, gl } = useThree()
  const isMobile = size.width < 768
  const drag = useRef({
    active: false,
    moved: false,
    lx: 0,
    ly: 0,
    nx: 0,
    ny: 0,
    pid: -1,
  })
  const rot = useRef({ x: -0.06, y: 0 })
  const distortRef = useRef({ time: 0, pointer: { x: 0, y: 0 }, distort: 0 })
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(GLOBE_R, 5), [])
  const meshVerts = useMemo(() => extractMeshVertices(geometry), [geometry])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        wireframe: true,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          uTime: { value: 0 },
          uPointer: { value: new THREE.Vector2(0, 0) },
          uDistort: { value: 0 },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  )
  const pointerTarget = useMemo(() => new THREE.Vector2(0, 0), [])

  // Sync seats on first paint — avoid one frame of every marker at vertex 0 (the pole)
  const clusterIds = clusters.map((c) => c.id).join('|')
  const placements = useMemo(
    () => assignClusterPlacements(meshVerts, clusters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable seats keyed by id set only
    [clusterIds, meshVerts],
  )

  useFrame((state, delta) => {
    if (!group.current) return
    material.uniforms.uTime.value = reducedMotion ? 0 : state.clock.elapsedTime

    const distortGoal = drag.current.active && !reducedMotion ? 1 : 0
    material.uniforms.uDistort.value = THREE.MathUtils.damp(
      material.uniforms.uDistort.value,
      distortGoal,
      10,
      delta,
    )
    if (drag.current.active) {
      pointerTarget.set(drag.current.nx, drag.current.ny)
      material.uniforms.uPointer.value.lerp(pointerTarget, 0.18)
    } else {
      material.uniforms.uPointer.value.lerp(pointerTarget.set(0, 0), 0.08)
    }

    distortRef.current = {
      time: material.uniforms.uTime.value,
      pointer: {
        x: material.uniforms.uPointer.value.x,
        y: material.uniforms.uPointer.value.y,
      },
      distort: material.uniforms.uDistort.value,
    }

    if (!drag.current.active && !reducedMotion) {
      rot.current.y += delta * SPIN_SPEED
    }

    group.current.rotation.y = rot.current.y
    group.current.rotation.x = rot.current.x
    group.current.rotation.z = -0.18

    const scale = isMobile ? REST_SCALE_MOBILE : REST_SCALE
    group.current.scale.setScalar(
      THREE.MathUtils.damp(group.current.scale.x || scale, scale, 4, delta),
    )
  })

  useEffect(() => {
    const el = gl.domElement

    const onUp = (e) => {
      if (!drag.current.active) return
      if (drag.current.pid !== -1 && e.pointerId !== drag.current.pid) return
      drag.current.active = false
      try {
        el.releasePointerCapture(drag.current.pid)
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        drag.current.moved = false
      }, 0)
    }

    const onMove = (e) => {
      if (!drag.current.active) return
      const dx = e.clientX - drag.current.lx
      const dy = e.clientY - drag.current.ly
      if (Math.hypot(dx, dy) > 3) drag.current.moved = true
      rot.current.y += dx * 0.0055
      rot.current.x += dy * 0.004
      drag.current.lx = e.clientX
      drag.current.ly = e.clientY
      drag.current.nx = (e.clientX / window.innerWidth) * 2 - 1
      drag.current.ny = -(e.clientY / window.innerHeight) * 2 + 1
    }

    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointermove', onMove)
    }
  }, [gl])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return (
    <group ref={group}>
      <mesh
        geometry={geometry}
        material={material}
        onPointerDown={(e) => {
          e.stopPropagation()
          drag.current.active = true
          drag.current.moved = false
          drag.current.lx = e.clientX
          drag.current.ly = e.clientY
          drag.current.nx = (e.clientX / window.innerWidth) * 2 - 1
          drag.current.ny = -(e.clientY / window.innerHeight) * 2 + 1
          drag.current.pid = e.pointerId
          try {
            gl.domElement.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
        }}
      />
      <points geometry={geometry} scale={1.012}>
        <pointsMaterial
          color="#18181b"
          size={0.008}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>
      {clusters.map((cluster) => {
        const idx = placements[cluster.id]
        if (idx == null) return null
        const v = meshVerts[idx] || meshVerts[0]
        const severity = String(cluster.severity || cluster.category || '').toLowerCase()
        const filterActive =
          selectedCategory === 'all' || severity === selectedCategory
        return (
          <ClusterMarker
            key={cluster.id}
            cluster={cluster}
            basePosition={[v.x, v.y, v.z]}
            distortRef={distortRef}
            interactive={interactive}
            dragRef={drag}
            onSelect={onSelect}
            filterActive={filterActive}
          />
        )
      })}
    </group>
  )
}

/**
 * Wire globe — clusters sit on fixed mesh vertices; filter/spin only toggles visibility.
 */
export default function HeroGlobe({
  className = '',
  clusters = [],
  interactive = true,
  onSelect,
  selectedCategory = 'all',
}) {
  const wrap = useRef(null)
  const [inView, setInView] = useState(true)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const el = wrap.current
    if (!el) return undefined
    // Pause the render loop off-screen, but never unmount WebGL — remounting on
    // scroll-up was crashing the page.
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
      rootMargin: '200px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrap} className={`absolute inset-0 h-full w-full bg-[#f9f9f9] ${className}`}>
      <Canvas
        key="paper-globe"
        dpr={[1, 1.25]}
        camera={{ fov: 42, near: 0.1, far: 100, position: [0, 0, 4.8] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        frameloop={inView ? 'always' : 'never'}
        style={{ width: '100%', height: '100%', background: '#f9f9f9' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0xf9f9f9, 1)
          gl.setClearAlpha(1)
        }}
      >
        <PaperClear />
        <GlobeMesh
          reducedMotion={reducedMotion}
          clusters={clusters}
          interactive={interactive}
          onSelect={onSelect}
          selectedCategory={selectedCategory}
        />
      </Canvas>
    </div>
  )
}
