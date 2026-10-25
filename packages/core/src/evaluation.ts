import { LOGISTIC_CATEGORIES, type LogisticCategory } from './categories.js'
import type { ObstacleClassifier } from './classifier/index.js'

export interface EvaluationReport {
  modelVersion: string
  locale: string
  examples: number
  correct: number
  incorrect: number
  abstentions: number
  /** correct / examples (abstentions comptées comme non correctes) */
  overallAccuracy: number
  /** (examples - abstentions) / examples */
  coverage: number
  perCategory: Record<LogisticCategory, { examples: number; correct: number; incorrect: number; abstentions: number }>
  confusion: Array<{ expected: LogisticCategory; predicted: LogisticCategory; text: string }>
  caveat: string
}

/**
 * Évaluation reproductible : à appeler UNIQUEMENT sur des exemples jamais vus à
 * l'entraînement. Les performances par langue ne sont calculées que si un jeu de test de
 * cette langue existe ; aucun chiffre n'est extrapolé au mina.
 */
export function evaluate(classifier: ObstacleClassifier, examples: Array<[LogisticCategory, string]>, locale: string): EvaluationReport {
  const perCategory = Object.fromEntries(
    LOGISTIC_CATEGORIES.map((c) => [c, { examples: 0, correct: 0, incorrect: 0, abstentions: 0 }]),
  ) as EvaluationReport['perCategory']
  const confusion: EvaluationReport['confusion'] = []
  let correct = 0
  let incorrect = 0
  let abstentions = 0

  for (const [expected, text] of examples) {
    const s = classifier.suggest(text, locale)
    const bucket = perCategory[expected]
    bucket.examples++
    if (s.abstained) {
      abstentions++
      bucket.abstentions++
    } else if (s.suggestedCategory === expected) {
      correct++
      bucket.correct++
    } else {
      incorrect++
      bucket.incorrect++
      if (s.suggestedCategory) confusion.push({ expected, predicted: s.suggestedCategory, text })
    }
  }

  const n = examples.length
  return {
    modelVersion: classifier.version,
    locale,
    examples: n,
    correct,
    incorrect,
    abstentions,
    overallAccuracy: n ? correct / n : 0,
    coverage: n ? (n - abstentions) / n : 0,
    perCategory,
    confusion,
    caveat:
      "Jeu synthétique rédigé par l'auteur des données d'entraînement : ni benchmark indépendant, ni validation médicale, ni mesure sur le mina.",
  }
}
