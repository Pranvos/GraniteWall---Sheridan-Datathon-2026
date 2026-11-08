/** Critical-band threats for the SonarScan sonar dial. */

function hashString(value) {
  let h = 2166136261
  const s = String(value)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function unit(seed) {
  return ((seed >>> 0) % 10000) / 10000
}

export function severityFromRisk(risk) {
  if (risk >= 0.75) return 'Critical'
  if (risk >= 0.5) return 'High'
  if (risk >= 0.25) return 'Elevated'
  return 'Monitored'
}

function normalizeSeverity(raw, risk) {
  const s = String(raw || '').trim()
  if (/^critical$/i.test(s)) return 'Critical'
  if (/^high$/i.test(s)) return 'High'
  if (/^(medium|elevated)$/i.test(s)) return 'Elevated'
  if (/^(low|monitored)$/i.test(s)) return 'Monitored'
  return severityFromRisk(risk)
}

/**
 * Sonar radius: highest Critical nearest centre, spaced across the field.
 * Returns normalized radius in [0.22, 0.82].
 */
export function radiusForBand(_severity, rankInBand = 0, bandSize = 1) {
  const t = bandSize <= 1 ? 0 : rankInBand / (bandSize - 1)
  return 0.22 + t * 0.6
}

export function radiusForPriority(priority) {
  const p = Math.min(1, Math.max(0, priority))
  return 0.82 - p * 0.6
}

export function markerTone(severity) {
  switch (severity) {
    case 'Critical':
      return { fill: '#A65A48', stroke: '#7A3F32' }
    case 'High':
      return { fill: '#9A7B4A', stroke: '#7A6238' }
    default:
      return { fill: '#7A7A7A', stroke: '#555555' }
  }
}

function summaryFor(severity) {
  if (severity === 'Critical') {
    return 'Granite ranks this in the Critical band — top 5% of the scored top-500 by blended model probability, EPSS, and exploit signals.'
  }
  return 'Outside the Critical sonar field.'
}

function normalizeLiveItem(item) {
  const risk = Number(item.risk_score) || 0
  const severity = normalizeSeverity(
    item.severity_category || item.category || item.severity,
    risk,
  )
  return {
    id: item.cve_id,
    cve_id: item.cve_id,
    risk_score: risk,
    cvss: Number(item.cvss3_score || item.cvss || 0) || Number((risk * 10).toFixed(1)),
    epss: Number(item.epss) || 0,
    exploit_signal_count: item.exploit_signal_count || 0,
    is_kev: Boolean(item.is_kev),
    category: item.category || 'Vulnerability',
    severity,
    granite_confidence: Number(
      (0.5 + Math.min(0.45, risk * 0.6 + (item.exploit_signal_count || 0) * 0.05)).toFixed(2),
    ),
    exposure: item.is_kev ? 'Internet-facing' : 'Segmented',
    summary: summaryFor(severity),
  }
}

/**
 * Sonar field = Critical band only (Granite top ~5% of ranked top-500).
 * Even angular spacing so blips stay readable.
 */
export function buildRadarThreats(liveItems = []) {
  // Live scoreboard only — no mock blips (those inflated EPSS / Granite % before the API loaded).
  const criticals = liveItems
    .map(normalizeLiveItem)
    .filter((item) => item.severity === 'Critical')
    .sort((a, b) => b.risk_score - a.risk_score)

  const n = criticals.length
  if (n === 0) return []

  return criticals.map((item, index) => {
    // Radius = urgency. Angle = stable hash of CVE so the field isn't a spiral.
    const seed = hashString(item.cve_id || item.id || index)
    const angle = unit(seed) * Math.PI * 2
    const radius = radiusForBand('Critical', index, n)
    return {
      ...item,
      priority: item.risk_score,
      angle,
      radius,
      tone: markerTone('Critical'),
    }
  })
}

export function summarizeThreats(threats, liveItems = []) {
  const critical = threats.filter((t) => t.severity === 'Critical').length
  const high = threats.filter((t) => t.severity === 'High').length
  const clusters = new Set(threats.map((t) => t.category)).size
  const kev = threats.filter((t) => t.is_kev).length
  const signals = threats.reduce((sum, t) => sum + (t.exploit_signal_count || 0), 0)
  const avgConfidence =
    threats.length === 0
      ? 0
      : threats.reduce((sum, t) => sum + (t.granite_confidence || 0), 0) / threats.length
  // Critical / sonar cohort (~top 25 = top 5% of top-500)
  const avgEpssTop25 =
    threats.length === 0
      ? 0
      : threats.reduce((sum, t) => sum + (t.epss || 0), 0) / threats.length

  // Full ranked top-500 from the live scoreboard payload
  const avgEpssTop500 =
    liveItems.length === 0
      ? avgEpssTop25
      : liveItems.reduce((sum, item) => sum + (Number(item.epss) || 0), 0) / liveItems.length

  const cohortCritical =
    liveItems.length > 0
      ? liveItems.filter(
          (i) =>
            normalizeSeverity(i.severity_category || i.category, Number(i.risk_score) || 0) ===
            'Critical',
        ).length
      : critical

  return {
    total: threats.length,
    critical,
    high,
    clusters,
    kev,
    signals,
    avgConfidence,
    avgEpss: avgEpssTop25,
    avgEpssTop25,
    avgEpssTop500,
    cohortCritical,
    cohortHigh: 0,
    cohortSize: liveItems.length || threats.length,
    coverageCritical: cohortCritical === 0 ? 1 : critical / cohortCritical,
    coverageHigh: 1,
    analyzedLabel: 'Critical sonar',
    timestamp: new Date().toISOString(),
  }
}
