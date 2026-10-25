import { describe, expect, it } from 'vitest'
import { checkTransition, isOpen, SERVER_STATES, TRANSITIONS, type ServerState } from '../src/index.js'

describe('Machine à états des demandes', () => {
  it('parcours nominal jusqu\'au soin vérifié', () => {
    let s: ServerState = 'RECEIVED'
    const step = (action: keyof typeof TRANSITIONS, actor: 'AGENT' | 'BENEFICIARY' | 'FACILITY_REFERENT' | 'SYSTEM') => {
      const r = checkTransition(s, action, actor)
      expect(r.ok).toBe(true)
      if (r.ok) s = r.to
    }
    step('START_REVIEW', 'AGENT')
    step('AGREE_ACTION', 'AGENT')
    step('MARK_AWAITING_COMPLETION', 'SYSTEM')
    step('DECLARE_CARE', 'BENEFICIARY')
    step('VERIFY_CARE', 'FACILITY_REFERENT')
    expect(s).toBe('CARE_VERIFIED')
  })

  it('une bénéficiaire ne peut pas vérifier son propre soin (déclaration ≠ vérification)', () => {
    expect(checkTransition('CARE_DECLARED', 'VERIFY_CARE', 'BENEFICIARY')).toEqual({ ok: false, reason: 'FORBIDDEN_ROLE' })
  })

  it('une structure ne peut pas organiser l\'action à la place de l\'agent', () => {
    expect(checkTransition('UNDER_REVIEW', 'AGREE_ACTION', 'FACILITY_REFERENT').ok).toBe(false)
  })

  it('l\'administrateur n\'intervient pas dans le suivi individuel', () => {
    for (const action of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      expect(checkTransition('RECEIVED', action, 'ADMIN').ok).toBe(false)
    }
  })

  it('on ne saute pas d\'étape : pas de soin déclaré directement depuis « demande reçue »', () => {
    expect(checkTransition('RECEIVED', 'DECLARE_CARE', 'BENEFICIARY')).toEqual({ ok: false, reason: 'INVALID_FROM_STATE' })
    expect(checkTransition('RECEIVED', 'VERIFY_CARE', 'AGENT')).toEqual({ ok: false, reason: 'INVALID_FROM_STATE' })
  })

  it('une demande clôturée ne peut plus être modifiée', () => {
    for (const action of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
      expect(checkTransition('CLOSED_WITHOUT_CARE', action, 'AGENT').ok).toBe(false)
    }
  })

  it('une correction de vérification garde l\'état et une annulation revient à « réalisation à confirmer »', () => {
    expect(checkTransition('CARE_VERIFIED', 'CORRECT_VERIFICATION', 'AGENT')).toEqual({ ok: true, to: 'CARE_VERIFIED' })
    expect(checkTransition('CARE_VERIFIED', 'REVOKE_VERIFICATION', 'FACILITY_REFERENT')).toEqual({ ok: true, to: 'AWAITING_COMPLETION' })
  })

  it('le worker (SYSTEM) ne fait que la bascule chronologique et la clôture après retrait d\'accord', () => {
    const allowed = (Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>).filter((a) =>
      TRANSITIONS[a].actors.includes('SYSTEM'),
    )
    expect(allowed).toEqual(['MARK_AWAITING_COMPLETION', 'CLOSE_WITHOUT_CARE'])
  })

  it('états ouverts et fermés', () => {
    expect(SERVER_STATES.filter((s) => !isOpen(s))).toEqual(['CARE_VERIFIED', 'CLOSED_WITHOUT_CARE'])
  })
})
