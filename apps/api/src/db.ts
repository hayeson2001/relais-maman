import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'

export type Db = PrismaClient

export function createDb(databaseUrl: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
}

/** Erreur de concurrence : la version attendue ne correspond plus (modification parallèle). */
export class VersionConflictError extends Error {
  constructor() {
    super('Ce dossier a été modifié entre-temps. Rechargez-le avant de continuer.')
  }
}
