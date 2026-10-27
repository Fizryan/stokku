import type {
  CategoryInput,
  ChangePasswordInput,
  CheckoutSaleInput,
  CreateProductInput,
  CreateUserInput,
  DashboardQueryInput,
  InitialSetupInput,
  LoginInput,
  MovementQueryInput,
  ProductQueryInput,
  RecordStockMovementInput,
  ResetUserPasswordInput,
  SalesExportQueryInput,
  SalesQueryInput,
  UpdateProductInput,
  UpdateUserInput,
  VoidSaleInput,
} from '../../shared/schemas/index.js'
import type {
  AuthSessionDTO,
  CategoryDTO,
  DashboardMetricsDTO,
  PaginatedResult,
  ProductDTO,
  SaleDetailDTO,
  SaleSummaryDTO,
  StockMovementDTO,
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
  createUser(input: CreateUserInput): Promise<UserDTO>
  updateUser(actor: UserDTO, targetUserId: number, input: UpdateUserInput): UserDTO
  resetUserPassword(targetUserId: number, input: ResetUserPasswordInput): Promise<void>
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

export interface ReportServiceContract {
  getDashboardMetrics(actor: UserDTO, query: DashboardQueryInput): DashboardMetricsDTO
  exportSalesCsv(query: SalesExportQueryInput): string
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
  readonly reports: ReportServiceContract
  readonly health: HealthServiceContract
  readonly cookieConfig: CookieSecurityConfig
}

export interface HonoAppEnv {
  Variables: {
    currentUser: UserDTO
    sessionId: string
  }
}
