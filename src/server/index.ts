import { serve } from '@hono/node-server'
import { createServerApp } from './app.js'
import { loadServerConfig } from './config/env.js'
import { createAppContainer } from './container.js'

const config = loadServerConfig()
const container = createAppContainer(config)
const app = createServerApp({
  services: container.services,
  config,
})

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(
      `[Stokku] Server berjalan pada http://${info.address}:${info.port} (${config.nodeEnv})`,
    )
  },
)

let shuttingDown = false
function handleGracefulShutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[Stokku] Menerima sinyal ${signal}, menutup koneksi dengan aman...`)

  const forceExitTimer = setTimeout(() => {
    container.dispose()
    process.exit(1)
  }, 8000)
  forceExitTimer.unref()

  server.close(() => {
    container.dispose()
    console.log('[Stokku] Server dan database SQLite berhasil ditutup.')
    process.exit(0)
  })
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'))
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'))
