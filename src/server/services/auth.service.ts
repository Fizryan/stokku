import type { DatabaseSync } from 'node:sqlite'
import type {
  ChangePasswordInput,
  InitialSetupInput,
  LoginInput,
} from '../../shared/schemas/index.js'
import type { AuthSessionDTO } from '../../shared/types.js'
import type {
  AuthenticatedLoginResult,
  AuthServiceContract,
  SessionClientMetadata,
  ValidatedSessionContext,
} from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { SessionRepository } from '../repositories/session.repo.js'
import { toUserDTO, type UserRepository } from '../repositories/user.repo.js'
import { hashPassword, verifyPassword } from '../security/password.js'
import type { SlidingWindowRateLimiter } from '../security/rate-limiter.js'
import {
  generateOpaqueSessionToken,
  generateSessionId,
  hashSessionToken,
} from '../security/session-token.js'

export interface AuthServiceDeps {
  readonly db: DatabaseSync
  readonly userRepo: UserRepository
  readonly sessionRepo: SessionRepository
  readonly loginRateLimiter: SlidingWindowRateLimiter
  readonly sessionTtlMs: number
}

export class AuthService implements AuthServiceContract {
  private readonly deps: AuthServiceDeps
  private dummyPasswordHashPromise: Promise<string> | null = null

  public constructor(deps: AuthServiceDeps) {
    this.deps = deps
  }

  private getDummyPasswordHash(): Promise<string> {
    if (!this.dummyPasswordHashPromise) {
      this.dummyPasswordHashPromise = hashPassword('stokku-constant-time-dummy-secret')
    }
    return this.dummyPasswordHashPromise
  }

  private issueNewSession(
    userId: number,
    meta: SessionClientMetadata,
    now: Date,
  ): { rawSessionToken: string; expiresAt: Date } {
    const rawSessionToken = generateOpaqueSessionToken()
    const tokenHash = hashSessionToken(rawSessionToken)
    const expiresAt = new Date(now.getTime() + this.deps.sessionTtlMs)

    this.deps.sessionRepo.create({
      id: generateSessionId(),
      tokenHash,
      userId,
      expiresAtIso: expiresAt.toISOString(),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      nowIso: now.toISOString(),
    })

    return { rawSessionToken, expiresAt }
  }

  public getSessionStatus(rawSessionToken: string | undefined): AuthSessionDTO {
    const needsInitialSetup = this.deps.userRepo.countAll() === 0
    if (needsInitialSetup || !rawSessionToken) {
      return {
        needsInitialSetup,
        user: null,
      }
    }

    const validated = this.validateSessionToken(rawSessionToken)
    return {
      needsInitialSetup: false,
      user: validated?.user ?? null,
    }
  }

  public validateSessionToken(rawSessionToken: string): ValidatedSessionContext | null {
    if (!rawSessionToken || rawSessionToken.length < 16) {
      return null
    }

    const now = new Date()
    const tokenHash = hashSessionToken(rawSessionToken)
    const active = this.deps.sessionRepo.findActiveByTokenHash(
      tokenHash,
      now.toISOString(),
    )
    if (!active) {
      return null
    }

    const expiresAtMs = new Date(active.expiresAt).getTime()
    const remainingMs = expiresAtMs - now.getTime()
    let refreshedExpiresAt: Date | null = null

    if (remainingMs < this.deps.sessionTtlMs * 0.5) {
      refreshedExpiresAt = new Date(now.getTime() + this.deps.sessionTtlMs)
      this.deps.sessionRepo.extendExpiry(
        active.sessionId,
        refreshedExpiresAt.toISOString(),
      )
    }

    return {
      sessionId: active.sessionId,
      user: active.user,
      refreshedExpiresAt,
    }
  }

  public async initializeFirstOwner(
    input: InitialSetupInput,
    meta: SessionClientMetadata,
  ): Promise<AuthenticatedLoginResult> {
    if (this.deps.userRepo.countAll() > 0) {
      throw new AppError(
        'SETUP_ALREADY_COMPLETED',
        403,
        'Inisialisasi awal sudah pernah dilakukan. Silakan masuk menggunakan akun terdaftar.',
      )
    }

    const passwordHash = await hashPassword(input.password)
    const now = new Date()

    return runInImmediateTransaction(this.deps.db, () => {
      if (this.deps.userRepo.countAll() > 0) {
        throw new AppError(
          'SETUP_ALREADY_COMPLETED',
          403,
          'Inisialisasi awal sudah pernah dilakukan.',
        )
      }

      const owner = this.deps.userRepo.create({
        username: input.username,
        fullName: input.fullName,
        passwordHash,
        role: 'OWNER',
        nowIso: now.toISOString(),
      })

      const session = this.issueNewSession(owner.id, meta, now)
      return {
        user: owner,
        rawSessionToken: session.rawSessionToken,
        expiresAt: session.expiresAt,
      }
    })
  }

  public async login(
    input: LoginInput,
    meta: SessionClientMetadata,
  ): Promise<AuthenticatedLoginResult> {
    if (this.deps.userRepo.countAll() === 0) {
      throw new AppError(
        'SETUP_REQUIRED',
        409,
        'Toko belum diinisialisasi. Silakan buat akun Owner terlebih dahulu.',
      )
    }

    const rateKey = `${meta.ipAddress ?? 'local'}:${input.username}`
    this.deps.loginRateLimiter.assertAllowed(rateKey)

    const record = this.deps.userRepo.findByUsername(input.username)
    if (!record?.isActive) {
      const dummyHash = await this.getDummyPasswordHash()
      await verifyPassword(input.password, dummyHash)
      this.deps.loginRateLimiter.recordFailure(rateKey)
      throw AppError.unauthorized('Username atau password tidak sesuai.')
    }

    const passwordMatches = await verifyPassword(input.password, record.passwordHash)
    if (!passwordMatches) {
      this.deps.loginRateLimiter.recordFailure(rateKey)
      throw AppError.unauthorized('Username atau password tidak sesuai.')
    }

    this.deps.loginRateLimiter.reset(rateKey)
    const now = new Date()
    const session = this.issueNewSession(record.id, meta, now)

    return {
      user: toUserDTO(record),
      rawSessionToken: session.rawSessionToken,
      expiresAt: session.expiresAt,
    }
  }

  public logout(rawSessionToken: string | undefined): void {
    if (!rawSessionToken) return
    const tokenHash = hashSessionToken(rawSessionToken)
    this.deps.sessionRepo.deleteByTokenHash(tokenHash)
  }

  public async changeOwnPassword(
    actor: { readonly id: number },
    currentSessionId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const record = this.deps.userRepo.findById(actor.id)
    if (!record?.isActive) {
      throw AppError.unauthorized()
    }

    const currentMatches = await verifyPassword(
      input.currentPassword,
      record.passwordHash,
    )
    if (!currentMatches) {
      throw AppError.badRequest('Password saat ini tidak sesuai.')
    }

    const newHash = await hashPassword(input.newPassword)
    const nowIso = new Date().toISOString()

    runInImmediateTransaction(this.deps.db, () => {
      this.deps.userRepo.updatePassword(actor.id, newHash, nowIso)
      this.deps.sessionRepo.deleteAllExceptSession(actor.id, currentSessionId)
    })
  }
}
