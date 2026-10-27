import type { AuditActionType } from '../../shared/constants.js'
import type {
  AdjustCustomerPointsInput,
  AuditLogsQueryInput,
  CategoryInput,
  ChangePasswordInput,
  CheckoutSaleInput,
  CloseShiftInput,
  CreateCustomerInput,
  CreateProductInput,
  CreatePurchaseInput,
  CreateSupplierInput,
  CreateUserInput,
  CustomersQueryInput,
  DashboardQueryInput,
  InitialSetupInput,
  LoginInput,
  MovementQueryInput,
  OpenShiftInput,
  ProductQueryInput,
  PurchasesQueryInput,
  RecordCashMovementInput,
  RecordStockMovementInput,
  ResetUserPasswordInput,
  SalesExportQueryInput,
  SalesQueryInput,
  ShiftsQueryInput,
  SuppliersQueryInput,
  UpdateCustomerInput,
  UpdateProductInput,
  UpdatePurchasePaymentStatusInput,
  UpdateSupplierInput,
  UpdateUserInput,
  VoidSaleInput,
} from '../../shared/schemas/index.js'
import type {
  AuditLogDTO,
  AuthSessionDTO,
  BackupFileDTO,
  CashShiftDetailDTO,
  CashShiftMovementDTO,
  CashShiftSummaryDTO,
  CategoryDTO,
  CurrentShiftStatusDTO,
  CustomerDTO,
  CustomerPointMutationDTO,
  DashboardMetricsDTO,
  PaginatedResult,
  ProductDTO,
  PurchaseDetailDTO,
  PurchaseSummaryDTO,
  SaleDetailDTO,
  SaleSummaryDTO,
  StockMovementDTO,
  SupplierDTO,
  UserDTO,
} from '../../shared/types.js'

export interface SessionClientMetadata {
  readonly ipAddress: string | null
  readonly userAgent: string | null
}

export interface AuthenticatedLoginResult {
  readonly user: UserDTO
  readonly rawSessionToken: string
  readonly expiresAt: Date
}

export interface ValidatedSessionContext {
  readonly sessionId: string
  readonly user: UserDTO
  readonly refreshedExpiresAt: Date | null
}

export interface AuthServiceContract {
  getSessionStatus(rawSessionToken: string | undefined): AuthSessionDTO
  validateSessionToken(rawSessionToken: string): ValidatedSessionContext | null
  initializeFirstOwner(
    input: InitialSetupInput,
    meta: SessionClientMetadata,
  ): Promise<AuthenticatedLoginResult>
  login(input: LoginInput, meta: SessionClientMetadata): Promise<AuthenticatedLoginResult>
  logout(rawSessionToken: string | undefined): void
  changeOwnPassword(
    actor: UserDTO,
    currentSessionId: string,
    input: ChangePasswordInput,
  ): Promise<void>
}

export interface UserServiceContract {
  listUsers(): readonly UserDTO[]
  createUser(input: CreateUserInput, actor?: UserDTO): Promise<UserDTO>
  updateUser(actor: UserDTO, targetUserId: number, input: UpdateUserInput): UserDTO
  resetUserPassword(
    targetUserId: number,
    input: ResetUserPasswordInput,
    actor?: UserDTO,
  ): Promise<void>
}

export interface CatalogServiceContract {
  listCategories(): readonly CategoryDTO[]
  createCategory(input: CategoryInput): CategoryDTO
  updateCategory(id: number, input: CategoryInput): CategoryDTO
  deleteCategory(id: number): void

  listProducts(actor: UserDTO, query: ProductQueryInput): PaginatedResult<ProductDTO>
  getProductById(actor: UserDTO, id: number): ProductDTO
  lookupProductByCode(actor: UserDTO, code: string): ProductDTO
  createProduct(actor: UserDTO, input: CreateProductInput): ProductDTO
  updateProduct(actor: UserDTO, id: number, input: UpdateProductInput): ProductDTO
}

export interface InventoryServiceContract {
  recordManualMovement(actor: UserDTO, input: RecordStockMovementInput): StockMovementDTO
  listMovements(
    actor: UserDTO,
    query: MovementQueryInput,
  ): PaginatedResult<StockMovementDTO>
}

export interface PosServiceContract {
  checkout(actor: UserDTO, input: CheckoutSaleInput): SaleDetailDTO
  listSales(actor: UserDTO, query: SalesQueryInput): PaginatedResult<SaleSummaryDTO>
  getSaleDetail(actor: UserDTO, saleId: number): SaleDetailDTO
  voidSale(actor: UserDTO, saleId: number, input: VoidSaleInput): SaleDetailDTO
}

