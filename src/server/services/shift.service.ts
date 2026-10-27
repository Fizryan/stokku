import type { DatabaseSync } from 'node:sqlite'
import { hasPermission } from '../../shared/constants.js'
import type {
  CloseShiftInput,
  OpenShiftInput,
  RecordCashMovementInput,
  ShiftsQueryInput,
} from '../../shared/schemas/index.js'
import type {
  CashShiftDetailDTO,
  CashShiftMovementDTO,
  CashShiftSummaryDTO,
  CurrentShiftStatusDTO,
  PaginatedResult,
  UserDTO,
} from '../../shared/types.js'
import type { ShiftServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { ShiftRepository } from '../repositories/shift.repo.js'

export interface ShiftServiceDeps {
  readonly db: DatabaseSync
  readonly shiftRepo: ShiftRepository
}

export class ShiftService implements ShiftServiceContract {
  private readonly deps: ShiftServiceDeps

  public constructor(deps: ShiftServiceDeps) {
    this.deps = deps
  }

  public getCurrentShift(actor: UserDTO): CurrentShiftStatusDTO {
    const shift = this.deps.shiftRepo.findActiveByCashierId(actor.id)
    return {
      hasActiveShift: Boolean(shift),
      shift: shift ?? null,
    }
  }

  public openShift(actor: UserDTO, input: OpenShiftInput): CashShiftDetailDTO {
    const active = this.deps.shiftRepo.findActiveByCashierId(actor.id)
    if (active) {
      throw AppError.conflict(
        `Kasir "${actor.fullName}" sudah memiliki shift aktif (#${active.id}) yang dibuka pada ${new Date(active.openedAt).toLocaleString('id-ID')}. Harap tutup shift sebelumnya terlebih dahulu.`,
      )
    }

    const nowIso = new Date().toISOString()
    const shiftId = runInImmediateTransaction(this.deps.db, () => {
      return this.deps.shiftRepo.openShift({
        cashierUserId: actor.id,
        openingCash: input.openingCash,
        notes: input.notes,
        openedAtIso: nowIso,
      })
    })

    const detail = this.deps.shiftRepo.findById(shiftId)
    if (!detail) {
      throw new Error(`Shift #${shiftId} gagal dibaca setelah inisialisasi.`)
    }
    return detail
  }

  public recordMovement(
    actor: UserDTO,
    input: RecordCashMovementInput,
  ): CashShiftMovementDTO {
    const active = this.deps.shiftRepo.findActiveByCashierId(actor.id)
    if (!active) {
      throw AppError.badRequest(
        'Tidak ada shift kasir yang sedang aktif. Anda wajib membuka shift terlebih dahulu sebelum mencatat pergerakan kas laci.',
      )
    }

    if (input.movementType === 'CASH_OUT' && input.amount > active.expectedCash) {
      throw AppError.badRequest(
        `Penarikan kas sebesar Rp ${input.amount.toLocaleString('id-ID')} melebihi saldo kas saat ini di laci (Rp ${active.expectedCash.toLocaleString('id-ID')}).`,
      )
    }

    const nowIso = new Date().toISOString()
    const movementId = runInImmediateTransaction(this.deps.db, () => {
      return this.deps.shiftRepo.recordCashMovement({
        shiftId: active.id,
        movementType: input.movementType,
        amount: input.amount,
        reason: input.reason,
        actorUserId: actor.id,
        createdAtIso: nowIso,
      })
    })

    return {
      id: movementId,
      shiftId: active.id,
      movementType: input.movementType,
      amount: input.amount,
      reason: input.reason,
      actorUserId: actor.id,
      actorName: actor.fullName,
      createdAt: nowIso,
    }
  }

  public closeShift(actor: UserDTO, input: CloseShiftInput): CashShiftDetailDTO {
    const active = this.deps.shiftRepo.findActiveByCashierId(actor.id)
    if (!active) {
      throw AppError.badRequest(
        'Tidak ada shift kasir aktif yang dapat ditutup. Harap pastikan shift sudah dibuka.',
      )
    }

    const expectedCash = active.expectedCash
    const cashDifference = input.actualCash - expectedCash
    const nowIso = new Date().toISOString()

    runInImmediateTransaction(this.deps.db, () => {
      const updated = this.deps.shiftRepo.closeShift({
        shiftId: active.id,
        closingCash: input.actualCash,
        expectedCash,
        cashDifference,
        notes: input.notes,
        closedAtIso: nowIso,
      })
      if (!updated) {
        throw AppError.conflict(
          'Gagal menutup shift atau shift sudah ditutup sebelumnya.',
        )
      }
    })

    const detail = this.deps.shiftRepo.findById(active.id)
    if (!detail) {
      throw new Error(`Shift #${active.id} tidak ditemukan setelah penutupan.`)
    }
    return detail
  }

  public listShifts(
    actor: UserDTO,
    query: ShiftsQueryInput,
  ): PaginatedResult<CashShiftSummaryDTO> {
    const canViewAll = hasPermission(actor.role, 'shifts:view_all')
    const canViewSelf = hasPermission(actor.role, 'shifts:view')

    if (!canViewAll && !canViewSelf) {
      throw AppError.forbidden(
        'Akses ditolak: izin melihat daftar shift tidak mencukupi.',
      )
    }

    const restrictToCashierId = canViewAll ? undefined : actor.id
    return this.deps.shiftRepo.listPaginated(query, { restrictToCashierId })
  }

  public getShiftDetail(actor: UserDTO, shiftId: number): CashShiftDetailDTO {
    const detail = this.deps.shiftRepo.findById(shiftId)
    if (!detail) {
      throw AppError.notFound(`Shift dengan ID #${shiftId} tidak ditemukan.`)
    }

    const canViewAll = hasPermission(actor.role, 'shifts:view_all')
    const canViewSelf = hasPermission(actor.role, 'shifts:view')

    if (!canViewAll) {
      if (!canViewSelf || detail.cashierUserId !== actor.id) {
        throw AppError.forbidden(
          'Akses ditolak: Anda tidak memiliki wewenang untuk memeriksa detail shift kasir lain.',
        )
      }
    }

    return detail
  }
}
