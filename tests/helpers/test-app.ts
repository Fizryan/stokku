import type { DatabaseSync } from 'node:sqlite'
import type { Hono } from 'hono'
import { createServerApp } from '../../src/server/app.js'
import { loadServerConfig } from '../../src/server/config/env.js'
import { createAppContainer } from '../../src/server/container.js'
import type { HonoAppEnv } from '../../src/server/contracts/services.contract.js'
import type { ApiResponse } from '../../src/shared/types.js'

const BASE_ORIGIN = 'http://localhost:3000'

export class TestHttpClient {
  private readonly app: Hono<HonoAppEnv>
  private cookieHeader: string | null = null

  public constructor(app: Hono<HonoAppEnv>) {
    this.app = app
  }

  public getCookie(): string | null {
    return this.cookieHeader
  }

  private captureSetCookie(res: Response): void {
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie')].filter((v): v is string => Boolean(v))

    for (const raw of setCookies) {
      const pair = raw.split(';')[0]?.trim()
      if (!pair) continue
      const eqIdx = pair.indexOf('=')
      if (eqIdx === -1) continue
      const value = pair.slice(eqIdx + 1)
      if (value === '') {
        this.cookieHeader = null
      } else {
        this.cookieHeader = pair
      }
    }
  }

  public async requestRaw(
    path: string,
    init?: {
      method?: string
      json?: unknown
      headers?: Record<string, string>
    },
  ): Promise<Response> {
    const method = init?.method ?? 'GET'
    const headers: Record<string, string> = {
      Origin: BASE_ORIGIN,
      ...(init?.headers ?? {}),
    }

    if (this.cookieHeader && !headers.Cookie) {
      headers.Cookie = this.cookieHeader
    }

    let body: string | undefined
    if (init?.json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(init.json)
    }

    const res = await this.app.request(`${BASE_ORIGIN}${path}`, {
      method,
      headers,
      body,
    })

    this.captureSetCookie(res)
    return res
  }

  public async requestJson<T>(
    path: string,
    init?: {
      method?: string
      json?: unknown
      headers?: Record<string, string>
    },
  ): Promise<{ status: number; body: ApiResponse<T> }> {
    const res = await this.requestRaw(path, init)
    const parsed = (await res.json()) as ApiResponse<T>
    return { status: res.status, body: parsed }
  }
}

export interface TestHarness {
  readonly app: Hono<HonoAppEnv>
  readonly db: DatabaseSync
  readonly createClient: () => TestHttpClient
  readonly dispose: () => void
}

export function createTestHarness(): TestHarness {
  const config = loadServerConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    DATABASE_PATH: ':memory:',
    SESSION_TTL_HOURS: '24',
    COOKIE_SECURE: 'false',
  })

  const container = createAppContainer(config)
  const app = createServerApp({
    services: container.services,
    config: {
      nodeEnv: config.nodeEnv,
      corsOrigins: config.corsOrigins,
    },
    clientDistDir: './__non_existent_dist_for_tests__',
  })

  return {
    app,
    db: container.db,
    createClient: () => new TestHttpClient(app),
    dispose: () => container.dispose(),
  }
}
