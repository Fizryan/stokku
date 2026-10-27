import { z } from 'zod'
import { PAYMENT_METHODS, SALE_STATUSES } from '../constants.js'
import {
  intQueryParam,
  nonNegativeMoneySchema,
  optionalEnumQueryParam,
  optionalIsoDateQuery,
  optionalQueryText,
  paginationQueryFields,
  positiveQtySchema,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

export const checkoutItemSchema = z.object({
  productId: z.number({ error: 'ID produk tidak valid.' }).int().positive(),
  qty: positiveQtySchema('Jumlah beli'),
})

export const checkoutSaleSchema = z.object({
  items: z
    .array(checkoutItemSchema)
    .min(1, 'Keranjang belanja tidak boleh kosong.')
    .max(200, 'Maksimal 200 baris item per transaksi.'),
  discountAmount: nonNegativeMoneySchema('Diskon').default(0),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: 'Metode pembayaran tidak valid.',
  }),
  paidAmount: nonNegativeMoneySchema('Jumlah bayar'),
  customerId: z
    .number({ error: 'ID pelanggan tidak valid.' })
    .int()
    .positive()
    .nullable()
    .optional()
    .default(null),
  customerName: trimmedNullableString(80),
  pointsRedeemed: z
    .number({ error: 'Poin yang ditukarkan harus berupa angka bulat.' })
    .int('Poin harus berupa bilangan bulat.')
    .min(0, 'Poin tidak boleh negatif.')
    .max(1_000_000, 'Poin melebihi batas maksimum penukaran.')
    .default(0),
})

export const voidSaleSchema = z.object({
  reason: trimmedRequiredString('Alasan pembatalan transaksi', 5, 240),
})

export const salesFilterBaseFields = {
  search: optionalQueryText,
  status: optionalEnumQueryParam(SALE_STATUSES),
  paymentMethod: optionalEnumQueryParam(PAYMENT_METHODS),
  dateFrom: optionalIsoDateQuery,
  dateTo: optionalIsoDateQuery,
}

export const salesQuerySchema = z.object({
  ...salesFilterBaseFields,
  ...paginationQueryFields,
})

export const salesExportQuerySchema = z.object({
  ...salesFilterBaseFields,
})

export const dashboardQuerySchema = z.object({
  days: intQueryParam(14, 7, 90),
})

export type CheckoutSaleInput = z.infer<typeof checkoutSaleSchema>
export type VoidSaleInput = z.infer<typeof voidSaleSchema>
export type SalesQueryInput = z.infer<typeof salesQuerySchema>
export type SalesExportQueryInput = z.infer<typeof salesExportQuerySchema>
export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>
