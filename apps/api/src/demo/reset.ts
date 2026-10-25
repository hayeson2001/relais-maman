import { rm } from 'node:fs/promises'
import { demoResetAllowed, loadConfig } from '../config.ts'
import { createDb, type Db } from '../db.ts'
import { DEMO, seedDemo } from './seed.ts'
import { currentTotp } from '../auth/totp.ts'

/** Vide toutes les tables applicatives (jamais la table des migrations). */
export async function truncateAll(db: Db) {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  }
}

/**
 * Remise à zéro de la démonstration : CLI uniquement, refusée hors APP_ENV local/test/demo.
 * Aucun bouton public ne déclenche cette opération.
 */
async function main() {
  const config = loadConfig()
  if (!demoResetAllowed(config)) {
    console.error(`Refusé : APP_ENV=${config.APP_ENV}. La remise à zéro n'existe qu'en local, test ou démo.`)
    process.exit(1)
  }
  const db = createDb(config.DATABASE_URL)
  await truncateAll(db)
  if (config.STORAGE_DRIVER === 'local') await rm(config.STORAGE_LOCAL_DIR, { recursive: true, force: true })
  await seedDemo(db)
  await db.$disconnect()

  console.log('\nDémonstration réinitialisée (données fictives).\n')
  console.table([
    { espace: 'Bénéficiaire', compte: 'Ama K.', identifiant: DEMO.ama.identifier, secret: `code ${DEMO.ama.pin}` },
    { espace: 'Bénéficiaire', compte: 'Abiba T.', identifiant: DEMO.abiba.identifier, secret: `code ${DEMO.abiba.pin}` },
    { espace: 'Bénéficiaire', compte: 'Akou D. (équipe Ouest)', identifiant: DEMO.akou.identifier, secret: `code ${DEMO.akou.pin}` },
    { espace: 'Bénéficiaire', compte: 'Yawa (à activer)', identifiant: DEMO.yawa.identifier, secret: `activation ${DEMO.yawa.activationCode}` },
    { espace: 'Agent', compte: 'Esi (Est)', identifiant: DEMO.agentEst.loginId, secret: DEMO.agentEst.password },
    { espace: 'Agent', compte: 'Kodjo (Est)', identifiant: DEMO.agentEst2.loginId, secret: DEMO.agentEst2.password },
    { espace: 'Agent', compte: 'Afi (Ouest)', identifiant: DEMO.agentOuest.loginId, secret: DEMO.agentOuest.password },
    { espace: 'Structure', compte: 'Centre A (habilitée)', identifiant: DEMO.referentA.loginId, secret: DEMO.referentA.password },
    { espace: 'Structure', compte: 'Centre B (non habilité)', identifiant: DEMO.referentB.loginId, secret: DEMO.referentB.password },
    { espace: 'Administration', compte: 'Admin', identifiant: DEMO.admin.loginId, secret: DEMO.admin.password },
  ])
  console.log(`Code de double vérification admin (démo) : npm run demo:totp -w apps/api  (code actuel : ${currentTotp(DEMO.admin.totpSecret)})`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
