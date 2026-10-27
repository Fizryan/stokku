import type {
  AuditActionType,
  MovementReferenceType,
  MovementType,
  PaymentMethod,
  PointMutationType,
  PurchasePaymentStatus,
  SaleStatus,
  ShiftMovementType,
  ShiftStatus,
  UserRole,
} from './constants.js'

export interface ApiErrorDetail {
  readonly path?: string
  readonly message: string
}

export interface ApiErrorBody {
  readonly code: string
  readonly message: string
  readonly issues?: readonly ApiErrorDetail[]
}

export interface ApiFailureResponse {
  readonly ok: false
  readonly error: ApiErrorBody
}

export interface ApiSuccessResponse<T> {
  readonly ok: true
  readonly data: T
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse

export interface PaginationMeta {
  readonly page: number
  readonly pageSize: number
  readonly totalItems: number
  readonly totalPages: number
}

export interface PaginatedResult<T> {
  readonly items: readonly T[]
  readonly meta: PaginationMeta
}

export interface UserDTO {
  readonly id: number
  readonly username: string
  readonly fullName: string
  readonly role: UserRole
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AuthSessionDTO {
  readonly needsInitialSetup: boolean
  readonly user: UserDTO | null
}

export interface CategoryDTO {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly productCount: number
  readonly createdAt: string
}

export interface ProductDTO {
  readonly id: number
  readonly sku: string
  readonly barcode: string | null
  readonly name: string
  readonly categoryId: number | null
  readonly categoryName: string | null
  readonly unit: string
  readonly costPrice: number | null
  readonly sellPrice: number
  readonly stockQty: number
  readonly minStockQty: number
  readonly isLowStock: boolean
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface StockMovementDTO {
  readonly id: number
  readonly productId: number
  readonly productSku: string
  readonly productName: string
  readonly productUnit: string
  readonly movementType: MovementType
  readonly qtyBefore: number
  readonly qtyChange: number
  readonly qtyAfter: number
  readonly unitCostSnapshot: number | null
  readonly referenceType: MovementReferenceType
  readonly referenceId: number | null
  readonly note: string | null
  readonly actorUserId: number
  readonly actorName: string
  readonly createdAt: string
}

export interface SaleItemDTO {
  readonly id: number
  readonly saleId: number
  readonly productId: number
  readonly skuSnapshot: string
  readonly productNameSnapshot: string
  readonly unitSnapshot: string
  readonly qty: number
  readonly costPriceAtSale: number | null
  readonly sellPriceAtSale: number
  readonly lineSubtotal: number
}

export interface SaleSummaryDTO {
  readonly id: number
  readonly shiftId: number | null
  readonly invoiceNumber: string
  readonly cashierUserId: number
  readonly cashierName: string
  readonly customerId: number | null
  readonly customerName: string | null
  readonly pointsEarned: number
  readonly pointsRedeemed: number
  readonly pointsDiscountAmount: number
  readonly itemCount: number
  readonly totalQty: number
  readonly subtotalAmount: number
  readonly discountAmount: number
  readonly totalAmount: number
  readonly grossProfitAmount: number | null
  readonly paymentMethod: PaymentMethod
  readonly paidAmount: number
  readonly changeAmount: number
  readonly status: SaleStatus
  readonly voidReason: string | null
  readonly voidedByName: string | null
  readonly voidedAt: string | null
  readonly createdAt: string
}

export interface SaleDetailDTO extends SaleSummaryDTO {
  readonly items: readonly SaleItemDTO[]
}

export interface DailySalesPointDTO {
  readonly date: string
  readonly revenueAmount: number
  readonly transactionCount: number
  readonly grossProfitAmount: number | null
}

export interface TopProductMetricDTO {
  readonly productId: number
  readonly sku: string
  readonly name: string
  readonly unit: string
  readonly soldQty: number
  readonly revenueAmount: number
}

export interface DashboardMetricsDTO {
  readonly todayRevenueAmount: number
  readonly todayTransactionCount: number
  readonly todayGrossProfitAmount: number | null
  readonly totalActiveProducts: number
  readonly lowStockCount: number
  readonly outOfStockCount: number
  readonly totalInventoryCostValue: number | null
  readonly totalInventoryRetailValue: number
  readonly salesTrend: readonly DailySalesPointDTO[]
  readonly lowStockProducts: readonly ProductDTO[]
  readonly topProducts: readonly TopProductMetricDTO[]
  readonly recentSales: readonly SaleSummaryDTO[]
}

export interface CashShiftMovementDTO {
  readonly id: number
  readonly shiftId: number
  readonly movementType: ShiftMovementType
  readonly amount: number
  readonly reason: string
  readonly actorUserId: number
  readonly actorName: string
  readonly createdAt: string
}

export interface CashShiftSummaryDTO {
  readonly id: number
  readonly cashierUserId: number
  readonly cashierName: string
  readonly openedAt: string
  readonly closedAt: string | null
  readonly openingCash: number
  readonly closingCash: number | null
  readonly expectedCash: number
  readonly cashDifference: number | null
  readonly status: ShiftStatus
  readonly notes: string | null
  readonly totalCashSales: number
  readonly totalNonCashSales: number
  readonly totalCashIn: number
  readonly totalCashOut: number
  readonly transactionCount: number
  readonly createdAt: string
}

export interface CashShiftDetailDTO extends CashShiftSummaryDTO {
  readonly movements: readonly CashShiftMovementDTO[]
}

export interface CurrentShiftStatusDTO {
  readonly hasActiveShift: boolean
  readonly shift: CashShiftDetailDTO | null
}

export interface SupplierDTO {
  readonly id: number
  readonly name: string
  readonly contactPerson: string | null
  readonly phone: string | null
  readonly address: string | null
  readonly notes: string | null
  readonly isActive: boolean
  readonly createdAt: string
}

export interface PurchaseItemDTO {
  readonly id: number
  readonly purchaseId: number
  readonly productId: number
  readonly skuSnapshot: string
  readonly productNameSnapshot: string
  readonly unitSnapshot: string
  readonly qty: number
  readonly unitCost: number
  readonly lineSubtotal: number
}

export interface PurchaseSummaryDTO {
  readonly id: number
  readonly invoiceNumber: string
  readonly supplierId: number
  readonly supplierName: string
  readonly receiverUserId: number
  readonly receiverName: string
  readonly subtotalAmount: number
  readonly paymentStatus: PurchasePaymentStatus
  readonly dueDate: string | null
  readonly notes: string | null
  readonly itemCount: number
  readonly totalQty: number
  readonly createdAt: string
}

export interface PurchaseDetailDTO extends PurchaseSummaryDTO {
  readonly items: readonly PurchaseItemDTO[]
}

export interface CustomerDTO {
  readonly id: number
  readonly phone: string
  readonly name: string
  readonly email: string | null
  readonly address: string | null
  readonly notes: string | null
  readonly pointsBalance: number
  readonly totalSpend: number
  readonly visitCount: number
  readonly isActive: boolean
  readonly createdAt: string
}

export interface CustomerPointMutationDTO {
  readonly id: number
  readonly customerId: number
  readonly points: number
  readonly mutationType: PointMutationType
  readonly referenceType: 'SALE' | 'MANUAL'
  readonly referenceId: number | null
  readonly description: string
  readonly actorUserId: number
  readonly actorName: string
  readonly createdAt: string
}

export interface AuditLogDTO {
  readonly id: number
  readonly actorUserId: number | null
  readonly actorName: string | null
  readonly actorRole: UserRole | null
  readonly actionType: AuditActionType
  readonly resourceType: string
  readonly resourceId: string | null
  readonly details: Record<string, unknown> | null
  readonly ipAddress: string | null
  readonly userAgent: string | null
  readonly createdAt: string
}

export interface BackupFileDTO {
  readonly fileName: string
  readonly fileSizeBytes: number
  readonly createdAt: string
  readonly downloadUrl: string
}
