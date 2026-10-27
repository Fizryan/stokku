import type { DatabaseSync } from 'node:sqlite'
import { hasPermission } from '../../shared/constants.js'
import type {
  CategoryInput,
  CreateProductInput,
  ProductQueryInput,
  UpdateProductInput,
} from '../../shared/schemas/index.js'
import type {
  CategoryDTO,
  PaginatedResult,
  ProductDTO,
  UserDTO,
} from '../../shared/types.js'
import type { CatalogServiceContract } from '../contracts/services.contract.js'
import { runInImmediateTransaction } from '../db/transaction.js'
import { AppError } from '../errors/app-error.js'
import type { CategoryRepository } from '../repositories/category.repo.js'
import { type ProductRepository, toProductDTO } from '../repositories/product.repo.js'
import type { InventoryService } from './inventory.service.js'

export interface CatalogServiceDeps {
  readonly db: DatabaseSync
  readonly categoryRepo: CategoryRepository
  readonly productRepo: ProductRepository
  readonly inventoryService: InventoryService
}

export class CatalogService implements CatalogServiceContract {
  private readonly deps: CatalogServiceDeps

  public constructor(deps: CatalogServiceDeps) {
    this.deps = deps
  }

  private canSeeCostPrice(actor: UserDTO): boolean {
    return (
      hasPermission(actor.role, 'catalog:manage') ||
      hasPermission(actor.role, 'dashboard:financials')
    )
  }

  public listCategories(): readonly CategoryDTO[] {
    return this.deps.categoryRepo.listAll()
  }

  public createCategory(input: CategoryInput): CategoryDTO {
    return this.deps.categoryRepo.create(
      input.name,
      input.description,
      new Date().toISOString(),
    )
  }

  public updateCategory(id: number, input: CategoryInput): CategoryDTO {
    const updated = this.deps.categoryRepo.update(id, input.name, input.description)
    if (!updated) {
      throw AppError.notFound('Kategori tidak ditemukan.')
    }
    return updated
  }

  public deleteCategory(id: number): void {
    const deleted = this.deps.categoryRepo.delete(id)
    if (!deleted) {
      throw AppError.notFound('Kategori tidak ditemukan.')
    }
  }

  public listProducts(
    actor: UserDTO,
    query: ProductQueryInput,
  ): PaginatedResult<ProductDTO> {
    return this.deps.productRepo.listPaginated(query, this.canSeeCostPrice(actor))
  }

  public getProductById(actor: UserDTO, id: number): ProductDTO {
    const record = this.deps.productRepo.findById(id)
    if (!record) {
      throw AppError.notFound('Produk tidak ditemukan.')
    }
    return toProductDTO(record, this.canSeeCostPrice(actor))
  }

  public lookupProductByCode(actor: UserDTO, code: string): ProductDTO {
    const record = this.deps.productRepo.findActiveByCode(code)
    if (!record) {
      throw AppError.notFound(
        `Produk aktif dengan kode/barcode "${code}" tidak ditemukan.`,
      )
    }
    return toProductDTO(record, this.canSeeCostPrice(actor))
  }

  public createProduct(actor: UserDTO, input: CreateProductInput): ProductDTO {
    const nowIso = new Date().toISOString()
    const includeCost = this.canSeeCostPrice(actor)

    return runInImmediateTransaction(this.deps.db, () => {
      if (input.categoryId !== null) {
        const category = this.deps.categoryRepo.findById(input.categoryId)
        if (!category) {
          throw AppError.badRequest('Kategori produk yang dipilih tidak ditemukan.')
        }
      }

      const created = this.deps.productRepo.createZeroStockProduct({
        sku: input.sku,
        barcode: input.barcode,
        name: input.name,
        categoryId: input.categoryId,
        unit: input.unit,
        costPrice: input.costPrice,
        sellPrice: input.sellPrice,
        minStockQty: input.minStockQty,
        nowIso,
      })

      if (input.initialStock > 0) {
        this.deps.inventoryService.recordInitialStockInTx({
          product: created,
          initialStock: input.initialStock,
          actorUserId: actor.id,
          nowIso,
          includeUnitCostInResult: includeCost,
        })

        const reloaded = this.deps.productRepo.findById(created.id)
        if (!reloaded) {
          throw new Error('Failed to reload product after initial stock ledger entry.')
        }
        return toProductDTO(reloaded, includeCost)
      }

      return toProductDTO(created, includeCost)
    })
  }

  public updateProduct(
    actor: UserDTO,
    id: number,
    input: UpdateProductInput,
  ): ProductDTO {
    if (input.categoryId !== null) {
      const category = this.deps.categoryRepo.findById(input.categoryId)
      if (!category) {
        throw AppError.badRequest('Kategori produk yang dipilih tidak ditemukan.')
      }
    }

    const updated = this.deps.productRepo.updateMetadata({
      id,
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      categoryId: input.categoryId,
      unit: input.unit,
      costPrice: input.costPrice,
      sellPrice: input.sellPrice,
      minStockQty: input.minStockQty,
      isActive: input.isActive,
      nowIso: new Date().toISOString(),
    })

    if (!updated) {
      throw AppError.notFound('Produk tidak ditemukan.')
    }

    return toProductDTO(updated, this.canSeeCostPrice(actor))
  }
}
