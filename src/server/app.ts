import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import type { ServerConfig } from './config/env.js'
import type { AppServices, HonoAppEnv } from './contracts/services.contract.js'
import { globalErrorHandler } from './middlewares/error.middleware.js'
import { createApiRoutes } from './routes/index.js'

export interface CreateServerAppOptions {
  readonly services: AppServices
  readonly config: Pick<ServerConfig, 'nodeEnv' | 'corsOrigins'>
  readonly clientDistDir?: string
}

export function createServerApp(options: CreateServerAppOptions): Hono<HonoAppEnv> {
  const app = new Hono<HonoAppEnv>()
  const allowedOrigins = new Set(options.config.corsOrigins)

  app.onError(globalErrorHandler)
  app.use('*', secureHeaders())

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 1024 * 1024,
    }),
  )

  app.use(
    '/api/*',
    csrf({
      origin: (origin, c) => {
        try {
          const requestOrigin = new URL(c.req.url).origin
          if (origin === requestOrigin) {
            return true
          }
        } catch {
          // Fallback to explicit allowed list
        }
        return allowedOrigins.has(origin)
      },
    }),
  )

  app.route('/', createApiRoutes(options.services))

  app.all('/api/*', (c) => {
    return c.json(
      {
        ok: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${c.req.method} ${c.req.path} tidak ditemukan.`,
        },
      },
      404,
    )
  })

  const resolvedClientDir = resolve(options.clientDistDir ?? './dist/client')
  const indexHtmlPath = resolve(resolvedClientDir, 'index.html')

  if (existsSync(indexHtmlPath)) {
    const cachedIndexHtml = readFileSync(indexHtmlPath, 'utf-8')
    const serveSpaIndex = (c: Context<HonoAppEnv>) =>
      c.html(cachedIndexHtml, 200, {
        'Cache-Control': 'no-cache',
      })

    app.get('/', serveSpaIndex)
    app.get('/index.html', serveSpaIndex)

    app.use('/assets/*', async (c, next) => {
      await next()
      if (c.res.status === 200 || c.res.status === 206) {
        c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      }
    })
    app.use('/assets/*', serveStatic({ root: resolvedClientDir }))

    app.use('*', serveStatic({ root: resolvedClientDir }))

    app.get('*', serveSpaIndex)
  }

  return app
}
