import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

/** Migre puis réinitialise la base de TEST avec les données fictives de démonstration. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://relais@127.0.0.1:54329/relais_maman_test'
  if (!/_test\b/.test(url)) throw new Error('Les parcours navigateur exigent une base *_test.')
  const api = resolve(import.meta.dirname, '../../api')
  const env = {
    ...process.env,
    DATABASE_URL: url,
    APP_ENV: 'test',
    APP_SECRET: process.env.APP_SECRET ?? 'e2e-app-secret-0123456789abcdef0123456789abcdef',
    STORAGE_LOCAL_DIR: resolve(api, '../../.local/e2e-audio'),
  }
  execSync('npx prisma migrate deploy', { cwd: api, env, stdio: 'pipe' })
  execSync('npx tsx src/demo/reset.ts', { cwd: api, env, stdio: 'pipe' })
}
