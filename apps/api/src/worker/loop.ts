import type { AppContext } from '../context.ts'
import { markDueRequests, processOutbox, purgeTechnicalData } from './jobs.ts'

/** Un passage du worker : envois en attente, rendez-vous passés, purge technique. */
export async function workerTick(ctx: AppContext) {
  const outbox = await processOutbox(ctx)
  const due = await markDueRequests(ctx)
  const purge = await purgeTechnicalData(ctx)
  return { at: ctx.now().toISOString(), outbox, due, purge }
}

/**
 * Boucle du worker dans le processus courant (WORKER_INLINE=true, démo à un seul service).
 * Les passages ne se chevauchent jamais. Renvoie une fonction d'arrêt.
 */
export function startWorkerLoop(
  ctx: AppContext,
  log: { info: (o: object) => void; error: (o: object) => void },
  intervalMs = 30_000,
) {
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  const loop = async () => {
    if (stopped) return
    try {
      log.info({ worker: await workerTick(ctx) })
    } catch (e) {
      log.error({ worker: 'erreur', name: (e as Error).name, message: (e as Error).message })
    }
    if (!stopped) timer = setTimeout(loop, intervalMs)
  }
  void loop()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
