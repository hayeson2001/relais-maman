/**
 * Client HTTP. Le cookie de session est HttpOnly (illisible en JavaScript). Le jeton CSRF,
 * lié à la session, est gardé UNIQUEMENT en mémoire : jamais dans localStorage ni sur disque.
 */
let csrfToken: string | null = null
export const setCsrfToken = (t: string | null) => {
  csrfToken = t
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

/** Erreur réseau (hors connexion, serveur injoignable) : distincte d'un refus du serveur. */
export class NetworkError extends Error {
  constructor() {
    super('Pas de connexion')
  }
}

let onUnauthenticated: (() => void) | null = null
export const setUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken

  let res: Response
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new NetworkError()
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthenticated?.()
    const d = typeof data === 'object' && data ? (data as { error?: string; message?: string }) : {}
    throw new ApiError(res.status, d.error ?? 'ERROR', d.message ?? 'Erreur')
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form),
}
