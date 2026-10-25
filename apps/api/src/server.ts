import { loadConfig } from './config.ts'
import { createDb } from './db.ts'
import { createContext } from './context.ts'
import { createStorage } from './storage/index.ts'
import { buildApp } from './app.ts'
import { startWorkerLoop } from './worker/loop.ts'
import { startDemoAutoReset } from './demo/autoReset.ts'

const config = loadConfig()
const db = createDb(config.DATABASE_URL)
const country = await db.country.findUnique({ where: { code: config.DEFAULT_COUNTRY } })
const ctx = createContext({ db, config, storage: createStorage(config), timeZone: country?.timeZone ?? 'Africa/Lome' })
const app = await buildApp(ctx)

const stops: Array<() => void> = []
if (config.DEMO_AUTO_RESET) stops.push(await startDemoAutoReset(ctx, app.log))
if (config.WORKER_INLINE) stops.push(startWorkerLoop(ctx, app.log))

await app.listen({ port: config.PORT, host: config.HOST })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    for (const stop of stops) stop()
    await app.close()
    await db.$disconnect()
    process.exit(0)
  })
}
