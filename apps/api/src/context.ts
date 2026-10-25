import { defaultClassifier, type ObstacleClassifier } from '@relais-maman/core'
import type { AppConfig } from './config.ts'
import type { Db } from './db.ts'
import type { AudioStorage } from './storage/index.ts'

/** Dépendances injectées : remplaçables en test (horloge, classificateur, stockage). */
export interface AppContext {
  db: Db
  config: AppConfig
  classifier: ObstacleClassifier
  storage: AudioStorage
  now: () => Date
  timeZone: string
}

export function createContext(parts: Omit<AppContext, 'classifier' | 'now' | 'timeZone'> & Partial<AppContext>): AppContext {
  return {
    classifier: defaultClassifier,
    now: () => new Date(),
    timeZone: 'Africa/Lome',
    ...parts,
  }
}
