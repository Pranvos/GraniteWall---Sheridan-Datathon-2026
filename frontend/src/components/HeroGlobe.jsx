import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

const GLOBE_R = 1.55
const FACE_DOT = 0.1
const SPIN_SPEED = 0.07
/** Min chord on the unit sphere between seats (~55°). */
const MIN_SEAT_DIST = 0.95
const REST_SCALE = 0.86
const REST_SCALE_MOBILE = 0.58
/** Brief lock after teleport so a fresh seat can't instantly re-hide. */
const RESPAWN_GRACE_MS = 420

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
  float shade = 0.22 + smoothstep(0.0, 0.14, abs(vWave)) * 0.18;
  gl_FragColor = vec4(vec3(shade), 0.42);
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

function nearestMeshVertexIndex(verts, position) {
  const target = new THREE.Vector3(position[0], position[1], position[2])
  let best = 0
  let bestDistance = Infinity
  verts.forEach((vertex, index) => {
    const distance = vertex.distanceToSquared(target)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** Preferred front directions, snapped to mesh intersections. */
const SEED_DIRS = [
  new THREE.Vector3(-0.72, 0.48, 0.5).setLength(GLOBE_R),
  new THREE.Vector3(0.05, -0.55, 0.83).setLength(GLOBE_R),
  new THREE.Vector3(0.7, 0.35, 0.62).setLength(GLOBE_R),
]

function pickInitialVertexIndices(verts, count) {
  const picked = []
  for (let i = 0; i < count; i++) {
    const target = SEED_DIRS[i % SEED_DIRS.length]
    const ranked = verts
      .map((v, idx) => ({ idx, d: v.distanceToSquared(target) }))
      .sort((a, b) => a.d - b.d)
    let chosen = ranked[0]?.idx ?? 0
    for (const { idx } of ranked) {
      if (isVertexFarFrom(verts, idx, picked)) {
        chosen = idx
        break
      }
    }
    picked.push(chosen)
  }
  return picked
}

/**
 * Reappear on the opposite side of where the node vanished.
 * exitSide 'right' → enter from left (−X); 'left' → enter from right (+X).
 */
function pickEntryVertex(group, verts, occupied = [], exitSide = 'right') {
  const occupiedSet = new Set(occupied)
  const world = new THREE.Vector3()
  const enterLeft = exitSide === 'right'

  const preferred = []
  const front = []

  for (let i = 0; i < verts.length; i++) {
    if (occupiedSet.has(i)) continue
    world.copy(verts[i]).applyQuaternion(group.quaternion)
    // Must be clearly camera-facing so it won't instantly hide again
    if (world.z < 0.35) continue
    if (!isVertexFarFrom(verts, i, occupied)) continue
    const onEntrySide = enterLeft ? world.x < -0.2 : world.x > 0.2
    if (onEntrySide) preferred.push(i)
    else front.push(i)
  }

  const pool = preferred.length ? preferred : front
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)]

  // Guaranteed farthest front vertex
  let best = 0
  let bestScore = -1
  for (let i = 0; i < verts.length; i++) {
    if (occupiedSet.has(i)) continue
    world.copy(verts[i]).applyQuaternion(group.quaternion)
    if (world.z < 0.2) continue
    const score = occupied.length
      ? Math.min(...occupied.map((j) => unitChord(verts[i], verts[j])))
      : 2
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

function ClusterMarker({
  cluster,
  basePosition,
  distortRef,
  interactive,
  dragRef,
  onSelect,
  onWentBehind,
}) {
  const groupRef = useRef(null)
  const mesh = useRef(null)
  const [facing, setFacing] = useState(true)
  const wasFacing = useRef(true)
  const graceUntil = useRef(0)
  const { camera, gl } = useThree()
  const worldPos = useMemo(() => new THREE.Vector3(), [])
  const toCam = useMemo(() => new THREE.Vector3(), [])
  const displaced = useMemo(() => new THREE.Vector3(), [])
  const base = useMemo(
    () => new THREE.Vector3(basePosition[0], basePosition[1], basePosition[2]),
    [basePosition[0], basePosition[1], basePosition[2]],
  )
  const posKey = `${basePosition[0]},${basePosition[1]},${basePosition[2]}`

  useEffect(() => {
    wasFacing.current = true
    setFacing(true)
    graceUntil.current = performance.now() + RESPAWN_GRACE_MS
  }, [posKey])

  useFrame((state) => {
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

    // Grace window after teleport — stay visible, don't re-trigger hide
    if (performance.now() < graceUntil.current) {
      wasFacing.current = true
      if (!facing) setFacing(true)
      return
    }

    if (wasFacing.current && !front) {
      const teleported = onWentBehind?.(cluster.id, worldPos.x >= 0 ? 'right' : 'left')
      if (teleported) {
        // Seat jumps this frame — keep visible; don't wait on a hide/show cycle
        wasFacing.current = true
        if (!facing) setFacing(true)
        return
      }
    }
    wasFacing.current = front
    setFacing((prev) => (prev === front ? prev : front))
  })

  return (
    <group ref={groupRef} position={basePosition} visible={facing}>
      <mesh
        ref={mesh}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (!interactive || !facing) return
          e.stopPropagation()
          if (dragRef.current?.moved) return
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
        <sphereGeometry args={[cluster.pointSize || 0.018, 8, 8]} />
        <meshBasicMaterial color={cluster.color} toneMapped={false} depthTest={false} />
      </mesh>
      <mesh scale={cluster.pointSize ? 3 : 2}>
        <sphereGeometry args={[cluster.pointSize || 0.018, 8, 8]} />
        <meshBasicMaterial
          color={cluster.color}
          transparent
          opacity={0.22}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {facing && cluster.showLabel ? (
        <Html
          center
          transform={false}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          zIndexRange={[40, 10]}
          occlude={false}
        >
          <div
            data-cursor="hot"
            className="pointer-events-none whitespace-nowrap text-center"
            style={{
              transform: 'translateY(-34px)',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            }}
          >
            <p className="text-[9px] font-medium uppercase leading-none tracking-[0.06em] text-slate-200">
              {cluster.name}
            </p>
            <p className="mt-1 text-[13px] leading-none" aria-hidden="true">
              {cluster.icon}
            </p>
            <p className="mt-1 max-w-[10rem] text-[8px] leading-tight tracking-[0.02em] text-slate-400">
              {cluster.description}
            </p>
            {cluster.count != null ? (
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-500">
                {cluster.count} of top 500
              </p>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  )
}

function GlobeMesh({ reducedMotion, clusters, interactive, onSelect }) {
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
  const exitSideRef = useRef({})

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

  // Vertex indices into meshVerts — always exact wireframe intersections
  const [placements, setPlacements] = useState(() => {
    const indices = pickInitialVertexIndices(meshVerts, clusters.length)
    return Object.fromEntries(
      clusters.map((c, i) => [
        c.id,
        c.basePosition ? nearestMeshVertexIndex(meshVerts, c.basePosition) : (indices[i] ?? 0),
      ]),
    )
  })
  const clusterKey = clusters.map((cluster) => cluster.id).join('|')
  useEffect(() => {
    const indices = pickInitialVertexIndices(meshVerts, clusters.length)
    setPlacements(Object.fromEntries(
      clusters.map((cluster, index) => [
        cluster.id,
        cluster.basePosition
          ? nearestMeshVertexIndex(meshVerts, cluster.basePosition)
          : (indices[index] ?? 0),
      ]),
    ))
  }, [clusterKey, clusters, meshVerts])
  const placementsRef = useRef(placements)
  placementsRef.current = placements

  const pendingRespawn = useRef(new Set())

  // Instant teleport — no queue/delays so fast drags don't leave dots missing
  const onWentBehind = useCallback(
    (id, exitSide = 'right') => {
      if (!group.current || pendingRespawn.current.has(id)) return false
      pendingRespawn.current.add(id)
      exitSideRef.current[id] = exitSide

      const occupied = Object.entries(placementsRef.current)
        .filter(([key]) => key !== id)
        .map(([, idx]) => idx)
      const nextIdx = pickEntryVertex(group.current, meshVerts, occupied, exitSide)
      const next = { ...placementsRef.current, [id]: nextIdx }
      placementsRef.current = next
      setPlacements(next)

      window.setTimeout(() => {
        pendingRespawn.current.delete(id)
      }, RESPAWN_GRACE_MS)
      return true
    },
    [meshVerts],
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
          color="#1a1a1a"
          size={0.007}
          sizeAttenuation
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </points>
      {clusters.map((cluster) => {
        const idx = placements[cluster.id] ?? 0
        const v = meshVerts[idx] || meshVerts[0]
        return (
          <ClusterMarker
            key={cluster.id}
            cluster={cluster}
            basePosition={[v.x, v.y, v.z]}
            distortRef={distortRef}
            interactive={interactive}
            dragRef={drag}
            onSelect={onSelect}
            onWentBehind={onWentBehind}
          />
        )
      })}
    </group>
  )
}

/**
 * Wire globe — clusters live on mesh vertices and respawn from the opposite exit side.
 */
export default function HeroGlobe({
  className = '',
  clusters = [],
  interactive = true,
  onSelect,
}) {
  const wrap = useRef(null)
  const [visible, setVisible] = useState(true)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const el = wrap.current
    if (!el) return undefined
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrap} className={`absolute inset-0 h-full w-full ${className}`}>
      <Canvas
        dpr={[1, 1.25]}
        camera={{ fov: 42, near: 0.1, far: 100, position: [0, 0, 4.8] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        frameloop={visible ? 'always' : 'never'}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => gl.setClearColor(0x070b14, 1)}
      >
        {visible ? (
          <GlobeMesh
            reducedMotion={reducedMotion}
            clusters={clusters}
            interactive={interactive}
            onSelect={onSelect}
          />
        ) : null}
      </Canvas>
    </div>
  )
}
