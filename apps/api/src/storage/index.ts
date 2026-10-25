import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { AppConfig } from '../config.ts'
import { randomToken } from '../auth/secrets.ts'

/**
 * Stockage PRIVÉ des enregistrements audio. Aucun fichier n'est jamais servi statiquement :
 * l'accès passe par une URL temporaire signée délivrée après contrôle des droits.
 */
export interface AudioStorage {
  readonly driver: string
  put(data: Buffer, mimeType: string): Promise<string>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
}

export function createLocalStorage(dir: string): AudioStorage {
  const root = resolve(dir)
  const pathFor = (key: string) => {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(key)) throw new Error('Clé de stockage invalide')
    return join(root, key)
  }
  return {
    driver: 'local',
    async put(data) {
      await mkdir(root, { recursive: true, mode: 0o700 })
      const key = randomToken(24)
      await writeFile(pathFor(key), data, { mode: 0o600 })
      return key
    },
    get: (key) => readFile(pathFor(key)),
    async delete(key) {
      await rm(pathFor(key), { force: true })
    },
  }
}

export function createS3Storage(config: AppConfig): AudioStorage {
  if (!config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
    throw new Error('STORAGE_DRIVER=s3 exige S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY.')
  }
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
  })
  const Bucket = config.S3_BUCKET
  return {
    driver: 's3',
    async put(data, mimeType) {
      const key = randomToken(24)
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: mimeType }))
      return key
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }))
      return Buffer.from(await res.Body!.transformToByteArray())
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },
  }
}

export const createStorage = (config: AppConfig): AudioStorage =>
  config.STORAGE_DRIVER === 's3' ? createS3Storage(config) : createLocalStorage(config.STORAGE_LOCAL_DIR)

/**
 * Vérification du type RÉEL d'un fichier audio par ses premiers octets (pas l'extension ni
 * l'en-tête Content-Type déclaré par le navigateur, qui sont falsifiables).
 */
export function detectAudioType(buf: Buffer): 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/wav' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'audio/webm'
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg'
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4'
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav'
  return null
}
