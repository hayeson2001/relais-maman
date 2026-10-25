import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ApiError, NetworkError } from '../api/client.ts'

export const TIME_ZONE = 'Africa/Lome'

/** Date compréhensible : « mercredi 28 octobre à 15 h 30 » (heure de Lomé). */
export function formatDateTime(iso: string | Date) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
  return `${date} à ${time}`
}
export const formatDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' })
export const todayCivil = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE })

/** Message d'erreur qui explique comment continuer (le serveur fournit le texte). */
export function errorMessage(e: unknown, t: (k: string) => string) {
  if (e instanceof NetworkError) return t('app.offline')
  if (e instanceof ApiError) return e.message
  return t('app.errorGeneric')
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'offline'; children: ReactNode }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? '⚠ ' : 'ℹ '}
      {children}
    </div>
  )
}

/** Libellé d'un état. Côté équipe, la déclaration de soin n'est pas formulée à la 2e personne. */
export function stateLabel(t: TFunction, state: string, staff = false) {
  return staff && state === 'CARE_DECLARED' ? t('states.CARE_DECLARED_STAFF') : t(`states.${state}`)
}

/** État serveur ou local : libellé + symbole, jamais la couleur seule. */
export function StateBadge({ state, viewed, staff }: { state: string; viewed?: boolean; staff?: boolean }) {
  const { t } = useTranslation()
  const label = state === 'RECEIVED' && viewed ? t('states.VIEWED') : stateLabel(t, state, staff)
  const symbol = state === 'CARE_VERIFIED' ? '✓✓' : state === 'CARE_DECLARED' ? '✓' : state === 'CLOSED_WITHOUT_CARE' ? '■' : '●'
  const cls = state === 'CARE_VERIFIED' ? 'done' : state === 'CLOSED_WITHOUT_CARE' ? 'closed' : ''
  return (
    <span className={`status ${cls}`}>
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  )
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Petite aide de chargement avec erreur explicite et bouton « Réessayer ». */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loader())
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error, loading, reload, setData }
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  if (loading) return <p aria-live="polite">{t('app.loading')}</p>
  if (error)
    return (
      <Alert kind="error">
        {errorMessage(error, t)}{' '}
        <button className="btn secondary" type="button" onClick={onRetry}>
          {t('app.retry')}
        </button>
      </Alert>
    )
  return null
}
