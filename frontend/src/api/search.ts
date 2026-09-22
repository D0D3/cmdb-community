import { client } from './client'

export interface SearchResult {
  type:     'ci' | 'incident' | 'change' | 'cve'
  id:       string
  title:    string
  subtitle: string
  url:      string
}

export interface SearchResponse {
  query:   string
  total:   number
  results: SearchResult[]
}

export async function globalSearch(q: string): Promise<SearchResponse> {
  return client.get<SearchResponse>('/search', { params: { q } }).then(r => r.data)
}
