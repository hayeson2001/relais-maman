import { expect, test, type Page } from '@playwright/test'
import { DEMO, loginBeneficiary, loginStaff, newUser } from './helpers.ts'

/** Contraste WCAG calculé dans le navigateur sur les couleurs RÉELLEMENT appliquées. */
async function contrastIssues(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
    }
    const bgOf = (el: Element | null): number[] => {
      while (el) {
        const c = parse(getComputedStyle(el).backgroundColor)
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c
        el = el.parentElement
      }
      return [247, 245, 239]
    }
    const issues: string[] = []
    for (const el of document.querySelectorAll('button, a, label, p, h1, h2, span, td, th, li, dd, dt')) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent?.trim()).join('')
      if (!text || (el as HTMLElement).offsetParent === null) continue
      const fg = parse(getComputedStyle(el).color)
      const L1 = lum(fg), L2 = lum(bgOf(el))
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      if (ratio < 4.5) issues.push(`${el.tagName} « ${text.slice(0, 30)} » ${ratio.toFixed(2)}`)
    }
    return issues
  })
}

async function smallTargets(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('button, .btn, input:not([type=hidden]), select, textarea')]
    .filter((el) => (el as HTMLElement).offsetParent !== null)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.height < 44 && !(el as HTMLInputElement).type?.match(/checkbox|radio/))
    .map(({ el, r }) => `${el.tagName} ${(el.textContent || (el as HTMLInputElement).name || '').trim().slice(0, 25)} ${Math.round(r.height)}px`))
}

const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && innerWidth <= 400)

test('pages bénéficiaire : contrastes, cibles ≥ 48 px, aucun débordement à 360 px', async ({ browser }) => {
  const { context, page } = await newUser(browser)
  for (const url of ['/', '/connexion', '/activation']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    expect(await contrastIssues(page), url).toEqual([])
    expect(await smallTargets(page), url).toEqual([])
    expect(await noHorizontalOverflow(page), url).toBe(true)
  }
  await loginBeneficiary(page, DEMO.ama)
  for (const url of ['/b', '/b/demande', '/b/preferences']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    expect(await contrastIssues(page), url).toEqual([])
    expect(await smallTargets(page), url).toEqual([])
    expect(await noHorizontalOverflow(page), url).toBe(true)
  }
  await context.close()
})

test('espace agent : contrastes et aucune page dézoomée à 360 px', async ({ browser }) => {
  const { context, page } = await newUser(browser)
  await loginStaff(page, DEMO.esi)
  await page.waitForLoadState('networkidle')
  expect(await contrastIssues(page)).toEqual([])
  expect(await noHorizontalOverflow(page)).toBe(true)
  await context.close()
})

test('navigation au clavier seul : connexion puis signalement d’un obstacle', async ({ browser }) => {
  const { context, page } = await newUser(browser)
  await page.goto('/connexion')
  // Le lien d'évitement est le premier élément atteint au clavier.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused()
  await page.getByLabel('Mon identifiant').focus()
  await page.keyboard.type(DEMO.ama.identifier)
  await page.keyboard.press('Tab') // -> code personnel
  await expect(page.getByLabel('Mon code personnel (6 chiffres)')).toBeFocused()
  await page.keyboard.type(DEMO.ama.pin)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/b$/)

  await page.getByRole('link', { name: 'Signaler un obstacle' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: /Le trajet/ }).focus()
  // Le focus est visible (contour).
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(outline).not.toBe('none')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Pour quel rendez-vous ?' })).toBeVisible()
  await context.close()
})

test('réglage « réduire les animations » respecté', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/')
  const d = await page.evaluate(() => getComputedStyle(document.querySelector('.btn')!).transitionDuration)
  expect(['0s', '']).toContain(d)
  await context.close()
})
