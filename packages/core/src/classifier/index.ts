import type { LogisticCategory } from '../categories.js'
import { TRAINING_FR } from './trainingData.js'
import { tokenize } from './text.js'
import { hasHealthReviewCue, HEALTH_REVIEW_RULE_VERSION } from './healthReviewCue.js'

export { hasHealthReviewCue, HEALTH_REVIEW_RULE_VERSION } from './healthReviewCue.js'
export { TRAINING_FR, EVALUATION_FR } from './trainingData.js'

/**
 * Résultat d'une suggestion. `score` est le score relatif du modèle entre catégories
 * logistiques : ce n'est PAS une probabilité calibrée, ni une donnée médicale.
 */
export interface ObstacleSuggestion {
  modelVersion: string
  ruleVersion: string
  /** null en cas d'abstention */
  suggestedCategory: LogisticCategory | null
  /** catégorie en tête même en cas d'abstention, pour l'analyse d'erreurs (jamais affichée à la bénéficiaire) */
  topCategory: LogisticCategory | null
  abstained: boolean
  abstentionReason: 'TOO_FEW_KNOWN_WORDS' | 'LOW_SCORE' | 'LOW_MARGIN' | 'UNSUPPORTED_LANGUAGE' | null
  score: number | null
  recognizedTokens: number
  /** signal de relecture humaine prioritaire (cf. healthReviewCue.ts) */
  healthReviewCue: boolean
}

/** Interface de remplacement : tout futur modèle doit l'implémenter. */
export interface ObstacleClassifier {
  readonly version: string
  readonly supportedLocales: readonly string[]
  suggest(text: string, locale: string): ObstacleSuggestion
}

interface FittedModel {
  vocabulary: Set<string>
  classes: Record<string, { counts: Record<string, number>; count: number; documents: number }>
  total: number
}

function fit(data: Record<LogisticCategory, string[]>): FittedModel {
  const vocabulary = new Set<string>()
  const classes: FittedModel['classes'] = {}
  let total = 0
  for (const [label, examples] of Object.entries(data)) {
    const counts: Record<string, number> = {}
    let count = 0
    total += examples.length
    for (const example of examples)
      for (const token of tokenize(example)) {
        vocabulary.add(token)
        counts[token] = (counts[token] ?? 0) + 1
        count++
      }
    classes[label] = { counts, count, documents: examples.length }
  }
  return { vocabulary, classes, total }
}

/** Seuils identiques au prototype v0.1 (fiche modèle). */
const MIN_KNOWN_TOKENS = 2
const MIN_TOP_SCORE = 0.62
const MIN_MARGIN = 0.18

/**
 * Baseline expérimentale : Naive Bayes multinomial, français uniquement, 48 phrases
 * synthétiques. Pour toute autre langue (dont le mina), le modèle s'abstient : il ne
 * suppose pas qu'une autre langue puisse être traitée comme du français.
 */
export function createNaiveBayesFr(data: Record<LogisticCategory, string[]> = TRAINING_FR): ObstacleClassifier {
  const model = fit(data)
  const version = 'naive-bayes-fr-0.1'

  return {
    version,
    supportedLocales: ['fr'],
    suggest(text: string, locale: string): ObstacleSuggestion {
      const healthReviewCue = hasHealthReviewCue(text)
      const base = { modelVersion: version, ruleVersion: HEALTH_REVIEW_RULE_VERSION, healthReviewCue }

      if (locale !== 'fr') {
        return {
          ...base, suggestedCategory: null, topCategory: null, abstained: true,
          abstentionReason: 'UNSUPPORTED_LANGUAGE', score: null, recognizedTokens: 0,
        }
      }

      const known = tokenize(text).filter((t) => model.vocabulary.has(t))
      if (known.length < MIN_KNOWN_TOKENS) {
        return {
          ...base, suggestedCategory: null, topCategory: null, abstained: true,
          abstentionReason: 'TOO_FEW_KNOWN_WORDS', score: null, recognizedTokens: known.length,
        }
      }

      const logs = Object.entries(model.classes).map(([label, c]) => ({
        label: label as LogisticCategory,
        log:
          Math.log(c.documents / model.total) +
          known.reduce((sum, t) => sum + Math.log(((c.counts[t] ?? 0) + 1) / (c.count + model.vocabulary.size)), 0),
      }))
      const max = Math.max(...logs.map((s) => s.log))
      const denominator = logs.reduce((a, s) => a + Math.exp(s.log - max), 0)
      const ranked = logs
        .map((s) => ({ label: s.label, score: Math.exp(s.log - max) / denominator }))
        .sort((a, b) => b.score - a.score)
      const [first, second] = ranked as [(typeof ranked)[0], (typeof ranked)[0]]

      const reason = first.score < MIN_TOP_SCORE ? 'LOW_SCORE' : first.score - second.score < MIN_MARGIN ? 'LOW_MARGIN' : null
      return {
        ...base,
        suggestedCategory: reason ? null : first.label,
        topCategory: first.label,
        abstained: reason !== null,
        abstentionReason: reason,
        score: first.score,
        recognizedTokens: known.length,
      }
    },
  }
}

export const defaultClassifier = createNaiveBayesFr()
