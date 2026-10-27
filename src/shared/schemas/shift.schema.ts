import { z } from 'zod'
import { SHIFT_MOVEMENT_TYPES, SHIFT_STATUSES } from '../constants.js'
import {
  MAX_MONEY_AMOUNT,
  nonNegativeMoneySchema,
  optionalEnumQueryParam,
  optionalIsoDateQuery,
  optionalPositiveIntQuery,
  paginationQueryFields,
  trimmedNullableString,
  trimmedRequiredString,
} from './common.schema.js'

export const openShiftSchema = z.object({
  openingCash: nonNegativeMoneySchema('Modal awal kas').default(0),
  notes: trimmedNullableString(240),
})

export const recordCashMovementSchema = z.object({
  movementType: z.enum(SHIFT_MOVEMENT_TYPES, {
    error: 'Tipe mutasi kas laci tidak valid.',
  }),
  amount: z
    .number({ error: 'Nominal kas harus berupa angka bulat.' })
    .int('Nominal kas harus berupa angka bulat Rupiah.')
    .min(1, 'Nominal kas minimal Rp 1.')
    .max(MAX_MONEY_AMOUNT, 'Nominal kas melebihi batas maksimum.'),
  reason: trimmedRequiredString('Alasan pergerakan kas', 3, 240),
})

export const closeShiftSchema = z.object({
  actualCash: nonNegativeMoneySchema('Kas fisik aktual di laci'),
  notes: trimmedNullableString(240),
})

export const shiftsQuerySchema = z.object({
  cashierUserId: optionalPositiveIntQuery,
  status: optionalEnumQueryParam(SHIFT_STATUSES),
  dateFrom: optionalIsoDateQuery,
  dateTo: optionalIsoDateQuery,
  ...paginationQueryFields,
})

export type OpenShiftInput = z.infer<typeof openShiftSchema>
export type RecordCashMovementInput = z.infer<typeof recordCashMovementSchema>
export type CloseShiftInput = z.infer<typeof closeShiftSchema>
export type ShiftsQueryInput = z.infer<typeof shiftsQuerySchema>
