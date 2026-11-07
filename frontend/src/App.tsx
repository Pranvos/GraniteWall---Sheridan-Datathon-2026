const metrics = [
  { label: 'Data points processed', value: '24,680', change: '+12.4%' },
  { label: 'Model confidence', value: '94.8%', change: '+3.1%' },
  { label: 'Active alerts', value: '08', change: '-18.2%' },
]

function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900/60 p-6 md:flex">
          <div className="mb-12 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">
              G
            </div>
            <span className="text-xl font-bold tracking-tight">GraniteWall</span>
          </div>
          <nav className="space-y-2 text-sm">
            <a className="block rounded-lg bg-cyan-400/10 px-4 py-3 font-semibold text-cyan-300" href="/">
              Overview
            </a>
            <a className="block rounded-lg px-4 py-3 text-slate-400 hover:bg-slate-800" href="/">
              Analytics
            </a>
            <a className="block rounded-lg px-4 py-3 text-slate-400 hover:bg-slate-800" href="/">
              Data sources
            </a>
          </nav>
          <div className="mt-auto rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500">System status</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              All systems operational
            </p>
          </div>
        </aside>

        <section className="flex-1 p-6 sm:p-10">
          <header className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="mb-2 text-sm font-medium text-cyan-300">Saturday, November 7, 2026</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Good morning, team.</h1>
              <p className="mt-2 text-slate-400">Here is your GraniteWall intelligence overview.</p>
            </div>
            <button className="w-fit rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300">
              Export report
            </button>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            {metrics.map((metric) => (
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5" key={metric.label}>
                <p className="text-sm text-slate-400">{metric.label}</p>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-3xl font-bold">{metric.value}</p>
                  <span className="text-sm font-semibold text-emerald-400">{metric.change}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Processing activity</h2>
                  <p className="mt-1 text-sm text-slate-400">Signals detected over the last 7 days</p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">Live</span>
              </div>
              <div className="mt-8 flex h-48 items-end gap-3">
                {[42, 60, 48, 75, 58, 88, 70, 96, 78, 92, 82, 100].map((height, index) => (
                  <div className="group flex flex-1 flex-col items-center gap-2" key={index}>
                    <div className="w-full rounded-t-md bg-cyan-400/70 transition group-hover:bg-cyan-300" style={{ height: `${height}%` }} />
                    <span className="text-[10px] text-slate-500">{index + 1}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold">Recent activity</h2>
              <div className="mt-5 space-y-5">
                {['New dataset ingested', 'Anomaly review completed', 'Model retraining queued'].map((activity, index) => (
                  <div className="flex gap-3" key={activity}>
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-400" />
                    <div>
                      <p className="text-sm font-medium">{activity}</p>
                      <p className="mt-1 text-xs text-slate-500">{index + 1} hour{index ? 's' : ''} ago</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
