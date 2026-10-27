import type { DatabaseSync } from 'node:sqlite'
import type {
  CreateSupplierInput,
  SuppliersQueryInput,
  UpdateSupplierInput,
} from '../../shared/schemas/index.js'
import type { PaginatedResult, SupplierDTO } from '../../shared/types.js'
import type { SupplierServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { SupplierRepository } from '../repositories/supplier.repo.js'

export interface SupplierServiceDeps {
  readonly db: DatabaseSync
  readonly supplierRepo: SupplierRepository
}

export class SupplierService implements SupplierServiceContract {
  private readonly deps: SupplierServiceDeps

  public constructor(deps: SupplierServiceDeps) {
    this.deps = deps
  }

  public listSuppliers(query: SuppliersQueryInput): PaginatedResult<SupplierDTO> {
    return this.deps.supplierRepo.listPaginated(query)
  }

  public listActiveSuppliers(): readonly SupplierDTO[] {
    return this.deps.supplierRepo.listAllActive()
  }

  public getSupplierById(id: number): SupplierDTO {
    const supplier = this.deps.supplierRepo.findById(id)
    if (!supplier) {
      throw AppError.notFound(`Supplier dengan ID #${id} tidak ditemukan.`)
    }
    return supplier
  }

  public createSupplier(input: CreateSupplierInput): SupplierDTO {
    const nowIso = new Date().toISOString()
    const id = runInImmediateTransaction(this.deps.db, () => {
      return this.deps.supplierRepo.create({
        name: input.name,
        contactPerson: input.contactPerson,
        phone: input.phone,
        address: input.address,
        notes: input.notes,
        nowIso,
      })
    })

    const created = this.deps.supplierRepo.findById(id)
    if (!created) {
      throw new Error(`Supplier #${id} gagal dibaca setelah pembuatan.`)
    }
    return created
  }

  public updateSupplier(id: number, input: UpdateSupplierInput): SupplierDTO {
    const existing = this.deps.supplierRepo.findById(id)
    if (!existing) {
      throw AppError.notFound(`Supplier dengan ID #${id} tidak ditemukan.`)
    }

    runInImmediateTransaction(this.deps.db, () => {
      const ok = this.deps.supplierRepo.update(id, {
        name: input.name,
        contactPerson: input.contactPerson,
        phone: input.phone,
        address: input.address,
        notes: input.notes,
        isActive: input.isActive,
      })
      if (!ok) {
        throw AppError.notFound(`Supplier #${id} tidak ditemukan saat pembaruan.`)
      }
    })

    const updated = this.deps.supplierRepo.findById(id)
    if (!updated) {
      throw new Error(`Supplier #${id} gagal dibaca setelah pembaruan.`)
    }
    return updated
  }
}
