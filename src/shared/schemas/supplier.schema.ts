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
})

export const updateSupplierSchema = createSupplierSchema.extend({
  isActive: z.boolean({ error: 'Status aktif supplier harus berupa boolean.' }),
})

export const suppliersQuerySchema = z.object({
  search: optionalQueryText,
  status: z.enum(['all', 'active', 'archived']).default('all'),
  ...paginationQueryFields,
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
export type SuppliersQueryInput = z.infer<typeof suppliersQuerySchema>
