import { z } from 'zod'
import { ROLES } from '../constants.js'
import { passwordFieldSchema, usernameFieldSchema } from './auth.schema.js'
import { trimmedRequiredString } from './common.schema.js'

export const createUserSchema = z.object({
  username: usernameFieldSchema,
  fullName: trimmedRequiredString('Nama lengkap', 2, 80),
  password: passwordFieldSchema,
  role: z.enum(ROLES, { error: 'Role tidak valid.' }),
})

export const updateUserSchema = z
  .object({
    fullName: trimmedRequiredString('Nama lengkap', 2, 80).optional(),
    role: z.enum(ROLES, { error: 'Role tidak valid.' }).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (val) =>
      val.fullName !== undefined || val.role !== undefined || val.isActive !== undefined,
    { message: 'Minimal satu kolom perubahan harus dikirim.' },
  )

export const resetUserPasswordSchema = z.object({
  newPassword: passwordFieldSchema,
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>
