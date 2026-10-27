import { z } from 'zod'
import { AUDIT_ACTION_TYPES, PAGINATION_DEFAULTS } from '../constants.js'

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_DEFAULTS.MAX_PAGE_SIZE)
    .default(PAGINATION_DEFAULTS.PAGE_SIZE),
  actionType: z.enum(AUDIT_ACTION_TYPES).optional(),
  actorUserId: z.coerce.number().int().positive().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal awal harus YYYY-MM-DD.')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal akhir harus YYYY-MM-DD.')
    .optional(),
})

export type AuditLogsQueryInput = z.infer<typeof auditLogsQuerySchema>

export const backupDownloadParamSchema = z.object({
  fileName: z
    .string()
    .trim()
    .regex(
      /^stokku-backup-[a-zA-Z0-9_\-.]+\.sqlite$/,
      'Nama file backup tidak valid atau mengandung karakter terlarang.',
    ),
})

export type BackupDownloadParam = z.infer<typeof backupDownloadParamSchema>