export interface ShiftServiceContract {
  getCurrentShift(actor: UserDTO): CurrentShiftStatusDTO
  openShift(actor: UserDTO, input: OpenShiftInput): CashShiftDetailDTO
  recordMovement(actor: UserDTO, input: RecordCashMovementInput): CashShiftMovementDTO
  closeShift(actor: UserDTO, input: CloseShiftInput): CashShiftDetailDTO
  listShifts(
    actor: UserDTO,
    query: ShiftsQueryInput,
  ): PaginatedResult<CashShiftSummaryDTO>
  getShiftDetail(actor: UserDTO, shiftId: number): CashShiftDetailDTO
}

export interface SupplierServiceContract {
  listSuppliers(query: SuppliersQueryInput): PaginatedResult<SupplierDTO>
  listActiveSuppliers(): readonly SupplierDTO[]
  getSupplierById(id: number): SupplierDTO
  createSupplier(input: CreateSupplierInput): SupplierDTO
  updateSupplier(id: number, input: UpdateSupplierInput): SupplierDTO
}

export interface PurchaseServiceContract {
  createPurchase(actor: UserDTO, input: CreatePurchaseInput): PurchaseDetailDTO
  listPurchases(query: PurchasesQueryInput): PaginatedResult<PurchaseSummaryDTO>
  getPurchaseDetail(id: number): PurchaseDetailDTO
  updatePaymentStatus(
    id: number,
    input: UpdatePurchasePaymentStatusInput,
  ): PurchaseDetailDTO
}

export interface CustomerServiceContract {
  listCustomers(query: CustomersQueryInput): PaginatedResult<CustomerDTO>
  getCustomerById(id: number): CustomerDTO
  getCustomerByPhone(phone: string): CustomerDTO | null
  getTopCustomers(limit?: number): readonly CustomerDTO[]
  createCustomer(input: CreateCustomerInput): CustomerDTO
  updateCustomer(id: number, input: UpdateCustomerInput): CustomerDTO
  adjustPoints(
    actor: UserDTO,
    customerId: number,
    input: AdjustCustomerPointsInput,
  ): CustomerDTO
  listPointMutations(
    customerId: number,
    limit?: number,
  ): readonly CustomerPointMutationDTO[]
}

export interface ReportServiceContract {
  getDashboardMetrics(actor: UserDTO, query: DashboardQueryInput): DashboardMetricsDTO
  exportSalesCsv(query: SalesExportQueryInput, actor?: UserDTO): string
}

export interface AuditServiceContract {
  log(params: {
    actor?: UserDTO | null
    actionType: AuditActionType
    resourceType: string
    resourceId?: string | number | null
    details?: Record<string, unknown> | null
    ipAddress?: string | null
    userAgent?: string | null
  }): AuditLogDTO
  listAuditLogs(query: AuditLogsQueryInput): PaginatedResult<AuditLogDTO>
}

export interface BackupServiceContract {
  createBackup(actor: UserDTO, meta?: SessionClientMetadata): BackupFileDTO
  listBackups(): readonly BackupFileDTO[]
  getBackupFilePath(fileName: string): string
  getBackupFileBuffer(fileName: string): Uint8Array
}

export interface HealthServiceContract {
  checkHealth(): {
    readonly status: 'ok'
    readonly timestamp: string
    readonly uptimeSeconds: number
  }
}

export interface CookieSecurityConfig {
  readonly sessionTtlMs: number
  readonly cookieSecure: 'auto' | 'true' | 'false'
  readonly nodeEnv: 'development' | 'test' | 'production'
}

export interface AppServices {
  readonly auth: AuthServiceContract
  readonly users: UserServiceContract
  readonly catalog: CatalogServiceContract
  readonly inventory: InventoryServiceContract
  readonly pos: PosServiceContract
  readonly shifts: ShiftServiceContract
  readonly suppliers: SupplierServiceContract
  readonly purchases: PurchaseServiceContract
  readonly customers: CustomerServiceContract
  readonly reports: ReportServiceContract
  readonly audit: AuditServiceContract
  readonly backup: BackupServiceContract
  readonly health: HealthServiceContract
  readonly cookieConfig: CookieSecurityConfig
}

export interface HonoAppEnv {
  Variables: {
    currentUser: UserDTO
    sessionId: string
  }
}
