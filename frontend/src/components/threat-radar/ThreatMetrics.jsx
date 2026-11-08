export default function ThreatMetrics({ summary, sourceLabel }) {
  const items = [
    {
      label: 'On sonar',
      value: `${summary.critical ?? summary.total} critical`,
    },
    { label: 'Avg EPSS', value: Number(summary.avgEpss || 0).toFixed(3) },
    {
      label: 'Granite',
      value: `${Math.round((summary.avgConfidence || 0) * 100)}%`,
    },
  ]

  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-[5.5rem]">
          <p className="font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.22em] text-[var(--meta)]">
            {item.label}
          </p>
          <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight text-[var(--ink)]">{item.value}</p>
        </div>
      ))}
      <div className="min-w-[8rem] border-l border-[var(--line-strong)] pl-6">
        <p className="font-[family-name:var(--font-sans)] text-[10px] uppercase tracking-[0.22em] text-[var(--meta)]">
          Source
        </p>
        <p className="mt-2 text-[12px] text-[var(--meta)]">{sourceLabel}</p>
      </div>
    </div>
  )
}
