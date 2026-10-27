import { Hono } from 'hono'
import { backupDownloadParamSchema } from '../../shared/schemas/index.js'
import type { AppServices, HonoAppEnv } from '../contracts/services.contract.js'
import {
  createRequireAuthMiddleware,
  requirePermission,
} from '../middlewares/auth.middleware.js'
import { validateParam } from '../middlewares/validator.middleware.js'

export function createBackupRoutes(services: AppServices) {
  const requireAuth = createRequireAuthMiddleware(services)
  const canManageBackup = requirePermission('backup:manage')

  return new Hono<HonoAppEnv>()
    .use('*', requireAuth, canManageBackup)
    .get('/', (c) => {
      const backups = services.backup.listBackups()
      return c.json({ ok: true as const, data: backups }, 200)
    })
    .post('/', (c) => {
      const actor = c.get('currentUser')
      const ipAddress = c.req.header('x-forwarded-for') ?? null
      const userAgent = c.req.header('user-agent') ?? null

      const created = services.backup.createBackup(actor, {
        ipAddress,
        userAgent,
      })
      return c.json({ ok: true as const, data: created }, 201)
    })
    .get('/:fileName', validateParam(backupDownloadParamSchema), (c) => {
      const { fileName } = c.req.valid('param')
      const fileBuffer = services.backup.getBackupFileBuffer(fileName)

      return c.body(fileBuffer.buffer as ArrayBuffer, 200, {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      })
    })
}
