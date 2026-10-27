import { z } from 'zod'
import { MOVEMENT_TYPES } from '../constants.js'
import {
  nonNegativeMoneySchema,
  nonNegativeQtySchema,
  optionalEnumQueryParam,
  optionalIsoDateQuery,
  optionalPositiveIntQuery,
  paginationQueryFields,
  positiveQtySchema,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

const productIdField = z
  .number({ error: 'Produk wajib dipilih.' })
  .int()
  .positive('Produk tidak valid.')

export const recordStockMovementSchema = z.discriminatedUnion('movementType', [
  z.object({
    productId: productIdField,
    movementType: z.literal('IN_PURCHASE'),
    quantity: positiveQtySchema('Jumlah stok masuk'),
    unitCost: nonNegativeMoneySchema('Harga beli satuan').optional(),
    note: trimmedNullableString(240),
  }),
  z.object({
    productId: productIdField,
    movementType: z.literal('OUT_DAMAGED'),
    quantity: positiveQtySchema('Jumlah barang rusak/keluar'),
    note: trimmedRequiredString('Alasan pengurangan stok', 3, 240),
  }),
  z.object({
    productId: productIdField,
    movementType: z.literal('ADJUSTMENT_OPNAME'),
    actualStockQty: nonNegativeQtySchema('Stok fisik aktual'),
    note: trimmedRequiredString('Catatan stok opname', 3, 240),
  }),
])

export const movementQuerySchema = z.object({
  productId: optionalPositiveIntQuery,
  movementType: optionalEnumQueryParam(MOVEMENT_TYPES),
  dateFrom: optionalIsoDateQuery,
  dateTo: optionalIsoDateQuery,
  ...paginationQueryFields,
})

export type RecordStockMovementInput = z.infer<typeof recordStockMovementSchema>
export type MovementQueryInput = z.infer<typeof movementQuerySchema>
