import { expect, test } from '@playwright/test'
import { DEMO, loginBeneficiary, loginStaff, newUser } from './helpers.ts'

test('coupure réseau : rien n’est dit « envoyé » avant l’accusé serveur, reprise sans doublon', async ({ browser }) => {
  const { context, page } = await newUser(browser)
  await loginBeneficiary(page, DEMO.abiba)
  await page.getByRole('link', { name: 'Signaler un obstacle' }).click()
  await page.getByRole('button', { name: /Les frais/ }).click()
  await page.getByRole('button', { name: /Pas de rendez-vous précis/ }).click()
  await page.getByLabel(/Votre message/).fill('Combien coûte la consultation de suivi ?')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel(/J’accepte que ma demande soit transmise/).check()
  await page.getByRole('button', { name: 'Continuer' }).click()

  // Coupure juste avant l'envoi.
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(page.getByRole('heading', { name: 'Pas encore envoyée' })).toBeVisible()
  await expect(page.getByText('Envoi en attente de connexion')).toBeVisible()
  await expect(page.getByText(/Pas de connexion/).first()).toBeVisible()
  await expect(page.getByText('Votre demande est bien arrivée.')).toHaveCount(0)

  // Retour du réseau : l'envoi repart avec la MÊME clé d'idempotence.
  await context.setOffline(false)
  await expect(page.getByText('Votre demande est bien arrivée.')).toBeVisible()

  // Une seule demande côté serveur.
  const overview = await page.request.get('/api/me/overview')
  const costRequests = (await overview.json()).requests.filter((r: { category: string }) => r.category === 'COST')
  expect(costRequests).toHaveLength(1)
  await context.close()
})

test('téléphone partagé : rien de privé sur disque, purge à la déconnexion, retour impossible', async ({ browser }) => {
  const { context, page } = await newUser(browser)
  await loginBeneficiary(page, DEMO.ama)
  await expect(page.getByText('Votre suivi après la naissance')).toBeVisible()

  const storage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    caches: 'caches' in window ? await Promise.all((await caches.keys()).map(async (k) => ({ k, urls: (await (await caches.open(k)).keys()).map((r) => r.url) }))) : [],
  }))
  expect(storage.local).toEqual([])
  // Aucune réponse /api dans un cache du service worker.
  const cachedUrls = storage.caches.flatMap((c) => c.urls)
  expect(cachedUrls.filter((u) => u.includes('/api/'))).toEqual([])
  // Le cookie de session n'est pas lisible en JavaScript.
  expect(await page.evaluate(() => document.cookie)).not.toContain('rm_session')

  await page.getByRole('button', { name: 'Me déconnecter' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([])
  await page.goBack()
  await page.goto('/b')
  await expect(page).toHaveURL(/\/connexion$/)
  expect((await page.request.get('/api/me/overview')).status()).toBe(401)
  await context.close()
})

test('un agent qui force l’adresse d’un dossier d’une autre équipe ne voit rien', async ({ browser }) => {
  const esi = await newUser(browser)
  await loginStaff(esi.page, DEMO.esi)
  await esi.page.getByRole('link', { name: 'Abiba T.' }).first().click()
  const abibaUrl = esi.page.url()

  const afi = await newUser(browser)
  await loginStaff(afi.page, DEMO.afi)
  await afi.page.goto(abibaUrl)
  await expect(afi.page.getByText(/Élément introuvable/)).toBeVisible()
  await expect(afi.page.getByText('transport depuis mon village')).toHaveCount(0)
  await esi.context.close()
  await afi.context.close()
})
