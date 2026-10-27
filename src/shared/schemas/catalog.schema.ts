import { z } from 'zod'
import { PRODUCT_UNITS } from '../constants.js'
import {
  booleanQueryFlag,
  nonNegativeMoneySchema,
  nonNegativeQtySchema,
  optionalPositiveIntQuery,
  optionalQueryText,
  paginationQueryFields,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

export const categoryInputSchema = z.object({
  name: trimmedRequiredString('Nama kategori', 2, 60),
  description: trimmedNullableString(200),
})

const skuFieldSchema = z
  .string({ error: 'SKU wajib diisi.' })
  .trim()
  .toUpperCase()
  .min(2, 'SKU minimal 2 karakter.')
  .max(40, 'SKU maksimal 40 karakter.')
  .regex(
    /^[A-Z0-9._/-]+$/,
    'SKU hanya boleh berisi huruf kapital, angka, titik, garis miring, garis bawah, atau tanda hubung.',
  )

const barcodeFieldSchema = z
  .string()
  .trim()
  .max(64, 'Barcode maksimal 64 karakter.')
  .nullable()
  .optional()
  .transform((val) => {
    if (!val || val.length === 0) return null
    return val
  })
  .refine((val) => val === null || /^[A-Za-z0-9._-]+$/.test(val), {
    message: 'Format barcode tidak valid.',
  })

const unitFieldSchema = z
  .string({ error: 'Satuan produk wajib diisi.' })
  .trim()
  .toLowerCase()
  .min(1, 'Satuan wajib diisi.')
  .max(20, 'Satuan maksimal 20 karakter.')
  .default(PRODUCT_UNITS[0])

const nullableCategoryIdSchema = z
  .number()
  .int()
  .positive()
  .nullable()
  .optional()
  .transform((val) => val ?? null)

export const createProductSchema = z.object({
  sku: skuFieldSchema,
  barcode: barcodeFieldSchema,
  name: trimmedRequiredString('Nama produk', 2, 120),
  categoryId: nullableCategoryIdSchema,
  unit: unitFieldSchema,
  costPrice: nonNegativeMoneySchema('Harga beli (HPP)'),
  sellPrice: nonNegativeMoneySchema('Harga jual'),
  initialStock: nonNegativeQtySchema('Stok awal').default(0),
  minStockQty: nonNegativeQtySchema('Batas minimum stok').default(5),
})

export const updateProductSchema = z.object({
  sku: skuFieldSchema,
  barcode: barcodeFieldSchema,
  name: trimmedRequiredString('Nama produk', 2, 120),
  categoryId: nullableCategoryIdSchema,
  unit: unitFieldSchema,
  costPrice: nonNegativeMoneySchema('Harga beli (HPP)'),
  sellPrice: nonNegativeMoneySchema('Harga jual'),
  minStockQty: nonNegativeQtySchema('Batas minimum stok'),
  isActive: z.boolean(),
})

export const productStatusFilterValues = ['active', 'archived', 'all'] as const

export const productQuerySchema = z.object({
  search: optionalQueryText,
  categoryId: optionalPositiveIntQuery,
  status: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val.trim() : 'active'))
    .pipe(z.enum(productStatusFilterValues)),
  lowStockOnly: booleanQueryFlag,
  ...paginationQueryFields,
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type ProductQueryInput = z.infer<typeof productQuerySchema>
