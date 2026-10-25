import { loadConfig } from '../config.ts'
import { createDb } from '../db.ts'
import { hashSecret, randomToken } from '../auth/secrets.ts'

/**
 * Crée un administrateur (premier compte d'un environnement pilote ou de production, où il
 * n'existe aucun compte par défaut). Usage :
 *   npm run admin:create -w apps/api -- <identifiant> "<Nom affiché>"
 * Le mot de passe provisoire n'est affiché qu'une fois ; la double vérification (TOTP) est
 * ensuite exigée à la première utilisation des fonctions d'administration.
 */
const [loginId, displayName] = process.argv.slice(2)
if (!loginId || !displayName || !/^[a-z0-9._-]{3,40}$/.test(loginId)) {
  console.error('Usage : npm run admin:create -w apps/api -- <identifiant> "<Nom affiché>"  (identifiant : a-z, 0-9, . _ -)')
  process.exit(1)
}
const config = loadConfig()
const db = createDb(config.DATABASE_URL)
if (await db.account.findUnique({ where: { loginId } })) {
  console.error(`L'identifiant « ${loginId} » existe déjà.`)
  process.exit(1)
}
const temporaryPassword = randomToken(15)
const account = await db.account.create({
  data: { role: 'ADMIN', loginId, displayName, status: 'ACTIVE', secretHash: await hashSecret(temporaryPassword) },
})
await db.auditLog.create({ data: { actorId: null, action: 'account.created_by_cli', targetType: 'Account', targetId: account.id, data: { role: 'ADMIN' } } })
await db.$disconnect()
console.log(`Administrateur « ${loginId} » créé.\nMot de passe provisoire (affiché une seule fois) : ${temporaryPassword}\nActivez ensuite la double vérification depuis l'espace administration.`)
