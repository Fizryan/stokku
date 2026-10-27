import { Hono } from 'hono'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'

export function createHealthRoutes(services: AppServices) {
  return new Hono<HonoAppEnv>().get('/', (c) => {
    const status = services.health.checkHealth()
    return c.json({ ok: true as const, data: status }, 200)
  })
}
