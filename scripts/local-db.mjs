#!/usr/bin/env node
/**
 * Instance PostgreSQL locale, isolée dans .local/pgdata, sur le port 54329.
 * Alternative à Docker Compose quand Docker n'est pas disponible. Ne touche à aucune autre
 * instance PostgreSQL de la machine. Nécessite les binaires PostgreSQL (initdb, pg_ctl).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dataDir = resolve(root, '.local/pgdata')
const logFile = resolve(root, '.local/postgres.log')
const port = process.env.LOCAL_PG_PORT ?? '54329'
// LC_ALL explicite : sans locale valide, PostgreSQL refuse de démarrer sur macOS
// (« postmaster became multithreaded during startup »).
const env = { ...process.env, LC_ALL: 'C', LANG: 'C' }
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', env })

const command = process.argv[2]

if (command === 'start') {
  if (!existsSync(dataDir)) {
    mkdirSync(resolve(root, '.local'), { recursive: true })
    run('initdb', ['-D', dataDir, '-U', 'relais', '--auth=trust', '--encoding=UTF8', '--locale=C'])
  }
  const status = spawnSync('pg_ctl', ['-D', dataDir, 'status'], { env })
  if (status.status !== 0) {
    run('pg_ctl', ['-D', dataDir, '-l', logFile, '-o', `-p ${port} -k ${resolve(root, '.local')}`, 'start', '-w'])
  }
  for (const db of ['relais_maman', 'relais_maman_test']) {
    const exists = spawnSync('psql', ['-h', '127.0.0.1', '-p', port, '-U', 'relais', '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${db}'`], { encoding: 'utf8', env })
    if (!exists.stdout.trim()) run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', 'relais', db])
  }
  console.log(`PostgreSQL local prêt sur 127.0.0.1:${port} (bases relais_maman et relais_maman_test).`)
} else if (command === 'stop') {
  if (existsSync(dataDir)) run('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'])
} else {
  console.error('Usage : node scripts/local-db.mjs start|stop')
  process.exit(1)
}
