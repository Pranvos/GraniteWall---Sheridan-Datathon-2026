import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { buildClusters } from './data/clusters'
import HeroGlobe from './components/HeroGlobe'
import PortalTransition from './components/PortalTransition'
import MagneticCursor from './components/MagneticCursor'
import DashboardView from './components/DashboardView'
import SiteNav from './components/SiteNav'
import { originFromElement, usePortalTransition } from './hooks/usePortalTransition'

export default function App() {
  const clusters = useMemo(() => buildClusters(42), [])
  const [viewState, setViewState] = useState('home') // home | portal | dashboard
  const [selected, setSelected] = useState(null)
  const [origin, setOrigin] = useState(null)

  const onForwardComplete = useCallback(() => setViewState('dashboard'), [])
  const onReverseComplete = useCallback(() => {
    setViewState('home')
    setSelected(null)
    setOrigin(null)
  }, [])

  const portal = usePortalTransition({
    onForwardComplete,
    onReverseComplete,
  })

  const onSelect = useCallback(
    (cluster, screenOrigin) => {
      if (viewState !== 'home' || portal.active) return
      const nextOrigin = screenOrigin || originFromElement(null)
      const payload = {
        ...cluster,
        dashboard: cluster.dashboard,
        cveId: cluster.dashboard.vulns[0]?.id,
        riskScore: cluster.riskScore,
      }
      setSelected(payload)
      setOrigin(nextOrigin)
      setViewState('portal')
      portal.startForward(payload, nextOrigin)
    },
    [viewState, portal],
  )

  const onBack = useCallback(() => {
    if (viewState !== 'dashboard' || portal.active) return
    setViewState('portal')
    portal.startReverse(selected, origin || originFromElement(null))
  }, [viewState, portal, selected, origin])

  const showDashboard = viewState === 'dashboard' && !portal.active
  const accent = selected?.color || selected?.dashboard?.accent || '#0033FF'

  return (
    <div
      id="top"
      className={`relative min-h-[100dvh] bg-[#F9F9F9] text-[#0B0B0B] ${
        showDashboard ? '' : 'cursor-none overflow-x-hidden'
      }`}
    >
      <MagneticCursor enabled={!showDashboard || portal.active} />

      <div
        className={`flex min-h-[100dvh] flex-col ${showDashboard ? 'pointer-events-none invisible' : ''}`}
        aria-hidden={showDashboard}
      >
        <SiteNav />

        {/* Split layout: copy never shares space with the globe */}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(17rem,34%)_minmax(0,1fr)]">
          <aside className="relative z-10 flex flex-col justify-between border-b border-[#0B0B0B]/10 bg-[#F9F9F9] px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
            <div className="pointer-events-auto select-text">
              <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-[#0B0B0B]/4 sm:text-[10px] sm:tracking-[0.36em]">
                IBM Granite · Datathon
              </p>
              <h1 className="mt-2 text-[2.5rem] font-black uppercase leading-[0.88] tracking-[-0.055em] text-[#0B0B0B] sm:mt-3 sm:text-5xl md:text-6xl xl:text-7xl">
                Granite
                <br />
                Wall
              </h1>

              <div className="mt-5 max-w-sm sm:mt-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#0B0B0B]/4">
                  Overview
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-[#0B0B0B]/7 sm:text-sm">
                  An interactive vulnerability map powered by IBM Granite. Spin the mesh,
                  tap a factor node, and drop into a live risk dashboard for that cluster.
                </p>
              </div>
            </div>

            <p className="pointer-events-auto mt-8 hidden select-text font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-[#0B0B0B]/35 lg:block">
              Drag the mesh to spin
              <br />
              Click a signal node to enter
            </p>
          </aside>

          <section className="relative min-h-[52vh] bg-[#F9F9F9] lg:min-h-0">
            <HeroGlobe
              clusters={clusters}
              interactive={viewState === 'home' && !portal.active}
              onSelect={onSelect}
            />
            <motion.p
              className="pointer-events-auto absolute inset-x-0 bottom-4 z-10 mx-auto max-w-sm select-text px-4 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-[#0B0B0B]/35 sm:bottom-6 sm:text-[10px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              Drag the mesh to spin · click a signal node
            </motion.p>
          </section>
        </div>
      </div>

      <PortalTransition
        active={portal.active}
        direction={portal.direction || 'forward'}
        phase={portal.phase}
        progress={portal.progress}
        origin={portal.origin || origin}
        accent={accent}
      >
        {selected ? <DashboardView cluster={selected} onBack={onBack} embedded /> : null}
      </PortalTransition>

      <AnimatePresence>
        {showDashboard ? (
          <motion.div
            key="dashboard"
            className="relative z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          >
            <SiteNav />
            <DashboardView cluster={selected} onBack={onBack} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
