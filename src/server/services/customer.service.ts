import type { DatabaseSync } from 'node:sqlite'
import type {
  AdjustCustomerPointsInput,
  CreateCustomerInput,
  CustomersQueryInput,
  UpdateCustomerInput,
} from '../../shared/schemas/customer.schema.js'
import type {
  CustomerDTO,
  CustomerPointMutationDTO,
  PaginatedResult,
  UserDTO,
} from '../../shared/types.js'
import type {
  AuditServiceContract,
  CustomerServiceContract,
} from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { CustomerRepository } from '../repositories/customer.repo.js'

export class CustomerService implements CustomerServiceContract {
  private readonly db: DatabaseSync
  private readonly customerRepo: CustomerRepository
  private readonly auditService?: AuditServiceContract

  public constructor(deps: {
    db: DatabaseSync
    customerRepo: CustomerRepository
    auditService?: AuditServiceContract
  }) {
    this.db = deps.db
    this.customerRepo = deps.customerRepo
    this.auditService = deps.auditService
  }

  public listCustomers(query: CustomersQueryInput): PaginatedResult<CustomerDTO> {
    return this.customerRepo.listPaginated(query)
  }

  public getCustomerById(id: number): CustomerDTO {
    const customer = this.customerRepo.findById(id)
    if (!customer) {
      throw AppError.notFound(`Pelanggan dengan ID #${id} tidak ditemukan.`)
    }
    return customer
  }

  public getCustomerByPhone(phone: string): CustomerDTO | null {
    const cleanPhone = phone.trim()
    return this.customerRepo.findByPhone(cleanPhone) ?? null
  }

  public getTopCustomers(limit = 10): readonly CustomerDTO[] {
    return this.customerRepo.findTopCustomers(limit)
  }

  public createCustomer(input: CreateCustomerInput): CustomerDTO {
    const cleanPhone = input.phone.trim()
    const existing = this.customerRepo.findByPhone(cleanPhone)
    if (existing) {
      throw AppError.conflict(
        `Pelanggan dengan nomor telepon "${cleanPhone}" sudah terdaftar (${existing.name}).`,
      )
    }

    const nowIso = new Date().toISOString()
    const customerId = this.customerRepo.create({
      phone: cleanPhone,
      name: input.name.trim(),
      email: input.email ? input.email.trim().toLowerCase() : null,
      address: input.address ? input.address.trim() : null,
      notes: input.notes ? input.notes.trim() : null,
      nowIso,
    })

    const created = this.customerRepo.findById(customerId)
    if (!created) {
      throw new Error(`Gagal memuat data pelanggan baru #${customerId}.`)
    }
    return created
  }

  public updateCustomer(id: number, input: UpdateCustomerInput): CustomerDTO {
    const existing = this.customerRepo.findById(id)
    if (!existing) {
      throw AppError.notFound(`Pelanggan dengan ID #${id} tidak ditemukan.`)
    }

    const ok = this.customerRepo.update(id, {
      name: input.name.trim(),
      email: input.email ? input.email.trim().toLowerCase() : null,
      address: input.address ? input.address.trim() : null,
      notes: input.notes ? input.notes.trim() : null,
      isActive: input.isActive,
    })

    if (!ok) {
      throw AppError.notFound(`Pelanggan #${id} gagal diperbarui.`)
    }

    const updated = this.customerRepo.findById(id)
    if (!updated) {
      throw new Error(`Gagal memuat data pelanggan #${id} setelah pembaruan.`)
    }
    return updated
  }

  public adjustPoints(
    actor: UserDTO,
    customerId: number,
    input: AdjustCustomerPointsInput,
  ): CustomerDTO {
    const customer = this.customerRepo.findById(customerId)
    if (!customer) {
      throw AppError.notFound(`Pelanggan dengan ID #${customerId} tidak ditemukan.`)
    }

    if (customer.pointsBalance + input.points < 0) {
      throw AppError.badRequest(
        `Pengurangan ${Math.abs(input.points)} poin melebihi saldo pelanggan (${customer.pointsBalance} poin).`,
      )
    }

    const nowIso = new Date().toISOString()

    runInImmediateTransaction(this.db, () => {
      const ok = this.customerRepo.adjustBalanceInTx(customerId, input.points)
      if (!ok) {
        throw AppError.conflict('Gagal memperbarui saldo poin pelanggan.')
      }

      this.customerRepo.recordPointMutationInTx({
        customerId,
        points: input.points,
        mutationType: 'ADJUSTMENT',
        referenceType: 'MANUAL',
        referenceId: null,
        description: input.description.trim(),
        actorUserId: actor.id,
        nowIso,
      })
    })

    const updated = this.customerRepo.findById(customerId)
    if (!updated) {
      throw new Error(
        `Gagal memuat data pelanggan #${customerId} setelah penyesuaian poin.`,
      )
    }

    if (this.auditService) {
      this.auditService.log({
        actor,
        actionType: 'POINTS_ADJUSTED',
        resourceType: 'customer',
        resourceId: customerId,
        details: {
          customerId,
          customerName: updated.name,
          points: input.points,
          newPointsBalance: updated.pointsBalance,
          description: input.description.trim(),
        },
      })
    }

    return updated
  }

  public listPointMutations(
    customerId: number,
    limit = 50,
  ): readonly CustomerPointMutationDTO[] {
    const customer = this.customerRepo.findById(customerId)
    if (!customer) {
      throw AppError.notFound(`Pelanggan dengan ID #${customerId} tidak ditemukan.`)
    }
    return this.customerRepo.listPointMutationsByCustomerId(customerId, limit)
  }
}
