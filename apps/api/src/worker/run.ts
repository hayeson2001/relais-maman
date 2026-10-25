import { loadConfig } from '../config.ts'
import { createDb } from '../db.ts'
import { createContext } from '../context.ts'
import { createStorage } from '../storage/index.ts'
import { markDueRequests, processOutbox, purgeTechnicalData } from './jobs.ts'

/** Worker simple : boucle toutes les 30 s. Un seul processus suffit pour un pilote. */
const config = loadConfig()
const db = createDb(config.DATABASE_URL)
const ctx = createContext({ db, config, storage: createStorage(config) })
let stopping = false

async function tick() {
  const outbox = await processOutbox(ctx)
  const due = await markDueRequests(ctx)
  const purge = await purgeTechnicalData(ctx)
  console.log(JSON.stringify({ at: new Date().toISOString(), outbox, due, purge }))
}

process.on('SIGINT', () => (stopping = true))
process.on('SIGTERM', () => (stopping = true))

while (!stopping) {
  await tick().catch((e: Error) => console.error('Erreur worker :', e.name, e.message))
  await new Promise((r) => setTimeout(r, 30_000))
}
await db.$disconnect()
