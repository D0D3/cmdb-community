import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { getIngestStatus, type IngestStatus } from '@/api/cve'

interface IngestContextValue {
  status: IngestStatus
  finishedVisible: boolean   // true seulement après un déclenchement manuel, pendant 2,5 min
  notifyStarted: () => void
}

const DEFAULT: IngestStatus = {
  running: false,
  started_at: null,
  finished_at: null,
  matched_cves: null,
  new_links: null,
}

const IngestContext = createContext<IngestContextValue>({
  status: DEFAULT,
  finishedVisible: false,
  notifyStarted: () => {},
})

const POLL_FAST    = 4_000    // pendant l'ingestion
const POLL_IDLE    = 120_000  // au repos
const BANNER_TTL   = 150_000  // 2 min 30 s avant effacement automatique de la bannière verte

export function IngestProvider({ children }: { children: ReactNode }) {
  const [status, setStatus]           = useState<IngestStatus>(DEFAULT)
  const [finishedVisible, setFinishedVisible] = useState(false)

  const pollRef       = useRef<ReturnType<typeof setInterval>  | null>(null)
  const hideTimerRef  = useRef<ReturnType<typeof setTimeout>   | null>(null)
  const wasRunningRef = useRef(false)

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback((interval: number, fetchFn: () => Promise<void>) => {
    stopPolling()
    pollRef.current = setInterval(fetchFn, interval)
  }, [stopPolling])

  // Déclenché quand le poll détecte running → done
  const onDone = useCallback(() => {
    setFinishedVisible(true)
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => setFinishedVisible(false), BANNER_TTL)
    // repasse en polling lent
    const idleFetch = async () => {
      try { await getIngestStatus().then(d => setStatus(d)) } catch { /* silencieux */ }
    }
    startPolling(POLL_IDLE, idleFetch)
  }, [startPolling])

  // Fetch avec détection de transition running → done
  const buildFetch = useCallback((withDoneCallback: boolean) => async () => {
    try {
      const data = await getIngestStatus()
      const wasRunning = wasRunningRef.current
      wasRunningRef.current = data.running
      setStatus(data)
      if (withDoneCallback && wasRunning && !data.running) {
        onDone()
      } else if (!data.running) {
        stopPolling()
      }
    } catch {
      // silencieux
    }
  }, [onDone, stopPolling])

  const notifyStarted = useCallback(() => {
    // Efface la bannière précédente et annule son timer
    setFinishedVisible(false)
    clearHideTimer()
    wasRunningRef.current = true
    setStatus(prev => ({ ...prev, running: true }))
    startPolling(POLL_FAST, buildFetch(true))
  }, [buildFetch, startPolling])

  // Vérification initiale — si un sync est déjà en cours au chargement de page
  useEffect(() => {
    getIngestStatus()
      .then(data => {
        wasRunningRef.current = data.running
        setStatus(data)
        if (data.running) {
          startPolling(POLL_FAST, buildFetch(true))
        } else {
          startPolling(POLL_IDLE, buildFetch(false))
        }
      })
      .catch(() => startPolling(POLL_IDLE, buildFetch(false)))

    return () => {
      stopPolling()
      clearHideTimer()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <IngestContext.Provider value={{ status, finishedVisible, notifyStarted }}>
      {children}
    </IngestContext.Provider>
  )
}

export function useIngest() {
  return useContext(IngestContext)
}
