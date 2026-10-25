import { describe, expect, it } from 'vitest'
import { normalizeActivationCode, normalizeIdentifier } from '../src/pages/public/Login.tsx'

describe('Identifiant bénéficiaire', () => {
  it('accepte l’identifiant tapé tel qu’imprimé, collé, en minuscules ou sans préfixe', () => {
    for (const v of ['RM-AMAK-4M2X', 'rm-amak-4m2x', 'RMAMAK4M2X', 'AMAK-4M2X', ' amak 4m2x ']) {
      expect(normalizeIdentifier(v), v).toBe('RM-AMAK-4M2X')
    }
  })

  it('régression : la saisie lettre par lettre n’est plus abîmée', () => {
    // Simule une frappe caractère par caractère : la valeur n'est pas réécrite entre deux frappes.
    let value = ''
    for (const ch of 'RM-AMAK-4M2X') value = (value + ch).toUpperCase()
    expect(normalizeIdentifier(value)).toBe('RM-AMAK-4M2X')
  })

  it('refuse une saisie incomplète', () => {
    expect(normalizeIdentifier('RM-AMAK')).toBeNull()
    expect(normalizeIdentifier('')).toBeNull()
  })
})

describe('Code d’activation', () => {
  it('accepte avec ou sans tiret, en minuscules', () => {
    expect(normalizeActivationCode('demo-yawa')).toBe('DEMO-YAWA')
    expect(normalizeActivationCode('DEMOYAWA')).toBe('DEMO-YAWA')
    expect(normalizeActivationCode('DEMO')).toBeNull()
  })
})
