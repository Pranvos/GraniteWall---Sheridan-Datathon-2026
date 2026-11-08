import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  LayoutDashboard,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Signal,
  SlidersHorizontal,
  X,
  Menu,
} from 'lucide-react'
import { fetchEvaluationResults, fetchEvaluationSummary, normalizeEvaluationResults, normalizeEvaluationSummary } from './api/evaluation'
import { buildClusters } from './data/clusters'
import HeroGlobe from './components/HeroGlobe'
import MagneticCursor from './components/MagneticCursor'
import SiteNav from './components/SiteNav'
import { originFromElement } from './hooks/usePortalTransition'
import EvaluationInsights from './components/EvaluationInsights'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const severityFor = (risk) => (risk >= 0.75 ? 'Critical' : risk >= 0.5 ? 'High' : risk >= 0.25 ? 'Medium' : 'Low')
const severityStyles = {
  Critical: 'border-red-500/30 bg-red-500/10 text-red-300',
  High: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  Medium: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  Low: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
}

function Badge({ children, tone }) {
  return <span className={`inline-flex rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone || severityStyles[children] || 'border-slate-700 bg-slate-800 text-slate-300'}`}>{children}</span>
}

function Stat({ label, value, detail, icon: Icon, tone = 'cyan' }) {
  const iconTone = { cyan: 'text-cyan-400', red: 'text-red-400', amber: 'text-amber-400', violet: 'text-violet-400' }[tone] || 'text-cyan-400'
  return (
    <div className="soc-panel p-4">
      <div className="flex items-start justify-between text-slate-400">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</span>
        <Icon size={16} className={iconTone} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  )
}

