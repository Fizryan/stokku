import { z } from 'zod'
import { PAGINATION_DEFAULTS } from '../constants.js'

export const MAX_MONEY_AMOUNT = 1_000_000_000_000
export const MAX_STOCK_QTY = 10_000_000

export function trimmedRequiredString(label: string, minLen = 1, maxLen = 120) {
  return z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(minLen, `${label} minimal ${minLen} karakter.`)
    .max(maxLen, `${label} maksimal ${maxLen} karakter.`)
}

export function trimmedNullableString(maxLen = 255) {
  return z
    .string()
    .trim()
    .max(maxLen, `Maksimal ${maxLen} karakter.`)
    .nullable()
    .optional()
    .transform((val) => {
      if (!val || val.length === 0) return null
      return val
    })
}

export function nonNegativeMoneySchema(label: string) {
  return z
    .number({ error: `${label} harus berupa angka bulat.` })
    .int(`${label} harus berupa angka bulat Rupiah.`)
    .min(0, `${label} tidak boleh negatif.`)
    .max(MAX_MONEY_AMOUNT, `${label} melebihi batas maksimum.`)
}

export function nonNegativeQtySchema(label: string) {
  return z
    .number({ error: `${label} harus berupa angka bulat.` })
    .int(`${label} harus berupa angka bulat.`)
    .min(0, `${label} tidak boleh negatif.`)
    .max(MAX_STOCK_QTY, `${label} melebihi batas maksimum.`)
}

export function positiveQtySchema(label: string) {
  return z
    .number({ error: `${label} harus berupa angka bulat.` })
    .int(`${label} harus berupa angka bulat.`)
    .min(1, `${label} minimal 1.`)
    .max(MAX_STOCK_QTY, `${label} melebihi batas maksimum.`)
}

export const optionalQueryText = z
  .string()
  .optional()
  .transform((val) => {
    const trimmed = val?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : undefined
  })

export const optionalIsoDateQuery = z
  .string()
  .optional()
  .transform((val) => {
    const trimmed = val?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : undefined
  })
  .refine((val) => val === undefined || /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Format tanggal harus YYYY-MM-DD.',
  })

export function intQueryParam(defaultValue: number, min: number, max: number) {
  return z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return defaultValue
      const parsed = Number(val)
      return Number.isInteger(parsed) ? parsed : Number.NaN
    })
    .pipe(z.number().int().min(min).max(max))
}

export const optionalPositiveIntQuery = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.trim() === '') return undefined
    const parsed = Number(val)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
  })
  .refine((val) => val === undefined || !Number.isNaN(val), {
    message: 'Parameter ID harus berupa bilangan bulat positif.',
  })

export const booleanQueryFlag = z
  .string()
  .optional()
  .transform((val) => val === 'true' || val === '1')

export const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, 'ID harus berupa angka bulat positif.')
    .transform((val) => Number.parseInt(val, 10)),
})

export const paginationQueryFields = {
  page: intQueryParam(PAGINATION_DEFAULTS.PAGE, 1, 100_000),
  pageSize: intQueryParam(
    PAGINATION_DEFAULTS.PAGE_SIZE,
    1,
    PAGINATION_DEFAULTS.MAX_PAGE_SIZE,
  ),
}
