import { z } from 'zod'
import { PURCHASE_PAYMENT_STATUSES } from '../constants.js'
import {
  nonNegativeMoneySchema,
  optionalEnumQueryParam,
  optionalIsoDateQuery,
  optionalPositiveIntQuery,
  optionalQueryText,
  paginationQueryFields,
  positiveQtySchema,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

export const purchaseItemInputSchema = z.object({
  productId: z
    .number({ error: 'ID produk tidak valid.' })
    .int('ID produk harus bilangan bulat.')
    .positive('ID produk tidak valid.'),
  qty: positiveQtySchema('Jumlah kuantitas'),
  unitCost: nonNegativeMoneySchema('Harga beli per satuan'),
})

export const nullableIsoDateField = z
  .string()
  .nullable()
  .optional()
  .transform((val) => {
    const trimmed = val?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : null
  })
  .refine((val) => val === null || /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Format tanggal harus YYYY-MM-DD.',
  })

export const createPurchaseSchema = z.object({
  invoiceNumber: trimmedRequiredString('Nomor faktur / surat jalan supplier', 2, 60),
  supplierId: z
    .number({ error: 'ID supplier tidak valid.' })
    .int('ID supplier harus bilangan bulat.')
    .positive('ID supplier tidak valid.'),
  paymentStatus: z.enum(PURCHASE_PAYMENT_STATUSES, {
    error: 'Status pembayaran faktur tidak valid.',
  }),
  dueDate: nullableIsoDateField,
  notes: trimmedNullableString(255),
  items: z
    .array(purchaseItemInputSchema)
    .min(1, 'Faktur pembelian minimal memuat 1 item barang.'),
})

export const updatePurchasePaymentStatusSchema = z.object({
  paymentStatus: z.enum(PURCHASE_PAYMENT_STATUSES, {
    error: 'Status pembayaran tidak valid.',
  }),
  notes: trimmedNullableString(255),
})

export const purchasesQuerySchema = z.object({
  supplierId: optionalPositiveIntQuery,
  paymentStatus: optionalEnumQueryParam(PURCHASE_PAYMENT_STATUSES),
  search: optionalQueryText,
  dateFrom: optionalIsoDateQuery,
  dateTo: optionalIsoDateQuery,
  ...paginationQueryFields,
})

export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>
export type CreatePurchaseInput = z.input<typeof createPurchaseSchema>
export type UpdatePurchasePaymentStatusInput = z.input<
  typeof updatePurchasePaymentStatusSchema
>
export type PurchasesQueryInput = z.infer<typeof purchasesQuerySchema>
