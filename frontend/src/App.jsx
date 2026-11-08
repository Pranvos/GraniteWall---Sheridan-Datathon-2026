import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  LayoutDashboard,
  Lightbulb,
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
import SiteNav from './components/SiteNav'
import { originFromElement } from './hooks/usePortalTransition'
import EvaluationInsights from './components/EvaluationInsights'
import EvaluationRecommendations from './components/EvaluationRecommendations'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const severityFor = (risk) => (risk >= 0.75 ? 'Critical' : risk >= 0.5 ? 'High' : risk >= 0.25 ? 'Medium' : 'Low')
const severityStyles = {
  Critical: 'border-[#ff334b]/40 bg-[#ff334b]/10 text-[#ff334b]',
  High: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]',
  Medium: 'border-[#0f62fe]/40 bg-[#0f62fe]/10 text-[#0f62fe]',
  Low: 'border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#3b82f6]',
}

function Badge({ children, tone }) {
  return <span className={`inline-flex border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone || severityStyles[children] || 'border-black/10 bg-[#f4f4f5] text-[#3f3f46]'}`}>{children}</span>
}

function Stat({ label, value, detail, icon: Icon, tone = 'cobalt' }) {
  const iconTone = { cobalt: 'text-[#0f62fe]', red: 'text-[#ff334b]', amber: 'text-[#f59e0b]', violet: 'text-[#0f62fe]' }[tone] || 'text-[#0f62fe]'
  return (
    <div className="soc-panel p-4">
      <div className="flex items-start justify-between text-[#71717a]">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</span>
        <Icon size={16} className={iconTone} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold text-[#0b0b0b]">{value}</div>
      <div className="mt-1 text-xs text-[#71717a]">{detail}</div>
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
    ['recommendations', Lightbulb, 'Recommendations'],
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
      if (!response.ok) {
        setSelected(item)
        return
      }
      setSelected(await response.json())
    } catch {
      setSelected(item)
    }
  }

  const connected = Boolean(health?.status === 'ok' && !error)

  return (
    <div id="operations" className="min-h-screen scroll-mt-12 bg-[#f9f9f9] text-[#0b0b0b]">
      <aside className={`fixed inset-y-0 left-0 z-30 block w-60 border-r border-black/10 bg-white p-5 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button type="button" onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center gap-3 border-b border-black/10 pb-5 text-left">
          <div className="grid h-9 w-9 place-items-center bg-[#0f62fe]/10 text-[#0f62fe]"><Shield size={20} /></div>
          <div><div className="font-mono text-sm font-bold tracking-widest text-[#0b0b0b]">GRANITEWALL</div><div className="font-mono text-[9px] uppercase text-[#71717a]">Security operations</div></div>
        </button>
        <nav className="mt-7 space-y-1">
          {tabs.map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => { setActiveTab(id); setSidebarOpen(false) }} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs ${activeTab === id ? 'bg-[#0f62fe]/10 text-[#0f62fe]' : 'text-[#71717a] hover:bg-black/[0.03] hover:text-[#0b0b0b]'}`}><Icon size={15} />{label}</button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 border-t border-black/10 pt-4">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#71717a]"><span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#0f62fe]' : 'bg-[#ff334b]'}`} /> API {connected ? 'online' : 'offline'}</div>
        </div>
      </aside>

      <main className={`transition-[margin] duration-200 ${sidebarOpen ? 'lg:ml-60' : ''}`}>
        <header className="sticky top-0 z-20 border-b border-black/10 bg-white/95 px-4 py-4 backdrop-blur md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3"><button type="button" onClick={() => setSidebarOpen((open) => !open)} className="soc-button mt-0.5" aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}><Menu size={14} /> {sidebarOpen ? 'Hide menu' : 'Menu'}</button><div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0f62fe]">SOC / vulnerability intelligence</div><h1 className="mt-1 text-xl font-semibold text-[#0b0b0b]">Operations overview</h1>{activeLens ? <p className="mt-2 text-xs text-[#71717a]">Lens: <span className="font-semibold text-[#0b0b0b]">{activeLens.name}</span> · {activeLens.viewHint}</p> : <p className="mt-2 text-xs text-[#71717a]">Choose a sphere node to focus the queue on a meaningful risk lens.</p>}</div></div>
            <div className="flex items-center gap-3"><span className="hidden font-mono text-[10px] text-[#71717a] sm:block">{lastUpdated ? `UPDATED ${lastUpdated.toLocaleTimeString()}` : 'SYNCING...'}</span><button onClick={load} className="soc-button"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto border-t border-black/10 pt-3" aria-label="Operations sections">
            {tabs.map(([id, Icon, label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={`inline-flex shrink-0 items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition ${activeTab === id ? 'border-[#0f62fe] bg-[#0f62fe]/10 text-[#0f62fe]' : 'border-black/10 text-[#71717a] hover:border-black/25 hover:text-[#3f3f46]'}`}><Icon size={13} />{label}</button>
            ))}
          </nav>
        </header>

        <div className="space-y-5 p-4 md:p-7">
          {error ? <div className="soc-alert"><AlertTriangle size={16} /> Backend offline: {error}<button onClick={load} className="ml-auto underline">Retry</button></div> : null}
          {activeTab === 'overview' ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Vulnerabilities" value={riskSummary?.total?.toLocaleString() || '—'} detail="scoreboard records indexed" icon={Database} />
            <Stat label="Critical risk" value={riskSummary?.critical?.toLocaleString() || '—'} detail="top 5% of ranked top 500" icon={AlertTriangle} tone="red" />
            <Stat label="Known exploited" value={(riskSummary?.kev_catalog ?? riskSummary?.kev)?.toLocaleString() || '—'} detail="CISA KEV catalog size" icon={ShieldCheck} tone="amber" />
            <Stat label="Active signals" value={riskSummary?.active_signals?.toLocaleString() || '—'} detail="records with exploit evidence" icon={Signal} tone="cobalt" />
          </section> : null}

          {activeTab === 'rankings' ? <EvaluationInsights summary={summary} results={results} loading={evaluation.status === 'loading'} error={evaluation.status === 'error' ? evaluation.error : ''} /> : null}
          {activeTab === 'recommendations' ? <EvaluationRecommendations summary={summary} results={results} loading={evaluation.status === 'loading'} error={evaluation.status === 'error' ? evaluation.error : ''} /> : null}

          {activeTab === 'queue' ? <section className="soc-panel overflow-hidden">
            <div className="border-b border-black/10 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="panel-title">Top 500 vulnerability queue</h2><p className="panel-subtitle">{total.toLocaleString()} highest-ranked records · {method.replaceAll('_', ' ')}</p></div><div className="flex items-center gap-2 font-mono text-[10px] uppercase text-[#71717a]"><Eye size={14} /> analyst view</div></div>
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Vulnerability queue filters">
                <label className="flex min-w-56 flex-1 items-center gap-2 border border-black/10 bg-white px-3 py-2 text-[#71717a]"><Search size={15} /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} placeholder="Search CVE identifier..." className="w-full bg-transparent font-mono text-xs text-[#0b0b0b] outline-none placeholder:text-[#71717a]" /></label>
                <select aria-label="Filter by severity" value={severity} onChange={(event) => { setPage(1); setSeverity(event.target.value) }} className="soc-select"><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                <select aria-label="Ranking method" value={method} onChange={(event) => { setPage(1); setMethod(event.target.value) }} className="soc-select"><option value="direct_risk">Granite direct risk</option><option value="exploit_then_epss">Public exploit + EPSS</option><option value="epss">EPSS first</option><option value="cvss3">CVSS 3 first</option></select>
                <button type="button" onClick={() => { setPage(1); setKevOnly((value) => !value) }} className={`soc-button ${kevOnly ? 'border-red-400/60 bg-[#ff334b]/10 text-[#ff334b]' : ''}`}><SlidersHorizontal size={14} /> KEV only</button>
              </div>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-black/10 bg-black/[0.03] font-mono text-[10px] uppercase tracking-wider text-[#71717a]"><th className="px-5 py-3">CVE</th><th className="px-3 py-3">Severity</th><th className="px-3 py-3">EPSS</th><th className="px-3 py-3">Signals</th><th className="px-3 py-3">Risk score</th><th className="px-3 py-3">KEV</th><th className="px-5 py-3 text-right">Inspect</th></tr></thead><tbody>{items.map((item) => { const level = item.severity_category || severityFor(item.risk_score); return <tr key={item.cve_id} className="border-b border-black/10 text-sm hover:bg-black/[0.02]"><td className="px-5 py-3 font-mono text-xs text-[#0f62fe]">{item.cve_id}<div className="text-[10px] text-[#71717a]">{item.published || 'date unavailable'}</div></td><td className="px-3 py-3"><Badge>{level}</Badge></td><td className="px-3 py-3 font-mono text-xs">{Number(item.epss).toFixed(4)}</td><td className="px-3 py-3 font-mono text-xs">{item.exploit_signal_count}/4</td><td className="px-3 py-3 font-mono text-xs font-semibold text-[#0b0b0b]">{Number(item.risk_score).toFixed(4)}</td><td className="px-3 py-3">{item.is_kev ? <Badge tone="border-[#ff334b]/40 bg-[#ff334b]/10 text-[#ff334b]">confirmed</Badge> : <span className="font-mono text-[10px] text-[#71717a]">—</span>}</td><td className="px-5 py-3 text-right"><button onClick={() => openDetails(item)} className="text-[#71717a] hover:text-[#0f62fe]"><Eye size={16} /></button></td></tr> })}</tbody></table>{!items.length && !loading ? <EmptyState /> : null}</div>
            <div className="flex items-center justify-between border-t border-black/10 px-5 py-3 font-mono text-[10px] text-[#71717a]"><span>PAGE {page} / {Math.max(1, Math.ceil(total / 25))}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="soc-icon-button"><ChevronLeft size={14} /></button><button disabled={page >= Math.ceil(total / 25)} onClick={() => setPage((value) => value + 1)} className="soc-icon-button"><ChevronRight size={14} /></button></div></div>
          </section> : null}

          {activeTab === 'signals' ? <section className="grid gap-5 md:grid-cols-2">
            <section className="soc-panel p-5"><h2 className="panel-title">Threat signals</h2><p className="panel-subtitle">Exploit evidence currently indexed by source.</p><div className="mt-5 space-y-3">{Object.entries(riskSummary?.signal_breakdown || {}).map(([source, count]) => <div key={source} className="flex items-center justify-between border-b border-black/10 pb-3 font-mono text-xs"><span className="uppercase text-[#71717a]">{source.replaceAll('_', ' ')}</span><span className="text-[#0f62fe]">{Number(count).toLocaleString()}</span></div>)}</div></section>
            <section className="soc-panel p-5"><h2 className="panel-title">Known exploited vulnerabilities</h2><p className="panel-subtitle">CISA KEV catalog size (scoreboard overlap is often empty by construction).</p><div className="mt-6 font-mono text-4xl text-[#ff334b]">{(riskSummary?.kev_catalog ?? riskSummary?.kev)?.toLocaleString() || '—'}</div><p className="mt-2 text-xs text-[#71717a]">Scoreboard KEV hits in top 500: {riskSummary?.kev?.toLocaleString() || '0'}</p></section>
          </section> : null}

          {activeTab === 'pipeline' ? <section className="grid gap-5 md:grid-cols-2">
            <section className="soc-panel p-5"><h2 className="panel-title">Data pipeline</h2><p className="panel-subtitle">Live source and model readiness.</p><div className="mt-5 space-y-3 font-mono text-xs">{[['API status', connected ? 'online' : 'offline'], ['Scoreboard', health?.scoreboard_available ? 'available' : 'missing'], ['Granite artifact', health?.granite_model_available ? 'available' : 'direct-risk fallback'], ['Evaluation feed', evaluation.status === 'ready' ? 'available' : 'unavailable']].map(([label, value]) => <div key={label} className="flex justify-between border-b border-black/10 pb-3"><span className="text-[#71717a]">{label}</span><span className={value === 'offline' || value === 'missing' || value === 'unavailable' ? 'text-[#f59e0b]' : 'text-[#0b0b0b]'}>{value}</span></div>)}</div></section>
            <section className="soc-panel p-5"><h2 className="panel-title">Current ranking mode</h2><p className="panel-subtitle">The queue and globe use the selected ranking method.</p><div className="mt-6 font-mono text-xl text-[#0f62fe]">{method.replaceAll('_', ' ')}</div><p className="mt-2 text-xs text-[#71717a]">Refresh after rebuilding model or evaluation artifacts.</p></section>
          </section> : null}
        </div>
      </main>

      {selected ? <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setSelected(null)}><section className="h-full w-full max-w-lg overflow-y-auto border-l border-black/10 bg-white p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><div className="font-mono text-[10px] uppercase tracking-widest text-[#0f62fe]">Vulnerability detail</div><h2 className="mt-2 font-mono text-xl text-[#0b0b0b]">{selected.cve_id}</h2></div><button onClick={() => setSelected(null)} className="text-[#71717a] hover:text-[#0b0b0b]"><X /></button></div><div className="mt-6 grid grid-cols-2 gap-3"><Detail label="Risk score" value={Number(selected.risk_score || 0).toFixed(4)} /><Detail label="EPSS" value={Number(selected.epss || 0).toFixed(4)} /><Detail label="Signals" value={`${selected.exploit_signal_count || 0} / 4`} /><Detail label="KEV status" value={selected.is_kev ? 'Confirmed' : 'Not listed'} /></div><div className="mt-5 soc-panel p-4"><div className="panel-subtitle">Description</div><p className="mt-2 text-sm leading-6 text-[#3f3f46]">{selected.description || 'Description is available from the vulnerability dataset when this CVE is resolved.'}</p></div><div className="mt-5 space-y-2">{[['ExploitDB', selected.exploitdb], ['Metasploit', selected.metasploit], ['Nuclei', selected.nuclei], ['GitHub PoC', selected.poc_github]].map(([label, value]) => <div key={label} className="flex justify-between border-b border-black/10 py-3 text-sm"><span className="text-[#71717a]">{label}</span><span className={value > 0 ? 'text-[#f59e0b]' : 'text-[#71717a]'}>{value > 0 ? 'Signal detected' : 'No signal'}</span></div>)}</div></section></div> : null}
    </div>
  )
}

function Detail({ label, value }) { return <div className="soc-panel p-3"><div className="panel-subtitle">{label}</div><div className="mt-2 font-mono text-lg text-[#0b0b0b]">{value}</div></div> }
function EmptyState({ loading }) { return <div className="grid h-full min-h-32 place-items-center font-mono text-xs uppercase tracking-widest text-[#71717a]">{loading ? 'Loading telemetry...' : 'No telemetry available'}</div> }

function LandingPage({ activeLens, onEnter, riskPoints, selectedCategory, onCategoryChange, selectedPoint, onPointSelect }) {
  const lensClusters = useMemo(() => buildLandingClusters(), [])
  // One persistent hub per severity — always on the wall, never a blank globe
  const wallHubs = useMemo(() => {
    const counts = riskPoints.reduce((acc, point) => {
      acc[point.category] = (acc[point.category] || 0) + 1
      return acc
    }, {})
    return buildRiskCategories(counts).map((cluster, index) => {
      const seat = [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ][index]
      const length = Math.hypot(seat[0], seat[1], seat[2]) || 1
      return {
        ...cluster,
        category: cluster.name,
        showLabel: true,
        persistVisible: true,
        dotRadius: 0.045,
        basePosition: seat.map((n) => (n / length) * 1.55),
      }
    })
  }, [riskPoints])

  const handleSelect = useCallback((cluster, origin) => {
    if (cluster.cve_id) {
      onPointSelect(cluster)
      return
    }
    if (cluster.severity) {
      onCategoryChange(cluster.severity)
    }
    onEnter(cluster, origin || originFromElement(null))
  }, [onEnter, onPointSelect, onCategoryChange])

  return (
    <div id="top" className="relative overflow-x-hidden bg-[#f9f9f9] text-[#0b0b0b]">
      <SiteNav />
      <div className="grid min-h-[calc(100dvh-49px)] border-b border-black/10 lg:grid-cols-[minmax(19rem,34%)_minmax(0,1fr)]">
        <aside className="relative z-10 flex flex-col justify-between border-b border-black/10 bg-white px-6 py-8 md:px-10 md:py-10 lg:border-b-0 lg:border-r">
          <div className="select-text">
            <p className="font-mono text-[10px] uppercase tracking-[0.36em] text-[#0f62fe]">
              IBM Granite · Datathon
            </p>
            <h1 className="mt-4 text-6xl font-bold uppercase leading-[0.9] tracking-[-0.04em] text-[#0b0b0b] md:text-7xl">
              Granite
              <br />
              Wall
            </h1>
            <div className="mt-8 max-w-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#71717a]">
                Threat intelligence map
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#71717a]">
                Read vulnerability risk through three connected lenses:
                attacker intent, the broken software architecture, and the
                speed at which exploitation is moving.
              </p>
            </div>
            <div className="mt-8 space-y-3 border-t border-black/10 pt-5">
              {buildRiskCategories({}).map((cluster) => (
                <div key={cluster.id} className="flex items-start gap-3 text-xs">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full " style={{ backgroundColor: cluster.color }} />
                  <button type="button" onClick={() => onCategoryChange(cluster.severity)} className="text-left transition hover:text-[#0f62fe]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em]">{cluster.name}</p>
                    <p className="mt-1 text-[#71717a]">{cluster.description} · {riskPoints.filter((point) => point.category === cluster.name).length}</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-8 hidden select-text font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-[#71717a] lg:block">
            Move across the wall to deform the surface
            <br />
            Select a lens to enter SOC
          </p>
        </aside>
        <section className="relative min-h-[58vh] bg-[#f9f9f9] lg:min-h-0">
          <HeroGlobe clusters={wallHubs} selectedCategory={selectedCategory} interactive onSelect={handleSelect} />
          <p className="pointer-events-none absolute inset-x-0 bottom-5 z-10 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-[#71717a] lg:hidden">
            Move across the wall to deform the surface · select a lens
          </p>
        </section>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 border-b border-black/10 px-6 py-4 md:px-10">
        <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#71717a]">Wall nodes</span>
        {['all', 'critical', 'high', 'medium', 'low'].map((category) => {
          const definition = category === 'all' ? { name: 'All bands', color: '#a1a1aa' } : buildRiskCategories({}).find((item) => item.severity === category)
          const count = category === 'all'
            ? riskPoints.length
            : riskPoints.filter((point) => point.category.toLowerCase() === category).length
          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={`inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition ${selectedCategory === category ? 'border-[#0f62fe] bg-[#0f62fe]/10 text-[#0f62fe]' : 'border-black/10 text-[#71717a] hover:border-black/25'}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: definition.color }} />
              {definition.name} ({count})
            </button>
          )
        })}
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-black/10 px-6 py-5 md:px-10">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#0f62fe]">Three lenses · one risk surface</p>
          <p className="mt-1 text-sm text-[#71717a]">Select a node to tune the live queue and ranking view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lensClusters.map((cluster) => (
            <button key={cluster.id} type="button" onClick={() => onEnter(cluster)} className="border border-black/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#3f3f46] transition hover:border-[#0f62fe]/60 hover:text-[#0f62fe]">
              {cluster.view}: {cluster.method.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <SiemConsole activeLens={activeLens} />
      {selectedPoint ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => onPointSelect(null)}>
          <section className="h-full w-full max-w-md overflow-y-auto border-l border-black/10 bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-black/10 pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#0f62fe]">Sphere point detail</p>
                <h2 className="mt-2 font-mono text-xl text-[#0b0b0b]">{selectedPoint.cve_id}</h2>
                <p className="mt-1 text-xs text-[#71717a]">Reference number · ranked in direct-risk top 500</p>
              </div>
              <button type="button" onClick={() => onPointSelect(null)} className="text-[#71717a] hover:text-[#0b0b0b]"><X size={18} /></button>
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
                  <div key={label} className="flex items-center justify-between border-b border-black/10 pb-2 text-sm last:border-0">
                    <span className="text-[#71717a]">{label}</span>
                    <span className={value > 0 ? 'text-[#f59e0b]' : 'text-[#71717a]'}>{value > 0 ? 'Detected' : 'None'}</span>
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
      color: '#ff334b',
      glow: '#ff6678',
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
      color: '#f59e0b',
      glow: '#fbbf24',
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
      color: '#0f62fe',
      glow: '#3b82f6',
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
      color: '#3b82f6',
      glow: '#93c5fd',
      count: counts.Low || 0,
      severity: 'low',
      method: 'direct_risk',
      viewHint: 'Low risk records',
    },
  ]
}

export default App
