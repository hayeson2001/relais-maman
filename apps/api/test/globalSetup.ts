import { execSync } from 'node:child_process'

/** Applique les migrations versionnées sur la base de TEST (jamais sur la base de démo). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://relais@127.0.0.1:54329/relais_maman_test'
  if (!/_test\b/.test(url)) throw new Error(`Refus : TEST_DATABASE_URL doit désigner une base *_test (${url}).`)
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' })
}
