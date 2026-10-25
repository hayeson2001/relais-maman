import { demoResetAllowed, loadConfig } from '../config.ts'
import { currentTotp } from '../auth/totp.ts'
import { DEMO } from './seed.ts'

/** Affiche le code TOTP courant du compte admin DE DÉMONSTRATION. Refusé hors local/démo. */
if (!demoResetAllowed(loadConfig())) {
  console.error('Refusé hors local/test/démo.')
  process.exit(1)
}
console.log(currentTotp(DEMO.admin.totpSecret))
