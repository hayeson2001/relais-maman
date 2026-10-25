import { expect, test } from '@playwright/test'
import { DEMO, loginBeneficiary, loginStaff, newUser } from './helpers.ts'

const lomeDate = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10)

/**
 * Scénario de référence dans de VRAIS navigateurs, chacun dans son contexte isolé :
 * Ama (maman), Esi (agente, équipe Est), référente du centre A. Écran 360 px.
 */
test('Ama : du premier message au soin vérifié, entre trois comptes', async ({ browser }) => {
  const ama = await newUser(browser)
  const esi = await newUser(browser)
  const ref = await newUser(browser)

  // ── Ama signale qu'elle n'est pas disponible avant 15 h ──
  await loginBeneficiary(ama.page, DEMO.ama)
  await expect(ama.page.getByRole('heading', { name: 'Bonjour Ama K.' })).toBeVisible()
  await expect(ama.page.getByText('Pour Koffi')).toBeVisible()
  await ama.page.getByRole('link', { name: 'Signaler un obstacle' }).click()
  await ama.page.getByRole('button', { name: /L’horaire/ }).click()
  await ama.page.getByRole('button', { name: /Votre suivi après la naissance/ }).click()
  await ama.page.getByLabel(/Votre message/).fill('Je vends au marché, je ne suis pas disponible avant 15 heures.')
  await ama.page.getByRole('button', { name: 'Continuer' }).click()
  // Sans accord, rien ne part.
  await ama.page.getByRole('button', { name: 'Continuer' }).click()
  await expect(ama.page.getByText(/Sans accord, rien n’est envoyé/)).toBeVisible()
  await ama.page.getByLabel(/J’accepte que ma demande soit transmise/).check()
  await ama.page.getByRole('button', { name: 'Continuer' }).click()
  await expect(ama.page.getByText('À envoyer')).toBeVisible()
  await ama.page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(ama.page.getByText('Votre demande est bien arrivée.')).toBeVisible()
  await ama.page.getByRole('link', { name: 'Voir' }).click()
  await expect(ama.page.getByText('Transmis au service').first()).toBeVisible()
  const requestUrl = ama.page.url()

  // ── Esi prend en charge, note l'action, propose 15 h 30 dans 3 jours ──
  await loginStaff(esi.page, DEMO.esi)
  await expect(esi.page.getByRole('heading', { name: 'File des demandes' })).toBeVisible()
  await esi.page.getByRole('link', { name: 'Ama K.' }).click()
  await expect(esi.page.getByText('« Je vends au marché, je ne suis pas disponible avant 15 heures. »')).toBeVisible()
  await esi.page.getByRole('button', { name: 'Prendre en charge' }).click()
  await expect(esi.page.getByText('En cours d’examen').first()).toBeVisible()
  await esi.page.getByRole('textbox', { name: 'Action concrète' }).fill('Proposer l’après-midi, après la vente au marché.')
  await esi.page.getByRole('button', { name: /Enregistrer l.action/ }).click()
  await expect(esi.page.getByText(/Proposer l’après-midi/)).toBeVisible()
  await esi.page.getByLabel('Date et heure (heure de Lomé)').fill(`${lomeDate(3)}T15:30`)
  await esi.page.getByRole('button', { name: 'Proposer un créneau' }).click()
  await expect(esi.page.getByText(/15 h 30 · Centre partenaire A · fictif — Proposé/)).toBeVisible()

  // ── Ama voit le créneau (consultée par un agent) et l'accepte ──
  await ama.page.goto(requestUrl)
  await expect(ama.page.getByText('Consulté par un agent')).toBeVisible()
  await expect(ama.page.getByRole('heading', { name: 'Créneau proposé' })).toBeVisible()
  await expect(ama.page.getByText(/15 h 30/).first()).toBeVisible()
  await ama.page.getByRole('button', { name: /J’accepte ce créneau/ }).click()
  await expect(ama.page.getByText('Votre réponse est enregistrée.')).toBeVisible()

  // ── Esi enregistre l'action convenue ──
  await esi.page.reload()
  await esi.page.getByRole('button', { name: 'Action convenue avec la maman' }).click()
  await expect(esi.page.getByText('Solution convenue').first()).toBeVisible()

  // ── La référente du centre A confirme le créneau, sans voir le message d'Ama ──
  await loginStaff(ref.page, DEMO.refA)
  await expect(ref.page.getByRole('heading', { name: 'Créneaux et soins de mon centre' })).toBeVisible()
  await expect(ref.page.getByText('marché')).toHaveCount(0)
  await ref.page.getByRole('button', { name: 'Confirmer ce créneau' }).click()
  await expect(ref.page.getByText('Confirmé par le centre')).toBeVisible()

  // ── Après le rendez-vous : soin à confirmer, déclaration d'Ama, vérification du centre ──
  await esi.page.reload()
  await esi.page.getByRole('button', { name: /soin à confirmer/ }).click()
  await expect(esi.page.getByText('Soin à confirmer').first()).toBeVisible()

  await ama.page.goto(requestUrl)
  await ama.page.getByRole('button', { name: 'Oui, j’ai reçu le soin' }).click()
  await expect(ama.page.getByText('Merci. Votre déclaration est enregistrée.')).toBeVisible()
  await expect(ama.page.getByText('Vous avez dit avoir reçu le soin').first()).toBeVisible()

  await ref.page.reload()
  await ref.page.getByLabel('Date du soin').fill(lomeDate(0))
  await ref.page.getByLabel('Note').fill('Présente au registre du centre.')
  await ref.page.getByRole('button', { name: 'Confirmer le soin' }).click()
  await expect(ref.page.getByText('Soin vérifié').first()).toBeVisible()

  await ama.page.goto(requestUrl)
  await expect(ama.page.getByText('Soin vérifié (confirmation du centre)')).toBeVisible()

  // ── Persistance serveur : un tout nouveau navigateur retrouve l'état ──
  const amaAgain = await newUser(browser)
  await loginBeneficiary(amaAgain.page, DEMO.ama)
  await expect(amaAgain.page.getByText('Soin vérifié').first()).toBeVisible()

  for (const u of [ama, esi, ref, amaAgain]) await u.context.close()
})
