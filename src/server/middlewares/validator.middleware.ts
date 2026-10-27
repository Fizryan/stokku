import type { Env, MiddlewareHandler } from 'hono'
import { validator } from 'hono/validator'
import type { z } from 'zod'
import type { ApiErrorDetail, ApiFailureResponse } from '../../shared/types.js'

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): ApiErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))
}

export function validateJson<TSchema extends z.ZodType>(
  schema: TSchema,
): MiddlewareHandler<
  Env,
  string,
  {
    in: { json: z.input<TSchema> }
    out: { json: z.output<TSchema> }
  }
> {
  return validator('json', (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      const issues = formatZodIssues(parsed.error.issues)
      const payload: ApiFailureResponse = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issues[0]?.message ?? 'Input tidak valid.',
          issues,
        },
      }
      return c.json(payload, 422)
    }
    return parsed.data
  }) as unknown as MiddlewareHandler<
    Env,
    string,
    {
      in: { json: z.input<TSchema> }
      out: { json: z.output<TSchema> }
    }
  >
}

export function validateQuery<TSchema extends z.ZodType>(
  schema: TSchema,
): MiddlewareHandler<
  Env,
  string,
  {
    in: { query: z.input<TSchema> }
    out: { query: z.output<TSchema> }
  }
> {
  return validator('query', (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      const issues = formatZodIssues(parsed.error.issues)
      const payload: ApiFailureResponse = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issues[0]?.message ?? 'Parameter pencarian tidak valid.',
          issues,
        },
      }
      return c.json(payload, 422)
    }
    return parsed.data
  }) as unknown as MiddlewareHandler<
    Env,
    string,
    {
      in: { query: z.input<TSchema> }
      out: { query: z.output<TSchema> }
    }
  >
}

export function validateParam<TSchema extends z.ZodType>(
  schema: TSchema,
): MiddlewareHandler<
  Env,
  string,
  {
    in: { param: z.input<TSchema> }
    out: { param: z.output<TSchema> }
  }
> {
  return validator('param', (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      const issues = formatZodIssues(parsed.error.issues)
      const payload: ApiFailureResponse = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issues[0]?.message ?? 'Parameter URL tidak valid.',
          issues,
        },
      }
      return c.json(payload, 400)
    }
    return parsed.data
  }) as unknown as MiddlewareHandler<
    Env,
    string,
    {
      in: { param: z.input<TSchema> }
      out: { param: z.output<TSchema> }
    }
  >
}
