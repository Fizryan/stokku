import type { Env, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { validator } from 'hono/validator'
import type { z } from 'zod'
import type { ApiErrorDetail, ApiFailureResponse } from '../../shared/types.js'

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): ApiErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))
}

function createZodValidator<
  TTarget extends 'json' | 'query' | 'param',
  TSchema extends z.ZodType,
>(
  target: TTarget,
  schema: TSchema,
  defaultErrorMessage: string,
  statusCode: ContentfulStatusCode,
) {
  return validator(target, (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      const issues = formatZodIssues(parsed.error.issues)
      const payload: ApiFailureResponse = {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issues[0]?.message ?? defaultErrorMessage,
          issues,
        },
      }
      return c.json(payload, statusCode)
    }
    return parsed.data
  })
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
  return createZodValidator(
    'json',
    schema,
    'Input tidak valid.',
    422,
  ) as unknown as MiddlewareHandler<
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
  return createZodValidator(
    'query',
    schema,
    'Parameter pencarian tidak valid.',
    422,
  ) as unknown as MiddlewareHandler<
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
  return createZodValidator(
    'param',
    schema,
    'Parameter URL tidak valid.',
    400,
  ) as unknown as MiddlewareHandler<
    Env,
    string,
    {
      in: { param: z.input<TSchema> }
      out: { param: z.output<TSchema> }
    }
  >
}
