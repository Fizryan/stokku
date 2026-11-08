import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { loadServerConfig } from '../src/server/config/env.js'
import { runInImmediateTransaction } from '../src/server/db/transaction.js'
import { AppError } from '../src/server/errors/app-error.js'
import {
  buildPaginationMeta,
  escapeSqlLikePattern,
  rethrowUniqueAsConflict,
} from '../src/server/repositories/sqlite-helpers.js'
import { SlidingWindowRateLimiter } from '../src/server/security/rate-limiter.js'
import type { UserDTO } from '../src/shared/types.js'
import { createTestHarness, type TestHarness } from './helpers/test-app.js'

describe('User Management, Security, Infrastructure & Error Robustness', () => {
  let harness: TestHarness | null = null

  afterEach(() => {
    harness?.dispose()
    harness = null
  })

  it('covers user management, password lifecycle, rate limiter, env config, and error handlers', async () => {
    harness = createTestHarness()
    const ownerClient = harness.createClient()

    // 1. Initial setup: Owner
    const setupRes = await ownerClient.requestJson<{ user: UserDTO }>('/api/auth/setup', {
      method: 'POST',
      json: {
        fullName: 'Master Owner',
        username: 'master',
        password: 'password123',
      },
    })
    assert(setupRes.body.ok)
    const ownerId = setupRes.body.data.user.id

    // 2. Create staff user
    const staffRes = await ownerClient.requestJson<UserDTO>('/api/users', {
      method: 'POST',
      json: {
        username: 'staff_budi',
        fullName: 'Budi Staff',
        role: 'WAREHOUSE',
        password: 'password123',
      },
    })
    assert.equal(staffRes.status, 201)
    assert(staffRes.body.ok)
    const staffId = staffRes.body.data.id

    // 3. User queries & update
    const listUsersRes = await ownerClient.requestJson<readonly UserDTO[]>('/api/users')
    assert.equal(listUsersRes.status, 200)
    assert(listUsersRes.body.ok)
    assert(listUsersRes.body.data.length >= 2)

    // Update staff profile
    const updateStaffRes = await ownerClient.requestJson<UserDTO>(
      `/api/users/${staffId}`,
      {
        method: 'PATCH',
        json: {
          fullName: 'Budi Santoso Staff Senior',
          role: 'CASHIER',
        },
      },
    )
    assert.equal(updateStaffRes.status, 200)
    assert(updateStaffRes.body.ok)
    assert.equal(updateStaffRes.body.data.role, 'CASHIER')

    // Update non-existent user
    const updateNotFound = await ownerClient.requestJson<UserDTO>('/api/users/9999', {
      method: 'PATCH',
      json: { fullName: 'Nobody', role: 'CASHIER' },
    })
    assert.equal(updateNotFound.status, 404)

    // 4. Reset staff password
    const resetRes = await ownerClient.requestJson<{ message: string }>(
      `/api/users/${staffId}/reset-password`,
      {
        method: 'POST',
        json: {
          newPassword: 'newpassword123',
        },
      },
    )
    assert.equal(resetRes.status, 200)

    // Reset password on non-existent user
    const resetNotFound = await ownerClient.requestJson(
      '/api/users/9999/reset-password',
      {
        method: 'POST',
        json: { newPassword: 'newpassword123' },
      },
    )
    assert.equal(resetNotFound.status, 404)

    // 5. Change self password with validation errors
    // a. Wrong current password
    const changeWrongOld = await ownerClient.requestJson('/api/auth/change-password', {
      method: 'POST',
      json: {
        currentPassword: 'wrongpassword',
        newPassword: 'newmasterpass123',
      },
    })
    assert.equal(changeWrongOld.status, 400)

    // b. New password same as current password (fails Zod refinement)
    const changeSamePass = await ownerClient.requestJson('/api/auth/change-password', {
      method: 'POST',
      json: {
        currentPassword: 'password123',
        newPassword: 'password123',
      },
    })
    assert.equal(changeSamePass.status, 422)

    // c. Successful password change
    const changeSuccess = await ownerClient.requestJson('/api/auth/change-password', {
      method: 'POST',
      json: {
        currentPassword: 'password123',
        newPassword: 'brandnewpassword123',
      },
    })
    assert.equal(changeSuccess.status, 200)

    // 6. Toggle active status via PATCH
    // a. Prevent self deactivation
    const selfDeactivateFail = await ownerClient.requestJson(`/api/users/${ownerId}`, {
      method: 'PATCH',
      json: { isActive: false },
    })
    assert.equal(selfDeactivateFail.status, 400)

    // b. Deactivate staff
    const staffDeactivate = await ownerClient.requestJson<UserDTO>(
      `/api/users/${staffId}`,
      {
        method: 'PATCH',
        json: { isActive: false },
      },
    )
    assert.equal(staffDeactivate.status, 200)
    assert(staffDeactivate.body.ok)
    assert.equal(staffDeactivate.body.data.isActive, false)

    // 7. Error Middleware & Malformed JSON testing
    const malformedJsonRes = await ownerClient.requestRaw('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    assert.equal(malformedJsonRes.status, 400)

    // 8. Rate Limiter Unit Coverage
    const rateLimiter = new SlidingWindowRateLimiter({
      windowMs: 50,
      maxFailures: 2,
      blockDurationMs: 100,
    })
    rateLimiter.assertAllowed('key1')
    rateLimiter.recordFailure('key1')
    rateLimiter.assertAllowed('key1')
    rateLimiter.recordFailure('key1') // reached max failures
    assert.throws(
      () => {
        rateLimiter.assertAllowed('key1')
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 429,
    )
    rateLimiter.reset('key1')
    rateLimiter.assertAllowed('key1')
    rateLimiter.pruneStaleBuckets(Date.now() + 1000)
    rateLimiter.dispose()

    // 9. Server Config Environment Validation
    const testConfig = loadServerConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      SESSION_TTL_HOURS: '48',
      COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://example.com,https://app.example.com',
    })
    assert.equal(testConfig.port, 8080)
    assert.equal(testConfig.sessionTtlMs, 48 * 60 * 60 * 1000)
    assert.equal(testConfig.cookieSecure, 'true')
    assert.equal(testConfig.corsOrigins.length, 2)

    // Fallback defaults on empty env
    const fallbackConfig = loadServerConfig({})
    assert.equal(fallbackConfig.port, 3000)
    assert.equal(fallbackConfig.sessionTtlMs, 24 * 60 * 60 * 1000)

    // Rejects invalid non-numeric port
    assert.throws(() => {
      loadServerConfig({ PORT: 'not-a-number' })
    })

    // 10. AppError Constructors
    const errBadReq = AppError.badRequest('Bad request')
    const errUnauth = AppError.unauthorized('Unauthorized')
    const errForbid = AppError.forbidden('Forbidden')
    const errNotFnd = AppError.notFound('Not found')
    const errConf = AppError.conflict('Conflict')
    const errVal = AppError.validation('Validation failed')
    const errRate = AppError.rateLimited('Too many requests')
    const errStock = AppError.insufficientStock('Stok habis')
    const errInternal = new AppError('INTERNAL_ERROR', 500, 'Internal server error')
    assert.equal(errBadReq.statusCode, 400)
    assert.equal(errUnauth.statusCode, 401)
    assert.equal(errForbid.statusCode, 403)
    assert.equal(errNotFnd.statusCode, 404)
    assert.equal(errConf.statusCode, 409)
    assert.equal(errStock.statusCode, 409)
    assert.equal(errVal.statusCode, 422)
    assert.equal(errRate.statusCode, 429)
    assert.equal(errInternal.statusCode, 500)
    assert.equal(errForbid.statusCode, 403)
    assert.equal(errNotFnd.statusCode, 404)
    assert.equal(errConf.statusCode, 409)
    assert.equal(errVal.statusCode, 422)
    assert.equal(errInternal.statusCode, 500)

    // 11. Sqlite Helpers
    assert.equal(escapeSqlLikePattern('100% discount_deal'), '100\\% discount\\_deal')
    const pageMeta = buildPaginationMeta(1, 10, 0)
    assert.equal(pageMeta.totalPages, 1)

    // RethrowUniqueAsConflict on non-unique error
    assert.throws(
      () => {
        rethrowUniqueAsConflict(new Error('Generic database error'), 'Fallback conflict')
      },
      { message: 'Generic database error' },
    )

    // 12. Transaction Rollback & Error Propagations
    assert(harness)
    const testDb = harness.db
    assert.throws(
      () => {
        runInImmediateTransaction(testDb, () => {
          throw new Error('Forced transaction rollback error')
        })
      },
      { message: 'Forced transaction rollback error' },
    )
  })
})
