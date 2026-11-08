import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react'
import { fetchEvaluationResults, fetchEvaluationSummary, normalizeEvaluationResults, normalizeEvaluationSummary } from './api/evaluation'
import SiteNav from './components/SiteNav'
import GraniteWallHero from './components/threat-radar/GraniteWallHero'
import EvaluationInsights from './components/EvaluationInsights'
import EvaluationRecommendations from './components/EvaluationRecommendations'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const severityFor = (risk) => (risk >= 0.75 ? 'Critical' : risk >= 0.5 ? 'High' : risk >= 0.25 ? 'Medium' : 'Low')

function SiemConsole({ activeLens }) {
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
  const [activeTab, setActiveTab] = useState('overview')
  const tabs = [
    ['overview', 'Overview'],
    ['queue', 'Vulnerability queue'],
    ['rankings', 'Risk rankings'],
    ['recommendations', 'Recommendations'],
  ]
  const activeTabLabel = tabs.find(([id]) => id === activeTab)?.[1] || 'Overview'

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
      const [riskResponse, vulnerabilityResponse] = await dashboardRequest
      setRiskSummary(riskResponse)
      setItems(vulnerabilityResponse.items)
      setTotal(vulnerabilityResponse.total)
    } catch (requestError) {
      setError(requestError.message)
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

  return (
    <div
      id="operations"
      className="min-h-screen scroll-mt-12 border-t border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]"
      style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
    >
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--paper)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => document.getElementById('critical-sonar')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--meta)] transition hover:text-[var(--ink)]"
            >
              SonarScan · Operations
            </button>
            <h1 className="mt-2 text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {activeTabLabel}
            </h1>
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-5 sm:px-8 lg:px-12"
          aria-label="Operations sections"
        >
          {tabs.map(([id, label]) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`shrink-0 border-b-2 px-3 py-3.5 text-[10px] font-bold uppercase tracking-[0.2em] transition sm:px-4 ${
                  active
                    ? 'border-[var(--ink)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--meta)] hover:text-[var(--ink)]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          {error ? (
            <div className="mb-8 flex items-center gap-2 border border-[#A65A48]/35 bg-[#A65A48]/8 px-4 py-3 text-xs text-[#7A3F32]">
              <AlertTriangle size={16} /> Backend offline: {error}
              <button type="button" onClick={load} className="ml-auto underline">
                Retry
              </button>
            </div>
          ) : null}
          {activeTab === 'overview' ? (
            <OperationsStory riskSummary={riskSummary} onOpenQueue={() => setActiveTab('queue')} />
          ) : null}

          {activeTab === 'rankings' ? <EvaluationInsights summary={summary} results={results} loading={evaluation.status === 'loading'} error={evaluation.status === 'error' ? evaluation.error : ''} /> : null}
          {activeTab === 'recommendations' ? <EvaluationRecommendations summary={summary} results={results} loading={evaluation.status === 'loading'} error={evaluation.status === 'error' ? evaluation.error : ''} /> : null}

          {activeTab === 'queue' ? (
            <VulnerabilityQueue
              items={items}
              total={total}
              page={page}
              setPage={setPage}
              query={query}
              setQuery={setQuery}
              severity={severity}
              setSeverity={setSeverity}
              method={method}
              setMethod={setMethod}
              kevOnly={kevOnly}
              setKevOnly={setKevOnly}
              loading={loading}
              onInspect={openDetails}
            />
          ) : null}
      </main>

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <section
            className="h-full w-full max-w-lg overflow-y-auto border-l border-[var(--line)] bg-[var(--paper)] p-8"
            style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--meta)]">Selected CVE</p>
                <h2 className="mt-2 font-mono text-xl tracking-tight text-[var(--ink)]">{selected.cve_id}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[var(--meta)] transition hover:text-[var(--ink)]" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-[var(--line)] py-8">
              <Detail label="Risk score" value={Number(selected.risk_score || 0).toFixed(4)} />
              <Detail label="EPSS" value={Number(selected.epss || 0).toFixed(4)} />
              <Detail label="Signals" value={`${selected.exploit_signal_count || 0} / 4`} />
              <Detail label="KEV" value={selected.is_kev ? 'Confirmed' : 'Not listed'} />
            </div>
            <div className="mt-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--meta)]">Description</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--meta)]">
                {selected.description || 'Description is available from the vulnerability dataset when this CVE is resolved.'}
              </p>
            </div>
            <div className="mt-8 space-y-0 border-t border-[var(--line)]">
              {[['ExploitDB', selected.exploitdb], ['Metasploit', selected.metasploit], ['Nuclei', selected.nuclei], ['GitHub PoC', selected.poc_github]].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-[var(--line)] py-4 text-sm">
                  <span className="text-[var(--meta)]">{label}</span>
                  <span className={value > 0 ? 'font-medium text-[var(--ink)]' : 'text-[var(--meta-soft)]'}>
                    {value > 0 ? 'Signal present' : 'None'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--meta)]">{label}</p>
      <p className="mt-2 font-mono text-lg tabular-nums text-[var(--ink)]">{value}</p>
    </div>
  )
}

function EmptyState({ loading }) {
  return (
    <div className="grid min-h-32 place-items-center py-16 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--meta-soft)]">
      {loading ? 'Loading queue…' : 'No matching vulnerabilities'}
    </div>
  )
}

function VulnerabilityQueue({
  items,
  total,
  page,
  setPage,
  query,
  setQuery,
  severity,
  setSeverity,
  method,
  setMethod,
  kevOnly,
  setKevOnly,
  loading,
  onInspect,
}) {
  const pageCount = Math.max(1, Math.ceil(total / 25))
  const filterClass =
    'border-0 border-b border-[var(--line-strong)] bg-transparent py-2 text-[12px] text-[var(--ink)] outline-none focus:border-[#171717]'

  return (
    <section style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}>
      <header className="border-b border-[var(--line)] pb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--meta)]">
          Ranked top 500
        </p>
        <h2 className="mt-4 max-w-[18ch] text-[clamp(1.85rem,3.5vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
          The working list behind the sonar.
        </h2>
        <p className="mt-4 max-w-2xl text-[1.1rem] leading-relaxed text-[var(--meta)]">
          {total.toLocaleString()} records ordered by {method.replaceAll('_', ' ')}. Open a row to
          inspect risk, EPSS, and exploit evidence for that CVE.
        </p>
      </header>

      <div
        className="flex flex-wrap items-end gap-x-8 gap-y-5 border-b border-[var(--line)] py-8"
        aria-label="Queue filters"
      >
        <label className="min-w-[14rem] flex-1">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--meta)]">
            Find CVE
          </span>
          <div className="flex items-center gap-2 border-b border-[var(--line-strong)] focus-within:border-[#171717]">
            <Search size={14} className="shrink-0 text-[var(--meta-soft)]" />
            <input
              value={query}
              onChange={(event) => {
                setPage(1)
                setQuery(event.target.value)
              }}
              placeholder="CVE-2024-…"
              className="w-full bg-transparent py-2 font-mono text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--meta-soft)]"
            />
          </div>
        </label>

        <label>
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--meta)]">
            Severity
          </span>
          <select
            aria-label="Filter by severity"
            value={severity}
            onChange={(event) => {
              setPage(1)
              setSeverity(event.target.value)
            }}
            className={filterClass}
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--meta)]">
            Ranking
          </span>
          <select
            aria-label="Ranking method"
            value={method}
            onChange={(event) => {
              setPage(1)
              setMethod(event.target.value)
            }}
            className={filterClass}
          >
            <option value="direct_risk">Granite direct risk</option>
            <option value="exploit_then_epss">Exploit then EPSS</option>
            <option value="epss">EPSS</option>
            <option value="cvss3">CVSS 3</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setPage(1)
            setKevOnly((value) => !value)
          }}
          className={`pb-2 text-[10px] font-bold uppercase tracking-[0.2em] transition ${
            kevOnly ? 'text-[var(--ink)] underline underline-offset-4' : 'text-[var(--meta)] hover:text-[var(--ink)]'
          }`}
        >
          {kevOnly ? 'KEV only · on' : 'KEV only'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--meta)]">
              {['Rank', 'CVE', 'Severity', 'EPSS', 'Signals', 'Risk', 'KEV', ''].map((heading) => (
                <th key={heading || 'open'} className="px-0 py-4 pr-6 font-bold first:pl-0">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const level = item.severity_category || severityFor(item.risk_score)
              const rank = (page - 1) * 25 + index + 1
              return (
                <tr key={item.cve_id} className="border-b border-[var(--line)] text-sm transition hover:bg-[var(--hover-row)]">
                  <td className="py-4 pr-6 font-mono text-[12px] font-semibold tabular-nums text-[var(--ink)]">
                    {rank}
                  </td>
                  <td className="py-4 pr-6">
                    <button
                      type="button"
                      onClick={() => onInspect(item)}
                      className="text-left font-mono text-[12px] text-[var(--ink)] underline-offset-2 transition hover:underline"
                    >
                      {item.cve_id}
                    </button>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--meta-soft)]">
                      {item.published || 'Date unavailable'}
                    </div>
                  </td>
                  <td className="py-4 pr-6 text-[12px] font-medium text-[var(--ink)]">{level}</td>
                  <td className="py-4 pr-6 font-mono text-[12px] tabular-nums text-[var(--meta)]">
                    {Number(item.epss).toFixed(4)}
                  </td>
                  <td className="py-4 pr-6 font-mono text-[12px] tabular-nums text-[var(--meta)]">
                    {item.exploit_signal_count}/4
                  </td>
                  <td className="py-4 pr-6 font-mono text-[12px] font-semibold tabular-nums text-[var(--ink)]">
                    {Number(item.risk_score).toFixed(4)}
                  </td>
                  <td className="py-4 pr-6 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--meta)]">
                    {item.is_kev ? 'Yes' : '—'}
                  </td>
                  <td className="py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onInspect(item)}
                      className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)] underline-offset-4 transition hover:underline"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!items.length ? <EmptyState loading={loading} /> : null}
      </div>

      <div className="mt-6 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--meta)]">
        <span>
          Page {page} / {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
            className="grid h-8 w-8 place-items-center border border-[var(--line-strong)] text-[var(--ink)] transition hover:border-[#171717] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
            className="grid h-8 w-8 place-items-center border border-[var(--line-strong)] text-[var(--ink)] transition hover:border-[#171717] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Overview as a short story: one idea per beat, big explanation, one figure.
 * Sits flush on the operations canvas — no white panel.
 */
function OperationsStory({ riskSummary, onOpenQueue }) {
  const steps = [
    {
      step: '01',
      title: 'Start with the full scoreboard',
      body: 'SonarScan indexes every record in the 2026 scoreboard before ranking begins. This is the full vulnerability set the model reads from.',
      figure: riskSummary?.total?.toLocaleString() || '—',
      figureLabel: 'vulnerabilities indexed',
    },
    {
      step: '02',
      title: 'Rank, then isolate Critical',
      body: 'IBM Granite blends model probability with EPSS and exploit signals, then keeps only the top 5% of the ranked top-500 on the sonar.',
      figure: riskSummary?.critical?.toLocaleString() || '—',
      figureLabel: 'Critical findings on sonar',
    },
    {
      step: '03',
      title: 'Weigh live exploit pressure',
      body: 'Public exploit evidence and the CISA KEV catalog sharpen which Critical items deserve attention first in the queue below.',
      figure: riskSummary?.active_signals?.toLocaleString() || '—',
      figureLabel: 'records with exploit signals',
      aside: `${(riskSummary?.kev_catalog ?? riskSummary?.kev)?.toLocaleString() || '—'} in KEV catalog`,
    },
  ]

  return (
    <section
      className="mx-auto max-w-5xl space-y-0 bg-transparent"
      style={{ fontFamily: 'var(--font-story), Montserrat, sans-serif' }}
    >
      <header className="border-b border-[var(--line)] px-0 pb-10 pt-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--meta)]">How the queue is built</p>
        <h2 className="mt-4 max-w-[22ch] text-[clamp(1.85rem,3.5vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
          Three moves from the full scoreboard to Critical sonar.
        </h2>
      </header>

      {steps.map((item, index) => (
        <article
          key={item.step}
          className={`grid gap-6 py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-center ${
            index < steps.length - 1 ? 'border-b border-[var(--line)]' : ''
          }`}
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--meta-soft)]">{item.step}</p>
            <h3 className="mt-3 text-[clamp(1.35rem,2.4vw,1.85rem)] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
              {item.title}
            </h3>
            <p className="mt-4 max-w-xl text-[1.05rem] font-normal leading-relaxed text-[var(--meta)] md:text-[1.15rem]">
              {item.body}
            </p>
          </div>
          <div className="md:pl-6 md:text-right">
            <p className="text-[clamp(4.5rem,12vw,7.5rem)] font-semibold tabular-nums leading-[0.9] tracking-[-0.05em] text-[var(--ink)]">
              {item.figure}
            </p>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--meta)]">{item.figureLabel}</p>
            {item.step === '01' ? (
              <button
                type="button"
                onClick={onOpenQueue}
                className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink)] underline underline-offset-4 transition hover:opacity-55"
              >
                View vulnerability queue
              </button>
            ) : null}
            {item.step === '02' ? (
              <button
                type="button"
                onClick={() =>
                  document.getElementById('critical-sonar')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink)] underline underline-offset-4 transition hover:opacity-55"
              >
                View sonar
              </button>
            ) : null}
            {item.aside ? (
              <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--meta-soft)]">{item.aside}</p>
            ) : null}
          </div>
        </article>
      ))}

    </section>
  )
}

function LandingPage({ activeLens, onEnter, riskPoints, scoreboardStatus }) {
  return (
    <div id="top" className="relative overflow-x-hidden bg-[var(--paper)] text-[var(--ink)]">
      <SiteNav />
      <GraniteWallHero
        riskPoints={riskPoints}
        scoreboardStatus={scoreboardStatus}
        onEnterOperations={() =>
          onEnter({
            id: 'radar-enter',
            name: 'Priority field',
            method: 'direct_risk',
            severity: '',
            viewHint: 'Opened from the threat radar hero',
          })
        }
      />
      <SiemConsole activeLens={activeLens} />
    </div>
  )
}

function App() {
  const [activeLens, setActiveLens] = useState(null)
  const [riskPoints, setRiskPoints] = useState([])
  const [scoreboardStatus, setScoreboardStatus] = useState('loading')
  const enterLens = useCallback((cluster) => {
    setActiveLens(cluster)
    window.setTimeout(() => document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }), 0)
  }, [])

  useEffect(() => {
    let cancelled = false
    setScoreboardStatus('loading')
    fetch(`${API_BASE_URL}/api/v1/vulnerabilities?method=direct_risk&top_k=500&page=1&page_size=500`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Top-500 request failed')
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        const points = buildRiskPoints(payload.items || [])
        setRiskPoints(points)
        setScoreboardStatus(points.length > 0 ? 'ready' : 'empty')
      })
      .catch(() => {
        if (cancelled) return
        setRiskPoints([])
        setScoreboardStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <LandingPage
      activeLens={activeLens}
      onEnter={enterLens}
      riskPoints={riskPoints}
      scoreboardStatus={scoreboardStatus}
    />
  )
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
      ...item,
      id: item.cve_id,
      cve_id: item.cve_id,
      name: item.cve_id,
      description: `${category} · risk ${Number(item.risk_score).toFixed(4)}`,
      color: definition.color,
      glow: definition.glow,
      // Keep API percentile band last so radar filters Critical correctly.
      severity_category: category,
      category,
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
