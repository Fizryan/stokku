import { z } from 'zod'
import {
  optionalQueryText,
  paginationQueryFields,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

export const createSupplierSchema = z.object({
  name: trimmedRequiredString('Nama supplier / pemasok', 2, 100),
  contactPerson: trimmedNullableString(100),
  phone: trimmedNullableString(30),
  address: trimmedNullableString(255),
  notes: trimmedNullableString(255),
  leadTimeDays: z.number().int().min(1).max(365).default(7),
})

export const updateSupplierSchema = createSupplierSchema
  .omit({ leadTimeDays: true })
  .extend({
    leadTimeDays: z.number().int().min(1).max(365).optional(),
    isActive: z.boolean({ error: 'Status aktif supplier harus berupa boolean.' }),
  })

export const suppliersQuerySchema = z.object({
  search: optionalQueryText,
  status: z.enum(['all', 'active', 'archived']).default('all'),
  ...paginationQueryFields,
})

export type CreateSupplierInput = z.input<typeof createSupplierSchema>
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>
export type SuppliersQueryInput = z.infer<typeof suppliersQuerySchema>
