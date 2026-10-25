import { chromium, expect, test } from '@playwright/test'
import { DEMO, loginBeneficiary } from './helpers.ts'

async function openExplainStep(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Signaler un obstacle' }).click()
  await page.getByRole('button', { name: /Le trajet/ }).click()
  await page.getByRole('button', { name: /Pas de rendez-vous précis/ }).click()
}

test('micro refusé : message clair et retour possible au texte', async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] })
  const page = await context.newPage()
  await page.addInitScript(() => {
    // Simule le refus de l'utilisatrice.
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Refusé', 'NotAllowedError'))
  })
  await loginBeneficiary(page, DEMO.abiba)
  await openExplainStep(page)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/Le micro n’est pas autorisé/)).toBeVisible()
  await page.getByLabel(/Votre message/).fill('Je n’ai pas de moto pour venir.')
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeEnabled()
  await context.close()
})

test('enregistrement avec micro simulé : écoute avant envoi, accord, envoi, suppression', async () => {
  // Micro factice de Chromium : aucun son réel n'est capté.
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 740 }, permissions: ['microphone'] })
  const page = await context.newPage()
  await loginBeneficiary(page, DEMO.abiba)
  await openExplainStep(page)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/Enregistrement…/)).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click()
  await expect(page.getByLabel('Écouter mon message')).toBeVisible()
  // Sans accord « conserver l'audio », rien n'est envoyé.
  await page.getByRole('button', { name: 'Continuer' }).first().click()
  await expect(page.getByText('Cochez l’accord pour joindre votre message vocal.')).toBeVisible()
  await page.getByLabel(/J’accepte que mon message vocal soit conservé/).check()
  await page.getByRole('button', { name: 'Continuer' }).first().click()
  await expect(page.getByText('Message vocal prêt à être joint.')).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer ce message' }).click()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  await browser.close()
})

test('lecture à voix haute : jamais proposée sans voix compatible', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => [] })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Écouter/ })).toHaveCount(0)
  await expect(page.getByText(/Vous avez un rendez-vous/)).toBeVisible() // le texte reste disponible
  await context.close()
})

test('poids et temps de chargement sous réseau limité (objectifs mesurés)', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  // Réseau mobile lent simulé : 400 kbit/s, 400 ms de latence.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 })
  let bytes = 0
  cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => { bytes += e.encodedDataLength })

  const start = Date.now()
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.getByRole('heading', { name: /Une aide pour aller/ })).toBeVisible()
  const ms = Date.now() - start
  test.info().annotations.push({ type: 'mesure', description: `Accueil : ${Math.round(bytes / 1024)} Ko transférés, ${ms} ms (400 kbit/s, 400 ms)` })
  console.log(`MESURE accueil : ${Math.round(bytes / 1024)} Ko transférés, interface visible en ${ms} ms`)
  expect(bytes).toBeLessThan(130 * 1024) // objectif : ≤ 130 Ko transférés au premier chargement
  expect(ms).toBeLessThan(6000) // objectif : interface utilisable en moins de 6 s sur ce réseau
  await context.close()
})