function SiemConsole({ activeLens }) {
  const [health, setHealth] = useState(null)
  const [summary, setSummary] = useState([])
  const [results, setResults] = useState([])
  const [riskSummary, setRiskSummary] = useState(null)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('')
  const [kevOnly, setKevOnly] = useState(false)
  const [method, setMethod] = useState('direct_risk')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evaluation, setEvaluation] = useState({ status: 'loading', error: '' })
  const [lastUpdated, setLastUpdated] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const tabs = [
    ['overview', LayoutDashboard, 'Overview'],
    ['queue', AlertTriangle, 'Vulnerability queue'],
    ['signals', Signal, 'Threat signals'],
    ['rankings', BarChart3, 'Risk rankings'],
    ['pipeline', Database, 'Data pipeline'],
  ]

  useEffect(() => {
    if (!activeLens) return
    setMethod(activeLens.method || 'direct_risk')
    setSeverity(activeLens.severity || '')
    setPage(1)
  }, [activeLens])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setEvaluation({ status: 'loading', error: '' })

    const dashboardRequest = Promise.all([
      fetch(`${API_BASE_URL}/api/v1/health`).then((response) => response.json()),
      fetch(`${API_BASE_URL}/api/v1/risk/summary`).then((response) => response.json()),
      fetch(`${API_BASE_URL}/api/v1/vulnerabilities?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(severity ? { severity } : {}), kev_only: kevOnly, method, page, page_size: 25, top_k: 500 })}`).then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).detail || 'Vulnerability request failed')
        return response.json()
      }),
    ])
    const evaluationRequest = Promise.all([fetchEvaluationSummary(), fetchEvaluationResults()])

    evaluationRequest
      .then(([summaryResponse, resultResponse]) => {
        setSummary(normalizeEvaluationSummary(summaryResponse.summary || []))
        setResults(normalizeEvaluationResults(resultResponse.results || []))
        setEvaluation({ status: 'ready', error: '' })
      })
      .catch((evaluationError) => {
        setSummary([])
        setResults([])
        setEvaluation({
          status: 'error',
          error: evaluationError.message || 'Evaluation data is unavailable.',
        })
      })

    try {
      const [healthResponse, riskResponse, vulnerabilityResponse] = await dashboardRequest
      setHealth(healthResponse)
      setRiskSummary(riskResponse)
      setItems(vulnerabilityResponse.items)
      setTotal(vulnerabilityResponse.total)
      setLastUpdated(new Date())
    } catch (requestError) {
      setError(requestError.message)
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [kevOnly, method, page, query, severity])

  useEffect(() => { load() }, [load])

  const openDetails = async (item) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/vulnerabilities/${item.cve_id}`)
      setSelected(await response.json())
    } catch {
      setSelected(item)
    }
  }

  const connected = Boolean(health?.status === 'ok' && !error)

  return (
    <div id="operations" className="min-h-screen scroll-mt-12 bg-[#070b14] text-slate-200">
      <aside className={`fixed inset-y-0 left-0 z-30 block w-60 border-r border-slate-800/80 bg-[#090e19] p-5 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button type="button" onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center gap-3 border-b border-slate-800 pb-5 text-left">
          <div className="grid h-9 w-9 place-items-center rounded bg-cyan-400/10 text-cyan-300"><Shield size={20} /></div>
          <div><div className="font-mono text-sm font-bold tracking-widest text-slate-100">GRANITEWALL</div><div className="font-mono text-[9px] uppercase text-slate-500">Security operations</div></div>
        </button>
        <nav className="mt-7 space-y-1">
          {tabs.map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => { setActiveTab(id); setSidebarOpen(false) }} className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-xs ${activeTab === id ? 'bg-cyan-400/10 text-cyan-300' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'}`}><Icon size={15} />{label}</button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500"><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} /> API {connected ? 'online' : 'offline'}</div>
        </div>
      </aside>

      <main className={`transition-[margin] duration-200 ${sidebarOpen ? 'lg:ml-60' : ''}`}>
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#090e19]/95 px-4 py-4 backdrop-blur md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3"><button type="button" onClick={() => setSidebarOpen((open) => !open)} className="soc-button mt-0.5" aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}><Menu size={14} /> {sidebarOpen ? 'Hide menu' : 'Menu'}</button><div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">SOC / vulnerability intelligence</div><h1 className="mt-1 text-xl font-semibold text-slate-100">Operations overview</h1>{activeLens ? <p className="mt-2 text-xs text-slate-400">Lens: <span className="font-semibold text-slate-200">{activeLens.name}</span> · {activeLens.viewHint}</p> : <p className="mt-2 text-xs text-slate-500">Choose a sphere node to focus the queue on a meaningful risk lens.</p>}</div></div>
            <div className="flex items-center gap-3"><span className="hidden font-mono text-[10px] text-slate-500 sm:block">{lastUpdated ? `UPDATED ${lastUpdated.toLocaleTimeString()}` : 'SYNCING...'}</span><button onClick={load} className="soc-button"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-slate-500"><Search size={15} /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} placeholder="Search CVE identifier..." className="w-full bg-transparent font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600" /></label>
            <select value={severity} onChange={(event) => { setPage(1); setSeverity(event.target.value) }} className="soc-select"><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            <select value={method} onChange={(event) => { setPage(1); setMethod(event.target.value) }} className="soc-select"><option value="direct_risk">Granite direct risk</option><option value="exploit_then_epss">Public exploit + EPSS</option><option value="epss">EPSS first</option><option value="cvss3">CVSS 3 first</option></select>
            <button onClick={() => { setPage(1); setKevOnly((value) => !value) }} className={`soc-button ${kevOnly ? 'border-red-400/60 bg-red-400/10 text-red-300' : ''}`}><SlidersHorizontal size={14} /> KEV only</button>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto border-t border-slate-800 pt-3" aria-label="Operations sections">
            {tabs.map(([id, Icon, label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded border px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition ${activeTab === id ? 'border-cyan-300 bg-cyan-300/10 text-cyan-200' : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}`}><Icon size={13} />{label}</button>
            ))}
          </nav>
        </header>

        <div className="space-y-5 p-4 md:p-7">
          {error ? <div className="soc-alert"><AlertTriangle size={16} /> Backend offline: {error}<button onClick={load} className="ml-auto underline">Retry</button></div> : null}
          {activeTab === 'overview' ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Vulnerabilities" value={riskSummary?.total?.toLocaleString() || '—'} detail="scoreboard records indexed" icon={Database} />
            <Stat label="Critical risk" value={riskSummary?.critical?.toLocaleString() || '—'} detail="risk score ≥ 0.75" icon={AlertTriangle} tone="red" />
            <Stat label="Known exploited" value={riskSummary?.kev?.toLocaleString() || '—'} detail="CISA KEV matches" icon={ShieldCheck} tone="amber" />
            <Stat label="Active signals" value={riskSummary?.active_signals?.toLocaleString() || '—'} detail="records with exploit evidence" icon={Signal} tone="violet" />
          </section> : null}

          {activeTab === 'rankings' ? <EvaluationInsights summary={summary} results={results} loading={evaluation.status === 'loading'} error={evaluation.status === 'error' ? evaluation.error : ''} /> : null}

          {activeTab === 'queue' ? <section className="soc-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4"><div><h2 className="panel-title">Top 500 vulnerability queue</h2><p className="panel-subtitle">{total.toLocaleString()} highest-ranked records · {method.replaceAll('_', ' ')}</p></div><div className="flex items-center gap-2 font-mono text-[10px] uppercase text-slate-500"><Eye size={14} /> analyst view</div></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-slate-800 bg-slate-900/40 font-mono text-[10px] uppercase tracking-wider text-slate-500"><th className="px-5 py-3">CVE</th><th className="px-3 py-3">Severity</th><th className="px-3 py-3">EPSS</th><th className="px-3 py-3">Signals</th><th className="px-3 py-3">Risk score</th><th className="px-3 py-3">KEV</th><th className="px-5 py-3 text-right">Inspect</th></tr></thead><tbody>{items.map((item) => { const level = severityFor(item.risk_score); return <tr key={item.cve_id} className="border-b border-slate-800/70 text-sm hover:bg-cyan-400/[0.03]"><td className="px-5 py-3 font-mono text-xs text-cyan-300">{item.cve_id}<div className="text-[10px] text-slate-600">{item.published || 'date unavailable'}</div></td><td className="px-3 py-3"><Badge>{level}</Badge></td><td className="px-3 py-3 font-mono text-xs">{Number(item.epss).toFixed(4)}</td><td className="px-3 py-3 font-mono text-xs">{item.exploit_signal_count}/4</td><td className="px-3 py-3 font-mono text-xs font-semibold text-slate-100">{Number(item.risk_score).toFixed(4)}</td><td className="px-3 py-3">{item.is_kev ? <Badge tone="border-red-500/30 bg-red-500/10 text-red-300">confirmed</Badge> : <span className="font-mono text-[10px] text-slate-600">—</span>}</td><td className="px-5 py-3 text-right"><button onClick={() => openDetails(item)} className="text-slate-500 hover:text-cyan-300"><Eye size={16} /></button></td></tr> })}</tbody></table>{!items.length && !loading ? <EmptyState /> : null}</div>
            <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 font-mono text-[10px] text-slate-500"><span>PAGE {page} / {Math.max(1, Math.ceil(total / 25))}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="soc-icon-button"><ChevronLeft size={14} /></button><button disabled={page >= Math.ceil(total / 25)} onClick={() => setPage((value) => value + 1)} className="soc-icon-button"><ChevronRight size={14} /></button></div></div>
          </section> : null}

          {activeTab === 'signals' ? <section className="grid gap-5 md:grid-cols-2">
            <section className="soc-panel p-5"><h2 className="panel-title">Threat signals</h2><p className="panel-subtitle">Exploit evidence currently indexed by source.</p><div className="mt-5 space-y-3">{Object.entries(riskSummary?.signal_breakdown || {}).map(([source, count]) => <div key={source} className="flex items-center justify-between border-b border-slate-800 pb-3 font-mono text-xs"><span className="uppercase text-slate-400">{source.replaceAll('_', ' ')}</span><span className="text-cyan-300">{Number(count).toLocaleString()}</span></div>)}</div></section>
            <section className="soc-panel p-5"><h2 className="panel-title">Known exploited vulnerabilities</h2><p className="panel-subtitle">CISA KEV records available to the ranking service.</p><div className="mt-6 font-mono text-4xl text-red-300">{riskSummary?.kev?.toLocaleString() || '—'}</div><p className="mt-2 text-xs text-slate-500">Use the queue tab to inspect individual records.</p></section>
          </section> : null}

          {activeTab === 'pipeline' ? <section className="grid gap-5 md:grid-cols-2">
            <section className="soc-panel p-5"><h2 className="panel-title">Data pipeline</h2><p className="panel-subtitle">Live source and model readiness.</p><div className="mt-5 space-y-3 font-mono text-xs">{[['API status', connected ? 'online' : 'offline'], ['Scoreboard', health?.scoreboard_available ? 'available' : 'missing'], ['Granite artifact', health?.granite_model_available ? 'available' : 'direct-risk fallback'], ['Evaluation feed', evaluation.status === 'ready' ? 'available' : 'unavailable']].map(([label, value]) => <div key={label} className="flex justify-between border-b border-slate-800 pb-3"><span className="text-slate-400">{label}</span><span className={value === 'offline' || value === 'missing' || value === 'unavailable' ? 'text-amber-300' : 'text-emerald-300'}>{value}</span></div>)}</div></section>
            <section className="soc-panel p-5"><h2 className="panel-title">Current ranking mode</h2><p className="panel-subtitle">The queue and globe use the selected ranking method.</p><div className="mt-6 font-mono text-xl text-cyan-300">{method.replaceAll('_', ' ')}</div><p className="mt-2 text-xs text-slate-500">Refresh after rebuilding model or evaluation artifacts.</p></section>
          </section> : null}
        </div>
      </main>

      {selected ? <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={() => setSelected(null)}><section className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-700 bg-[#0b1220] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">Vulnerability detail</div><h2 className="mt-2 font-mono text-xl text-slate-100">{selected.cve_id}</h2></div><button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white"><X /></button></div><div className="mt-6 grid grid-cols-2 gap-3"><Detail label="Risk score" value={Number(selected.risk_score || 0).toFixed(4)} /><Detail label="EPSS" value={Number(selected.epss || 0).toFixed(4)} /><Detail label="Signals" value={`${selected.exploit_signal_count || 0} / 4`} /><Detail label="KEV status" value={selected.is_kev ? 'Confirmed' : 'Not listed'} /></div><div className="mt-5 soc-panel p-4"><div className="panel-subtitle">Description</div><p className="mt-2 text-sm leading-6 text-slate-300">{selected.description || 'Description is available from the vulnerability dataset when this CVE is resolved.'}</p></div><div className="mt-5 space-y-2">{[['ExploitDB', selected.exploitdb], ['Metasploit', selected.metasploit], ['Nuclei', selected.nuclei], ['GitHub PoC', selected.poc_github]].map(([label, value]) => <div key={label} className="flex justify-between border-b border-slate-800 py-3 text-sm"><span className="text-slate-400">{label}</span><span className={value > 0 ? 'text-orange-300' : 'text-slate-600'}>{value > 0 ? 'Signal detected' : 'No signal'}</span></div>)}</div></section></div> : null}
    </div>
  )
}

function Detail({ label, value }) { return <div className="soc-panel p-3"><div className="panel-subtitle">{label}</div><div className="mt-2 font-mono text-lg text-slate-100">{value}</div></div> }
function EmptyState({ loading }) { return <div className="grid h-full min-h-32 place-items-center font-mono text-xs uppercase tracking-widest text-slate-600">{loading ? 'Loading telemetry...' : 'No telemetry available'}</div> }

function LandingPage({ activeLens, onEnter, riskPoints, selectedCategory, onCategoryChange, selectedPoint, onPointSelect }) {
  const lensClusters = useMemo(() => buildLandingClusters(), [])
  const eligiblePoints = useMemo(() => riskPoints.filter((point) => (
    point.category !== 'Low'
    && (selectedCategory === 'all' || point.category.toLowerCase() === selectedCategory)
  )), [riskPoints, selectedCategory])
  const visitedIds = useRef(new Set())
  const [visiblePoints, setVisiblePoints] = useState([])

  useEffect(() => {
    const available = eligiblePoints.filter((point) => !visitedIds.current.has(point.id))
    const pool = available.length >= Math.min(180, eligiblePoints.length) ? available : eligiblePoints
    setVisiblePoints(shufflePoints(pool).slice(0, 180))
  }, [eligiblePoints])

  const cycleNodes = useCallback(() => {
    const available = shufflePoints(eligiblePoints.filter((point) => (
      !visitedIds.current.has(point.id)
      && !visiblePoints.some((visible) => visible.id === point.id)
    )))
    if (!available.length) return
    const replaceCount = Math.min(12, visiblePoints.length, available.length)
    const replacements = available.slice(0, replaceCount)
    setVisiblePoints((current) => [
      ...current.slice(replaceCount),
      ...replacements,
    ])
  }, [eligiblePoints, visiblePoints])

  const handleSelect = useCallback((cluster, origin) => {
    if (cluster.cve_id) {
      visitedIds.current.add(cluster.id)
      onPointSelect(cluster)
      setVisiblePoints((current) => {
        const available = eligiblePoints.filter((point) => (
          !visitedIds.current.has(point.id)
          && !current.some((visible) => visible.id === point.id)
        ))
        const replacement = shufflePoints(available)[0]
        return replacement ? [...current.filter((point) => point.id !== cluster.id), replacement] : current
      })
      return
    }
    onEnter(cluster, origin || originFromElement(null))
  }, [eligiblePoints, onEnter, onPointSelect])

  return (
    <div id="top" className="relative overflow-x-hidden bg-[#070b14] text-slate-200">
      <MagneticCursor enabled />
      <SiteNav />
      <div className="grid min-h-[calc(100dvh-49px)] border-b border-slate-800/80 lg:grid-cols-[minmax(19rem,34%)_minmax(0,1fr)]">
        <aside className="relative z-10 flex flex-col justify-between border-b border-slate-800/80 bg-[#090e19] px-6 py-8 md:px-10 md:py-10 lg:border-b-0 lg:border-r">
          <div className="select-text">
            <p className="font-mono text-[10px] uppercase tracking-[0.36em] text-cyan-400">
              IBM Granite · Datathon
            </p>
            <h1 className="mt-3 text-6xl font-black uppercase leading-[0.88] tracking-[-0.06em] text-slate-100 md:text-7xl">
              Granite
              <br />
              Wall
            </h1>
            <div className="mt-8 max-w-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Threat intelligence map
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Read vulnerability risk through three connected lenses:
                attacker intent, the broken software architecture, and the
                speed at which exploitation is moving.
              </p>
            </div>
            <div className="mt-8 space-y-3 border-t border-slate-800 pt-5">
              {buildRiskCategories({}).map((cluster) => (
                <div key={cluster.id} className="flex items-start gap-3 text-xs">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cluster.color }} />
                  <button type="button" onClick={() => onCategoryChange(cluster.severity)} className="text-left transition hover:text-cyan-300">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em]">{cluster.name}</p>
                    <p className="mt-1 text-slate-500">{cluster.description} · {riskPoints.filter((point) => point.category === cluster.name).length}</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-8 hidden select-text font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-slate-600 lg:block">
            Move across the wall to deform the surface
            <br />
            Select a lens to enter SOC
          </p>
        </aside>
        <section className="relative min-h-[58vh] bg-[#070b14] lg:min-h-0">
          <HeroGlobe clusters={visiblePoints} interactive onSelect={handleSelect} />
          <p className="pointer-events-none absolute inset-x-0 bottom-5 z-10 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-slate-600 lg:hidden">
            Move across the wall to deform the surface · select a lens
          </p>
        </section>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 border-b border-slate-800 px-6 py-4 md:px-10">
        <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Wall nodes</span>
        {['all', 'critical', 'high', 'medium'].map((category) => {
          const definition = category === 'all' ? { name: 'All active', color: '#cbd5e1' } : buildRiskCategories({}).find((item) => item.severity === category)
          const count = category === 'all'
            ? riskPoints.filter((point) => point.category !== 'Low').length
            : riskPoints.filter((point) => point.category.toLowerCase() === category).length
          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={`inline-flex items-center gap-2 rounded border px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition ${selectedCategory === category ? 'border-cyan-300 bg-cyan-300/10 text-cyan-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: definition.color }} />
              {definition.name} ({count})
            </button>
          )
        })}
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-5 md:px-10">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-400">Three lenses · one risk surface</p>
          <p className="mt-1 text-sm text-slate-400">Select a node to tune the live queue and ranking view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lensClusters.map((cluster) => (
            <button key={cluster.id} type="button" onClick={() => onEnter(cluster)} className="rounded border border-slate-700 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300">
              {cluster.view}: {cluster.method.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <SiemConsole activeLens={activeLens} />
      {selectedPoint ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => onPointSelect(null)}>
          <section className="h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-[#0b1220] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">Sphere point detail</p>
                <h2 className="mt-2 font-mono text-xl text-slate-100">{selectedPoint.cve_id}</h2>
                <p className="mt-1 text-xs text-slate-500">Reference number · ranked in direct-risk top 500</p>
              </div>
              <button type="button" onClick={() => onPointSelect(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Detail label="Risk category" value={selectedPoint.category} />
              <Detail label="Risk score" value={Number(selectedPoint.risk_score).toFixed(4)} />
              <Detail label="EPSS" value={Number(selectedPoint.epss).toFixed(4)} />
              <Detail label="Published" value={selectedPoint.published || 'Unavailable'} />
              <Detail label="Exploit signals" value={`${selectedPoint.exploit_signal_count}/4`} />
              <Detail label="KEV status" value={selectedPoint.is_kev ? 'Confirmed' : 'Not listed'} />
            </div>
            <div className="mt-5 soc-panel p-4">
              <p className="panel-subtitle">Signal sources</p>
              <div className="mt-3 space-y-3">
                {[
                  ['ExploitDB', selectedPoint.exploitdb],
                  ['Metasploit', selectedPoint.metasploit],
                  ['Nuclei', selectedPoint.nuclei],
                  ['GitHub PoC', selectedPoint.poc_github],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-slate-800 pb-2 text-sm last:border-0">
                    <span className="text-slate-400">{label}</span>
                    <span className={value > 0 ? 'text-orange-300' : 'text-slate-600'}>{value > 0 ? 'Detected' : 'None'}</span>
                  </div>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => { onPointSelect(null); onEnter(selectedPoint) }} className="soc-button mt-5 w-full justify-center">Open in operations queue</button>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function shufflePoints(points) {
  return [...points].sort(() => Math.random() - 0.5)
}

function buildLandingClusters() {
  const clusters = buildClusters(42)
  return clusters.map((cluster) => ({
    ...cluster,
    dashboard: {
      ...cluster.dashboard,
      clusterName: cluster.name,
    },
  }))
}

function App() {
  const [activeLens, setActiveLens] = useState(null)
  const [riskPoints, setRiskPoints] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedPoint, setSelectedPoint] = useState(null)
  const enterLens = useCallback((cluster) => {
    setActiveLens(cluster)
    window.setTimeout(() => document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }), 0)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE_URL}/api/v1/vulnerabilities?method=direct_risk&top_k=500&page=1&page_size=500`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Top-500 request failed')
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        setRiskPoints(buildRiskPoints(payload.items || []))
      })
      .catch(() => {
        if (!cancelled) setRiskPoints([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <LandingPage activeLens={activeLens} onEnter={enterLens} riskPoints={riskPoints} selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} selectedPoint={selectedPoint} onPointSelect={setSelectedPoint} />
}

function buildRiskPoints(items) {
  return items.map((item, index) => {
    const category = item.severity_category || severityFor(Number(item.risk_score))
    const categoryDefinition = buildRiskCategories({})[0]
    const definition = buildRiskCategories({}).find((entry) => entry.name === category) || categoryDefinition
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const y = 1 - (index / Math.max(items.length - 1, 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = goldenAngle * index
    return {
      id: item.cve_id,
      cve_id: item.cve_id,
      name: item.cve_id,
      description: `${category} · risk ${Number(item.risk_score).toFixed(4)}`,
      color: definition.color,
      glow: definition.glow,
      category,
      ...item,
      pointSize: 0.024,
      basePosition: [radius * Math.cos(theta) * 1.55, y * 1.55, radius * Math.sin(theta) * 1.55],
      dashboard: { clusterName: item.cve_id, accent: definition.color, metrics: { analyzed: 1, hotspots: item.exploit_signal_count, graniteConfidence: item.risk_score, exploitRate: item.epss }, weeks: [], riskBreakdown: [], vulns: [] },
    }
  })
}

function buildRiskCategories(counts) {
  return [
    {
      id: 'risk-critical',
      name: 'Critical',
      description: 'Highest-risk records in the direct-risk top 500',
      icon: '✹',
      color: '#fb334b',
      glow: '#ff7a8a',
      count: counts.Critical || 0,
      severity: 'critical',
      method: 'direct_risk',
      viewHint: 'Critical risk records',
    },
    {
      id: 'risk-high',
      name: 'High',
      description: 'Elevated exploitation likelihood and signals',
      icon: '▲',
      color: '#f97316',
      glow: '#fdba74',
      count: counts.High || 0,
      severity: 'high',
      method: 'direct_risk',
      viewHint: 'High risk records',
    },
    {
      id: 'risk-medium',
      name: 'Medium',
      description: 'Moderate-ranked records requiring monitoring',
      icon: '◆',
      color: '#f59e0b',
      glow: '#fcd34d',
      count: counts.Medium || 0,
      severity: 'medium',
      method: 'direct_risk',
      viewHint: 'Medium risk records',
    },
    {
      id: 'risk-low',
      name: 'Low',
      description: 'Lower-ranked records retained for context',
      icon: '●',
      color: '#38bdf8',
      glow: '#7dd3fc',
      count: counts.Low || 0,
      severity: 'low',
      method: 'direct_risk',
      viewHint: 'Low risk records',
    },
  ]
}

export default App
