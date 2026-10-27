import type { DatabaseSync } from 'node:sqlite'
import type {
  CreateUserInput,
  ResetUserPasswordInput,
  UpdateUserInput,
} from '../../shared/schemas/index.js'
import type { UserDTO } from '../../shared/types.js'
import type { UserServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { SessionRepository } from '../repositories/session.repo.js'
import type { UserRepository } from '../repositories/user.repo.js'
import { hashPassword } from '../security/password.js'

export interface UserServiceDeps {
  readonly db: DatabaseSync
  readonly userRepo: UserRepository
  readonly sessionRepo: SessionRepository
}

export class UserService implements UserServiceContract {
  private readonly deps: UserServiceDeps

  public constructor(deps: UserServiceDeps) {
    this.deps = deps
  }

  public listUsers(): readonly UserDTO[] {
    return this.deps.userRepo.listAll()
  }

  public async createUser(input: CreateUserInput): Promise<UserDTO> {
    const passwordHash = await hashPassword(input.password)
    const nowIso = new Date().toISOString()

    return this.deps.userRepo.create({
      username: input.username,
      fullName: input.fullName,
      passwordHash,
      role: input.role,
      nowIso,
    })
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

      return updated
    })
  }

  public async resetUserPassword(
    targetUserId: number,
    input: ResetUserPasswordInput,
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
    })
  }
}
