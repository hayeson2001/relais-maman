import { api, ApiError, NetworkError } from '../api/client.ts'

/**
 * File d'envoi des demandes (docs/synchronisation.md).
 *
 * Politique, mode « téléphone partagé » (par défaut et seul mode en v0.2) :
 * - Le brouillon et la file vivent EN MÉMOIRE uniquement : rien de sensible sur disque.
 *   Conséquence assumée et affichée : fermer l'onglet avant le retour du réseau perd l'envoi.
 * - Une demande n'est jamais dite « envoyée » avant l'accusé du serveur (HTTP 200/201).
 * - La clé d'idempotence est créée UNE fois, quand la femme confirme l'envoi, puis réutilisée
 *   à chaque nouvel essai : le serveur renvoie la même demande au lieu d'un doublon.
 * - Erreur réseau : on réessaie au retour de la connexion. Refus du serveur (règle métier,
 *   session expirée, droits retirés) : l'élément passe en erreur VISIBLE, jamais réessayé en
 *   silence ; l'authentification et les droits sont revérifiés par le serveur à chaque envoi.
 * - Déconnexion : la file est vidée (purge locale).
 */
export interface PendingRequest {
  idempotencyKey: string
  payload: Record<string, unknown>
  status: 'PENDING_SEND' | 'SENDING' | 'SENT' | 'ERROR'
  error?: string
  serverId?: string
  attempts: number
}

type Listener = (items: PendingRequest[]) => void
let queue: PendingRequest[] = []
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l([...queue]))

export function subscribe(fn: Listener) {
  listeners.add(fn)
  fn([...queue])
  return () => {
    listeners.delete(fn)
  }
}

export function clearSendQueue() {
  queue = []
  emit()
}

export function enqueue(payload: Record<string, unknown>): PendingRequest {
  const item: PendingRequest = {
    idempotencyKey: crypto.randomUUID(),
    payload,
    status: 'PENDING_SEND',
    attempts: 0,
  }
  queue.push(item)
  emit()
  void flush()
  return item
}

/** Mise à jour IMMUABLE : un nouvel objet à chaque changement, sinon React ne réaffiche pas. */
function update(key: string, patch: Partial<PendingRequest>) {
  queue = queue.map((i) => (i.idempotencyKey === key ? { ...i, ...patch } : i))
  emit()
  return queue.find((i) => i.idempotencyKey === key)
}

let flushing = false
export async function flush() {
  if (flushing) return
  flushing = true
  try {
    for (const { idempotencyKey } of queue.filter((i) => i.status === 'PENDING_SEND')) {
      const item = update(idempotencyKey, { status: 'SENDING' })
      if (!item) continue
      update(idempotencyKey, { attempts: item.attempts + 1 })
      try {
        const res = await api.post<{ id: string }>('/api/me/requests', { ...item.payload, idempotencyKey })
        update(idempotencyKey, { status: 'SENT', serverId: res.id })
      } catch (e) {
        if (e instanceof NetworkError) {
          update(idempotencyKey, { status: 'PENDING_SEND' }) // réessai au retour du réseau, même clé
        } else {
          update(idempotencyKey, { status: 'ERROR', error: e instanceof ApiError ? e.message : 'Erreur inattendue' })
        }
      }
    }
  } finally {
    flushing = false
  }
}

export function retry(idempotencyKey: string) {
  const item = queue.find((i) => i.idempotencyKey === idempotencyKey)
  if (item && item.status === 'ERROR') {
    update(idempotencyKey, { status: 'PENDING_SEND', error: undefined })
    void flush()
  }
}

export function discard(idempotencyKey: string) {
  queue = queue.filter((i) => i.idempotencyKey !== idempotencyKey)
  emit()
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flush())
