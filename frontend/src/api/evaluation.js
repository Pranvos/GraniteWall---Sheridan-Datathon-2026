const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function getEvaluation(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {
      // Keep the HTTP error when the response is not JSON.
    }
    throw new Error(detail)
  }
  return response.json()
}

export function fetchEvaluationSummary() {
  return getEvaluation('/api/v1/evaluation/summary')
}

export function fetchEvaluationResults() {
  return getEvaluation('/api/v1/evaluation/results')
}

const number = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeEvaluationSummary(rows = []) {
  return rows.map((row) => ({
    ...row,
    method: row.method || 'unknown',
    hits: number(row.avg_hits ?? row.hits),
    precision: number(row.avg_precision_at_k ?? row.precision_at_k),
    recall: number(row.avg_recall_at_k ?? row.recall_at_k),
    candidates: number(row.avg_candidates ?? row.n_candidates),
    positives: number(row.avg_positives ?? row.n_positive ?? row.n_positives),
    months: number(row.n_months ?? row.months),
  }))
}

export function normalizeEvaluationResults(rows = []) {
  return rows.map((row) => ({
    ...row,
    month: row.month || 'Unknown',
    method: row.method || 'unknown',
    hits: number(row.hits),
    precision: number(row.precision_at_k ?? row.precision),
    recall: number(row.recall_at_k ?? row.recall),
    candidates: number(row.n_candidates ?? row.candidates),
    positives: number(row.n_positive ?? row.n_positives ?? row.positives),
  }))
}
