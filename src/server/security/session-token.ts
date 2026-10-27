import { createHash, randomBytes, randomUUID } from 'node:crypto'

export function generateSessionId(): string {
  return randomUUID()
}

export function generateOpaqueSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}
