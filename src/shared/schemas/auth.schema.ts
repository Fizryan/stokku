import { z } from 'zod'
import { trimmedRequiredString } from './common.schema.js'

export const usernameFieldSchema = z
  .string({ error: 'Username wajib diisi.' })
  .trim()
  .toLowerCase()
  .min(3, 'Username minimal 3 karakter.')
  .max(32, 'Username maksimal 32 karakter.')
  .regex(
    /^[a-z0-9._-]+$/,
    'Username hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung.',
  )

export const passwordFieldSchema = z
  .string({ error: 'Password wajib diisi.' })
  .min(8, 'Password minimal 8 karakter.')
  .max(128, 'Password maksimal 128 karakter.')

export const initialSetupSchema = z.object({
  fullName: trimmedRequiredString('Nama lengkap', 2, 80),
  username: usernameFieldSchema,
  password: passwordFieldSchema,
})

export const loginSchema = z.object({
  username: z
    .string({ error: 'Username wajib diisi.' })
    .trim()
    .toLowerCase()
    .min(1, 'Username wajib diisi.')
    .max(64),
  password: z
    .string({ error: 'Password wajib diisi.' })
    .min(1, 'Password wajib diisi.')
    .max(128),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Password saat ini wajib diisi.' })
      .min(1, 'Password saat ini wajib diisi.')
      .max(128),
    newPassword: passwordFieldSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'Password baru harus berbeda dari password saat ini.',
  })

export type InitialSetupInput = z.infer<typeof initialSetupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
