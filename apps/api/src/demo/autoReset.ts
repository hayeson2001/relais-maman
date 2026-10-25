import type { AppContext } from '../context.ts'
import { resetDemo } from './reset.ts'

/** Jour civil (AAAA-MM-JJ) et heure dans le fuseau donné. */
export function localDayHour(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

/** Vrai pendant l'heure de remise à zéro, une seule fois par jour civil. */
export function resetDue(now: Date, lastResetDay: string, resetHour: number, timeZone: string) {
  const { day, hour } = localDayHour(now, timeZone)
  return hour === resetHour && day !== lastResetDay
}

/**
 * Démo publique (DEMO_AUTO_RESET=true) : crée les données fictives si la base est vide, puis
 * remet tout à zéro chaque nuit, pour que chaque visiteur trouve le scénario intact et que rien
 * de ce qu'un visiteur a saisi ne soit conservé. Renvoie une fonction d'arrêt.
 */
export async function startDemoAutoReset(
  ctx: AppContext,
  log: { info: (o: object) => void; error: (o: object) => void },
  intervalMs = 60_000,
) {
  if (!ctx.config.DEMO_AUTO_RESET) throw new Error('DEMO_AUTO_RESET doit être activé.')
  if ((await ctx.db.account.count()) === 0) {
    await resetDemo(ctx.db, ctx.config, ctx.now())
    log.info({ demo: 'base vide : données fictives créées' })
  }
  let lastResetDay = localDayHour(ctx.now(), ctx.timeZone).day
  let running = false
  const timer = setInterval(() => {
    if (running || !resetDue(ctx.now(), lastResetDay, ctx.config.DEMO_RESET_HOUR, ctx.timeZone)) return
    running = true
    lastResetDay = localDayHour(ctx.now(), ctx.timeZone).day
    resetDemo(ctx.db, ctx.config, ctx.now())
      .then(() => log.info({ demo: 'remise à zéro nocturne effectuée' }))
      .catch((e: Error) => log.error({ demo: 'échec de la remise à zéro', name: e.name, message: e.message }))
      .finally(() => (running = false))
  }, intervalMs)
  return () => clearInterval(timer)
}
