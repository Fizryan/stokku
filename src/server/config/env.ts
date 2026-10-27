import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 3000))
    .pipe(z.number().int().min(1).max(65535)),
  DATABASE_PATH: z.string().trim().min(1).default('./data/stokku.sqlite'),
  SESSION_TTL_HOURS: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 24))
    .pipe(z.number().int().min(1).max(720)),
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0)
        : [],
    ),
})

export interface ServerConfig {
  readonly nodeEnv: 'development' | 'test' | 'production'
  readonly host: string
  readonly port: number
  readonly databasePath: string
  readonly sessionTtlMs: number
  readonly cookieSecure: 'auto' | 'true' | 'false'
  readonly corsOrigins: readonly string[]
}

export function loadServerConfig(rawEnv: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.parse(rawEnv)
  const resolvedDbPath =
    parsed.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(parsed.DATABASE_PATH)

  if (resolvedDbPath !== ':memory:') {
    mkdirSync(dirname(resolvedDbPath), { recursive: true })
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: resolvedDbPath,
    sessionTtlMs: parsed.SESSION_TTL_HOURS * 60 * 60 * 1000,
    cookieSecure: parsed.COOKIE_SECURE,
    corsOrigins: parsed.CORS_ORIGINS,
  }
}
