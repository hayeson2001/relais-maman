import { writeFileSync } from 'node:fs'
import { buildApp } from '../apps/api/src/app.ts'
import { loadConfig } from '../apps/api/src/config.ts'
import { createContext } from '../apps/api/src/context.ts'
import { createDb } from '../apps/api/src/db.ts'
import { createLocalStorage } from '../apps/api/src/storage/index.ts'

/** Exporte la documentation OpenAPI générée depuis les schémas Zod des routes réelles. */
const config = loadConfig({ ...process.env, APP_ENV: 'test', APP_SECRET: process.env.APP_SECRET ?? 'x'.repeat(32), DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://relais@127.0.0.1:54329/relais_maman' })
const app = await buildApp(createContext({ db: createDb(config.DATABASE_URL), config, storage: createLocalStorage('.local/tmp') }))
await app.ready()
writeFileSync('docs/api/openapi.json', JSON.stringify(app.swagger(), null, 2) + '\n')
console.log(`${Object.keys(app.swagger().paths ?? {}).length} routes exportées dans docs/api/openapi.json`)
await app.close()
process.exit(0)
