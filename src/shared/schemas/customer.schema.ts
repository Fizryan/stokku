import { z } from 'zod'
import {
  optionalQueryText,
  paginationQueryFields,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

export const phoneSchema = z
  .string({ error: 'Nomor telepon / WhatsApp wajib diisi.' })
  .trim()
  .min(8, 'Nomor telepon minimal 8 karakter.')
  .max(20, 'Nomor telepon maksimal 20 karakter.')
  .regex(
    /^(\+?[0-9]{8,20})$/,
    'Nomor telepon hanya boleh memuat angka dan tanda plus (+) di awal.',
  )

export const createCustomerSchema = z.object({
  phone: phoneSchema,
  name: trimmedRequiredString('Nama pelanggan', 2, 80),
  email: z
    .string()
    .trim()
    .email('Format alamat email tidak valid.')
    .max(120, 'Maksimal 120 karakter.')
    .nullable()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  address: trimmedNullableString(255),
  notes: trimmedNullableString(255),
})

export const updateCustomerSchema = z.object({
  name: trimmedRequiredString('Nama pelanggan', 2, 80),
  email: z
    .string()
    .trim()
    .email('Format alamat email tidak valid.')
    .max(120, 'Maksimal 120 karakter.')
    .nullable()
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  address: trimmedNullableString(255),
  notes: trimmedNullableString(255),
  isActive: z.boolean({ error: 'Status aktif harus berupa boolean.' }),
})

export const adjustCustomerPointsSchema = z.object({
  points: z
    .number({ error: 'Nominal poin harus berupa angka bulat.' })
    .int('Nominal poin harus berupa bilangan bulat.')
    .refine((val) => val !== 0, 'Nominal poin tidak boleh 0.')
    .refine(
      (val) => val >= -100_000 && val <= 100_000,
      'Batas penyesuaian poin antara -100.000 hingga +100.000 poin.',
    ),
  description: trimmedRequiredString('Alasan penyesuaian poin', 3, 200),
})

export const customersQuerySchema = z.object({
  search: optionalQueryText,
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
  ...paginationQueryFields,
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type AdjustCustomerPointsInput = z.infer<typeof adjustCustomerPointsSchema>
export type CustomersQueryInput = z.infer<typeof customersQuerySchema>
