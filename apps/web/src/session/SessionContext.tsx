import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, setCsrfToken, setUnauthenticatedHandler } from '../api/client.ts'
import { clearSendQueue } from '../offline/sendQueue.ts'

export type Role = 'BENEFICIARY' | 'AGENT' | 'FACILITY_REFERENT' | 'ADMIN'
export interface Me {
  role: Role
  displayName: string
  csrfToken: string
  mfaVerified: boolean
  totpEnabled: boolean
  canConfirmCare: boolean
  appEnv: string
}

interface SessionValue {
  me: Me | null
  loading: boolean
  refresh: () => Promise<Me | null>
  logout: () => Promise<void>
  expired: boolean
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * Purge locale (téléphone partagé, section 11) : mémoire, file d'envoi, stockage de session
 * et caches éventuels. Aucune réponse privée n'est mise en cache par le service worker,
 * mais on purge par sécurité tout cache qui ne serait pas celui de l'interface publique.
 */
export async function purgeLocalData() {
  setCsrfToken(null)
  clearSendQueue()
  try {
    sessionStorage.clear()
  } catch {
    /* stockage indisponible : rien à purger */
  }
  if ('caches' in window) {
    for (const key of await caches.keys()) if (!key.startsWith('workbox-precache')) await caches.delete(key)
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<Me>('/api/auth/me')
      setCsrfToken(data.csrfToken)
      setMe(data)
      setExpired(false)
      return data
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null)
        setCsrfToken(null)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      await purgeLocalData()
      setMe(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Session expirée côté serveur : purge et retour à la connexion, avec un message clair.
    setUnauthenticatedHandler(() => {
      void purgeLocalData()
      setMe(null)
      setExpired(true)
    })
  }, [refresh])

  return <SessionContext.Provider value={{ me, loading, refresh, logout, expired }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const v = useContext(SessionContext)
  if (!v) throw new Error('SessionProvider manquant')
  return v
}
