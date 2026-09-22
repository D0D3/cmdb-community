import { client } from './client'

export interface CiRef {
  id:      string
  name:    string
  ci_type: string
}

export interface QualityIssue {
  key:      string
  label:    string
  detail:   string
  severity: 'high' | 'medium' | 'low'
  count:    number
  total:    number
  pct:      number
  cis:      CiRef[]
}

export interface QualitySummary {
  score:    number
  total_ci: number
  issues:   QualityIssue[]
}

export const getQualitySummary = () =>
  client.get<QualitySummary>('/quality/summary').then(r => r.data)
