import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSendQueue, enqueue, flush, retry, subscribe, type PendingRequest } from '../src/offline/sendQueue.ts'

describe('File d’envoi (téléphone partagé, connexion instable)', () => {
  let snapshots: PendingRequest[][] = []
  let unsub: () => void
  const fetchMock = vi.fn()

  beforeEach(() => {
    snapshots = []
    clearSendQueue()
    unsub = subscribe((items) => snapshots.push(items))
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    unsub()
    vi.unstubAllGlobals()
  })

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('hors connexion : reste « en attente » et réessaie avec la MÊME clé, sans doublon', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const item = enqueue({ category: 'COST', text: 'Combien coûte la consultation ?' })
    await vi.waitFor(() => expect(snapshots.at(-1)?.[0]?.status).toBe('PENDING_SEND'))

    fetchMock.mockResolvedValueOnce(json(201, { id: 'srv-1' }))
    await flush()
    const last = snapshots.at(-1)![0]!
    expect(last.status).toBe('SENT')
    expect(last.serverId).toBe('srv-1')

    const keys = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).idempotencyKey)
    expect(keys).toEqual([item.idempotencyKey, item.idempotencyKey])
  })

  it('refus du serveur : erreur visible, jamais réessayée en silence', async () => {
    fetchMock.mockResolvedValueOnce(json(422, { error: 'CONSENT_TEXT_UNKNOWN', message: 'Rechargez la page.' }))
    enqueue({ category: 'COST' })
    await vi.waitFor(() => expect(snapshots.at(-1)?.[0]?.status).toBe('ERROR'))
    expect(snapshots.at(-1)![0]!.error).toBe('Rechargez la page.')
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(json(201, { id: 'srv-2' }))
    retry(snapshots.at(-1)![0]!.idempotencyKey)
    await vi.waitFor(() => expect(snapshots.at(-1)?.[0]?.status).toBe('SENT'))
  })

  it('régression : chaque changement produit un NOUVEL objet (sinon l’écran ne se met pas à jour)', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'srv-3' }))
    enqueue({ category: 'COST' })
    await vi.waitFor(() => expect(snapshots.at(-1)?.[0]?.status).toBe('SENT'))
    const versions = snapshots.map((s) => s[0]).filter(Boolean)
    for (let i = 1; i < versions.length; i++) {
      if (versions[i]!.status !== versions[i - 1]!.status) expect(versions[i]).not.toBe(versions[i - 1])
    }
  })

  it('la déconnexion vide la file', () => {
    enqueue({ category: 'COST' })
    clearSendQueue()
    expect(snapshots.at(-1)).toEqual([])
  })
})
