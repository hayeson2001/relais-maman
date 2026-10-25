/**
 * Catégories d'obstacles pratiques. Le modèle ne prédit que les quatre catégories
 * logistiques ; « autre besoin / rappel » et « question de santé » relèvent toujours d'une
 * reprise humaine et ne sont jamais produites par le classificateur.
 */
export const LOGISTIC_CATEGORIES = ['TRANSPORT', 'COST', 'AVAILABILITY', 'UNDERSTANDING'] as const
export type LogisticCategory = (typeof LOGISTIC_CATEGORIES)[number]

export const REQUEST_CATEGORIES = [...LOGISTIC_CATEGORIES, 'OTHER_CALLBACK', 'HEALTH_QUESTION'] as const
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number]

/** Origine de la catégorie affichée : jamais confondre un choix explicite et une suggestion. */
export const CATEGORY_SOURCES = ['BENEFICIARY_CHOICE', 'MODEL_SUGGESTION', 'HEALTH_REVIEW_RULE', 'AGENT_DECISION', 'NONE'] as const
export type CategorySource = (typeof CATEGORY_SOURCES)[number]

export const isLogistic = (c: string): c is LogisticCategory =>
  (LOGISTIC_CATEGORIES as readonly string[]).includes(c)
