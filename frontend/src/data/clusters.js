/** Cluster intelligence payloads for the Swiss editorial overview. */

export const CLUSTER_META = [
  {
    id: 'c-blue',
    name: 'Vulnerability Factor X',
    label: 'Factor X',
    color: '#0033FF',
    glow: '#6688FF',
    risk: 'Signal',
    lat: 42,
    lon: -150,
  },
  {
    id: 'c-amber',
    name: 'Vulnerability Factor Y',
    label: 'Factor Y',
    color: '#F59E0B',
    glow: '#FBBF24',
    risk: 'Elevated',
    lat: -35,
    lon: -90,
  },
  {
    id: 'c-coral',
    name: 'Vulnerability Factor Z',
    label: 'Factor Z',
    color: '#FF334B',
    glow: '#FF7A8A',
    risk: 'Critical',
    lat: 28,
    lon: -30,
  },
]

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function makeCve(rand, i) {
  const year = 2022 + Math.floor(rand() * 4)
  const id = String(1000 + Math.floor(rand() * 89000)).padStart(5, '0')
  return `CVE-${year}-${id}`
}

function makeDashboard(cluster, rand, index) {
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const base = 20 + i * 3 + Math.floor(rand() * 18)
    return {
      week: `W${i + 1}`,
      detections: base + Math.floor(rand() * 12),
      mitigated: Math.max(2, base - 8 - Math.floor(rand() * 10)),
    }
  })

  return {
    clusterId: cluster.id,
    clusterName: cluster.name,
    accent: cluster.color,
    metrics: {
      analyzed: 1200 + Math.floor(rand() * 4200),
      hotspots: 4 + Math.floor(rand() * 14),
      graniteConfidence: 0.81 + rand() * 0.17,
      exploitRate: 0.12 + rand() * 0.35,
    },
    weeks,
    riskBreakdown: [
      { name: 'Critical', value: 28 + Math.floor(rand() * 20), fill: '#FF334B' },
      { name: 'High', value: 22 + Math.floor(rand() * 18), fill: '#F59E0B' },
      { name: 'Medium', value: 18 + Math.floor(rand() * 16), fill: '#0033FF' },
      { name: 'Low', value: 10 + Math.floor(rand() * 12), fill: '#A3A3A3' },
    ],
    vulns: Array.from({ length: 8 }, (_, i) => ({
      id: makeCve(rand, index * 10 + i),
      title: [
        'Auth bypass in edge gateway',
        'Unsigned package pull',
        'Hardcoded token in CI artifact',
        'Over-permissive IAM role',
        'Deserialization gadget chain',
        'Unpatched OpenSSL path',
        'SSRF via webhook relay',
        'Stale kube service account',
      ][i],
      severity: ['Critical', 'High', 'High', 'Medium', 'Critical', 'Medium', 'High', 'Low'][i],
      confidence: 0.72 + rand() * 0.26,
      exploitProb: 0.18 + rand() * 0.7,
    })),
  }
}

export function buildClusters(seed = 42) {
  const rand = mulberry32(seed)
  return CLUSTER_META.map((cluster, index) => ({
    ...cluster,
    index,
    signalCount: 6 + Math.floor(rand() * 18),
    riskScore: 62 + Math.floor(rand() * 36),
    dashboard: makeDashboard(cluster, rand, index),
  }))
}
