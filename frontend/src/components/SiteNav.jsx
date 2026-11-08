import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Github, Menu, X } from 'lucide-react'
import { SITE_LINKS } from '../data/links'

function DevpostIcon({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M6.002 1.61 0 12.004l6.002 10.393h11.996L24 12.004 17.998 1.61zm1.593 4.084h3.751c3.73 0 6.172 2.078 6.172 6.312 0 4.234-2.442 6.31-6.172 6.31H7.595zm3.751 3.028v6.566h.413c1.86 0 2.892-.921 2.892-3.283 0-2.36-1.032-3.283-2.892-3.283z" />
    </svg>
  )
}

const NAV_LINKS = [
  {
    key: 'github',
    label: 'GitHub',
    href: SITE_LINKS.github,
    Icon: Github,
  },
  {
    key: 'devpost',
    label: 'Devpost',
    href: SITE_LINKS.devpost,
    Icon: DevpostIcon,
  },
]

/**
 * Top bar — inline links on desktop, hamburger drawer on small screens.
 */
export default function SiteNav({ className = '' }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <nav
        className={`pointer-events-auto relative z-40 flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#070b14]/90 px-4 py-3 text-slate-200 backdrop-blur-md sm:px-6 md:px-10 ${className}`}
        aria-label="Primary"
      >
        <a
          href="#top"
          data-cursor="hot"
          className="select-text font-mono text-[10px] uppercase tracking-[0.28em] text-slate-400 transition hover:text-cyan-300"
        >
          GraniteWall
        </a>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map(({ key, label, href, Icon }) => (
            <li key={key}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                data-cursor="hot"
                className="inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400 transition hover:bg-cyan-400/10 hover:text-cyan-300"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* Mobile menu toggle */}
        <button
          type="button"
          data-cursor="hot"
          className="inline-flex h-10 w-10 items-center justify-center border border-slate-700 text-slate-300 transition hover:border-cyan-400/60 hover:bg-cyan-400/10 hover:text-cyan-300 sm:hidden"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="site-menu"
            className="pointer-events-auto fixed inset-0 z-50 sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/70"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="absolute right-0 top-0 flex h-full w-[min(100%,20rem)] flex-col border-l border-slate-800 bg-[#090e19] shadow-[-12px_0_40px_rgba(0,0,0,0.4)]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">
                  Menu
                </p>
                <button
                  type="button"
                  data-cursor="hot"
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center border border-slate-700 text-slate-300"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ul className="flex flex-col gap-1 p-4">
                {NAV_LINKS.map(({ key, label, href, Icon }) => (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      data-cursor="hot"
                      className="flex items-center gap-3 border border-transparent px-4 py-3.5 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-300 transition hover:border-slate-700 hover:bg-slate-800/50"
                      onClick={() => setOpen(false)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>

              <p className="mt-auto border-t border-slate-800 px-5 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                IBM Granite · Datathon
              </p>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
