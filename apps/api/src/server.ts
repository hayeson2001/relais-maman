import { loadConfig } from './config.ts'
import { createDb } from './db.ts'
import { createContext } from './context.ts'
import { createStorage } from './storage/index.ts'
import { buildApp } from './app.ts'

const config = loadConfig()
const db = createDb(config.DATABASE_URL)
const country = await db.country.findUnique({ where: { code: config.DEFAULT_COUNTRY } })
const app = await buildApp(
  createContext({ db, config, storage: createStorage(config), timeZone: country?.timeZone ?? 'Africa/Lome' }),
)
await app.listen({ port: config.PORT, host: '127.0.0.1' })
