import { describe, expect, it } from 'vitest'
import {
  createNaiveBayesFr, defaultClassifier, evaluate, EVALUATION_FR, TRAINING_FR, hasHealthReviewCue,
} from '../src/index.js'

describe('Parité avec le prototype v0.1', () => {
  it('redonne exactement le résultat publié : 14 correctes, 6 abstentions, 0 erreur sur 20', () => {
    const report = evaluate(defaultClassifier, EVALUATION_FR, 'fr')
    expect(report.examples).toBe(20)
    expect(report.correct).toBe(14)
    expect(report.abstentions).toBe(6)
    expect(report.incorrect).toBe(0)
  })

  it('le jeu d\'évaluation ne recoupe pas l\'entraînement', () => {
    const train = new Set(Object.values(TRAINING_FR).flat())
    for (const [, text] of EVALUATION_FR) expect(train.has(text)).toBe(false)
  })
})

describe('Suggestion et abstention', () => {
  it('suggère une catégorie logistique avec un score qui n\'est pas présenté comme une probabilité médicale', () => {
    const s = defaultClassifier.suggest('Je vends au marché le matin et je ne suis pas disponible', 'fr')
    expect(s.suggestedCategory).toBe('AVAILABILITY')
    expect(s.abstained).toBe(false)
    expect(s.modelVersion).toBe('naive-bayes-fr-0.1')
  })

  it('s\'abstient sur un texte sans mots connus', () => {
    const s = defaultClassifier.suggest('xyz abc', 'fr')
    expect(s.abstained).toBe(true)
    expect(s.abstentionReason).toBe('TOO_FEW_KNOWN_WORDS')
    expect(s.suggestedCategory).toBeNull()
  })

  it('s\'abstient pour toute langue non prise en charge, dont le mina, sans la traiter comme du français', () => {
    const s = defaultClassifier.suggest("Je n'ai pas de transport pour venir au centre", 'gej')
    expect(s.abstained).toBe(true)
    expect(s.abstentionReason).toBe('UNSUPPORTED_LANGUAGE')
  })

  it('l\'interface permet de remplacer le modèle (autre jeu d\'entraînement)', () => {
    const tiny = createNaiveBayesFr({
      TRANSPORT: ['taxi moto route trajet'], COST: ['argent frais prix payer'],
      AVAILABILITY: ['marché heure travail matin'], UNDERSTANDING: ['comprendre expliquer papiers documents'],
    })
    expect(tiny.suggest('taxi moto route', 'fr').suggestedCategory).toBe('TRANSPORT')
  })
})

describe('Signal de reprise humaine (santé)', () => {
  it('se déclenche sur des messages de santé', () => {
    for (const t of ['Mon bébé a de la fièvre', 'Je saigne depuis ce matin', 'Le bébé ne bouge plus', "J'ai perdu les eaux"]) {
      expect(hasHealthReviewCue(t)).toBe(true)
    }
  })

  it('se déclenche aussi malgré une négation : relecture humaine préférée à un oubli', () => {
    expect(hasHealthReviewCue("Il n'a pas de fièvre")).toBe(true)
  })

  it('ne se déclenche sur aucune phrase logistique d\'entraînement ou d\'évaluation', () => {
    const phrases = [...Object.values(TRAINING_FR).flat(), ...EVALUATION_FR.map(([, t]) => t)]
    expect(phrases.filter(hasHealthReviewCue)).toEqual([])
  })

  it('n\'est pas un triage : son absence ne signifie rien sur la sécurité (formulation non listée)', () => {
    // Euphémisme non reconnu : le signal est absent, ce qui ne doit JAMAIS être lu comme « sans risque ».
    expect(hasHealthReviewCue('Je ne me sens pas bien du tout')).toBe(false)
  })
})
