import type { DatabaseSync } from 'node:sqlite'
import type {
  CreateUserInput,
  ResetUserPasswordInput,
  UpdateUserInput,
} from '../../shared/schemas/index.js'
import type { UserDTO } from '../../shared/types.js'
import type {
  AuditServiceContract,
  UserServiceContract,
} from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { SessionRepository } from '../repositories/session.repo.js'
import type { UserRepository } from '../repositories/user.repo.js'
import { hashPassword } from '../security/password.js'

export interface UserServiceDeps {
  readonly db: DatabaseSync
  readonly userRepo: UserRepository
  readonly sessionRepo: SessionRepository
  readonly auditService?: AuditServiceContract
}

export class UserService implements UserServiceContract {
  private readonly deps: UserServiceDeps

  public constructor(deps: UserServiceDeps) {
    this.deps = deps
  }

  public listUsers(): readonly UserDTO[] {
    return this.deps.userRepo.listAll()
  }

  public async createUser(input: CreateUserInput, actor?: UserDTO): Promise<UserDTO> {
    const passwordHash = await hashPassword(input.password)
    const nowIso = new Date().toISOString()

    const created = this.deps.userRepo.create({
      username: input.username,
      fullName: input.fullName,
      passwordHash,
      role: input.role,
      nowIso,
    })

    if (actor && this.deps.auditService) {
      this.deps.auditService.log({
        actor,
        actionType: 'USER_ACTIVATED',
        resourceType: 'user',
        resourceId: created.id,
        details: {
          username: created.username,
          fullName: created.fullName,
          role: created.role,
        },
      })
    }

    return created
  }

  public updateUser(
    actor: UserDTO,
    targetUserId: number,
    input: UpdateUserInput,
  ): UserDTO {
    return runInImmediateTransaction(this.deps.db, () => {
      const target = this.deps.userRepo.findById(targetUserId)
      if (!target) {
        throw AppError.notFound('Pengguna tidak ditemukan.')
      }

      const nextFullName = input.fullName ?? target.fullName
      const nextRole = input.role ?? target.role
      const nextIsActive = input.isActive ?? target.isActive

      if (actor.id === target.id && !nextIsActive) {
        throw AppError.badRequest(
          'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.',
        )
      }

      const losingOwnerPrivilege =
        target.role === 'OWNER' &&
        target.isActive &&
        (nextRole !== 'OWNER' || !nextIsActive)

      if (losingOwnerPrivilege && this.deps.userRepo.countActiveOwners() <= 1) {
        throw AppError.badRequest('Sistem wajib memiliki minimal satu akun Owner aktif.')
      }

      const updated = this.deps.userRepo.updateProfile({
        id: target.id,
        fullName: nextFullName,
        role: nextRole,
        isActive: nextIsActive,
        nowIso: new Date().toISOString(),
      })

      if (!updated) {
        throw AppError.notFound('Pengguna tidak ditemukan.')
      }

      if (!nextIsActive || nextRole !== target.role) {
        this.deps.sessionRepo.deleteAllForUser(target.id)
      }

      if (this.deps.auditService) {
        if (nextRole !== target.role) {
          this.deps.auditService.log({
            actor,
            actionType: 'USER_ROLE_CHANGED',
            resourceType: 'user',
            resourceId: target.id,
            details: {
              targetUserId: target.id,
              username: target.username,
              oldRole: target.role,
              newRole: nextRole,
            },
          })
        }

        if (nextIsActive !== target.isActive) {
          this.deps.auditService.log({
            actor,
            actionType: nextIsActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
            resourceType: 'user',
            resourceId: target.id,
            details: {
              targetUserId: target.id,
              username: target.username,
            },
          })
        }
      }

      return updated
    })
  }

  public async resetUserPassword(
    targetUserId: number,
    input: ResetUserPasswordInput,
    actor?: UserDTO,
  ): Promise<void> {
    const target = this.deps.userRepo.findById(targetUserId)
    if (!target) {
      throw AppError.notFound('Pengguna tidak ditemukan.')
    }

    const passwordHash = await hashPassword(input.newPassword)
    const nowIso = new Date().toISOString()

    runInImmediateTransaction(this.deps.db, () => {
      const ok = this.deps.userRepo.updatePassword(targetUserId, passwordHash, nowIso)
      if (!ok) {
        throw AppError.notFound('Pengguna tidak ditemukan.')
      }
      this.deps.sessionRepo.deleteAllForUser(targetUserId)

      if (this.deps.auditService) {
        this.deps.auditService.log({
          actor: actor ?? null,
          actionType: 'PASSWORD_RESET',
          resourceType: 'user',
          resourceId: target.id,
          details: {
            targetUserId: target.id,
            username: target.username,
          },
        })
      }
    })
  }
}
