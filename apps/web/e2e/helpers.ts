import { expect, type Browser, type Page } from '@playwright/test'
import { Secret, TOTP } from 'otpauth'

/** Identifiants FICTIFS de démonstration (apps/api/src/demo/seed.ts). */
export const DEMO = {
  ama: { identifier: 'RM-AMAK-4M2X', pin: '482915' },
  abiba: { identifier: 'RM-ABBT-7P3Q', pin: '739264' },
  esi: { username: 'agent.esi', password: 'demo-agent-2026' },
  afi: { username: 'agent.ouest', password: 'demo-agent-2026' },
  refA: { username: 'ref.centre-a', password: 'demo-ref-2026' },
  admin: { username: 'admin.demo', password: 'demo-admin-2026', totp: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
}

export const totpNow = () => new TOTP({ secret: Secret.fromBase32(DEMO.admin.totp), period: 30, digits: 6 }).generate()

export async function loginBeneficiary(page: Page, who: { identifier: string; pin: string }) {
  await page.goto('/connexion')
  await page.getByLabel('Mon identifiant').fill(who.identifier)
  await page.getByLabel('Mon code personnel (6 chiffres)').fill(who.pin)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await expect(page).toHaveURL(/\/b$/)
}

export async function loginStaff(page: Page, who: { username: string; password: string }) {
  await page.goto('/equipe')
  await page.getByLabel('Identifiant').fill(who.username)
  await page.getByLabel('Mot de passe').fill(who.password)
  await page.getByRole('button', { name: 'Entrer' }).click()
  await expect(page).not.toHaveURL(/\/equipe$/) // connexion terminée (cookie posé)
}

/** Chaque rôle dans son propre contexte navigateur : cookies et mémoire totalement séparés. */
export async function newUser(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}
