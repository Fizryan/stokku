import { hc } from 'hono/client'
import type { AppType } from '../../server/routes/index.js'
import type {
  AdjustCustomerPointsInput,
  CategoryInput,
  ChangePasswordInput,
  CheckoutSaleInput,
  CloseShiftInput,
  CreateCustomerInput,
  CreateProductInput,
  CreatePurchaseInput,
  CreateSupplierInput,
  CreateUserInput,
  InitialSetupInput,
  LoginInput,
  OpenShiftInput,
  ProductStatusFilter,
  RecordCashMovementInput,
  RecordStockMovementInput,
  ResetUserPasswordInput,
  SalesExportQueryInput,
  UpdateCustomerInput,
  UpdateProductInput,
  UpdatePurchasePaymentStatusInput,
  UpdateSupplierInput,
  UpdateUserInput,
  VoidSaleInput,
} from '../../shared/schemas/index.js'
import type {
  ApiErrorDetail,
  ApiResponse,
  AuditActionType,
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
  MovementType,
  PaginatedResult,
  PaymentMethod,
  ProductDTO,
  PurchaseDetailDTO,
  PurchasePaymentStatus,
  PurchaseSummaryDTO,
  SaleDetailDTO,
  SaleStatus,
  SaleSummaryDTO,
  ShiftStatus,
  StockMovementDTO,
  SupplierDTO,
  UserDTO,
} from './types-reexport.js'

export class ClientApiError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly issues: readonly ApiErrorDetail[]

  public constructor(params: {
    code: string
    message: string
    status: number
    issues?: readonly ApiErrorDetail[]
  }) {
    super(params.message)
    this.name = 'ClientApiError'
    this.code = params.code
    this.status = params.status
    this.issues = params.issues ?? []
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError'
  )
}

type UnauthorizedListener = () => void
let onUnauthorizedCallback: UnauthorizedListener | null = null

export function registerUnauthorizedHandler(fn: UnauthorizedListener | null): () => void {
  onUnauthorizedCallback = fn
  return () => {
    if (onUnauthorizedCallback === fn) {
      onUnauthorizedCallback = null
    }
  }
}

export const rpcClient = hc<AppType>('/')

async function unwrapApiResponse<T>(
  responsePromise: Promise<Response>,
  options?: { suppressUnauthorizedRedirect?: boolean },
): Promise<T> {
  let response: Response
  try {
    response = await responsePromise
  } catch (err) {
    if (isAbortError(err)) {
      throw err
    }
    throw new ClientApiError({
      code: 'NETWORK_ERROR',
      message: 'Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda.',
      status: 0,
    })
  }

  let parsed: ApiResponse<T> | null = null
  try {
    parsed = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ClientApiError({
      code: 'INVALID_RESPONSE',
      message: `Respons server tidak dapat dibaca (HTTP ${response.status}).`,
      status: response.status,
    })
  }

  if (!response.ok || !parsed.ok) {
    const errBody = !parsed.ok
      ? parsed.error
      : {
          code: 'HTTP_ERROR',
          message: `Permintaan gagal dengan kode ${response.status}.`,
        }

    if (
      response.status === 401 &&
      !options?.suppressUnauthorizedRedirect &&
      onUnauthorizedCallback
    ) {
      onUnauthorizedCallback()
    }

    throw new ClientApiError({
      code: errBody.code,
      message: errBody.message,
      status: response.status,
      issues: errBody.issues,
    })
  }

  return parsed.data
}

function cleanQueryRecord(
  raw: Record<string, string | number | boolean | undefined>,
): Record<string, string> {
  const cleaned: Record<string, string> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (val !== undefined && val !== '') {
      cleaned[key] = String(val)
    }
  }
  return cleaned
}

export const api = {
  auth: {
    getSession(): Promise<AuthSessionDTO> {
      return unwrapApiResponse<AuthSessionDTO>(rpcClient.api.auth.session.$get(), {
        suppressUnauthorizedRedirect: true,
      })
    },
    setupOwner(input: InitialSetupInput): Promise<{ user: UserDTO }> {
      return unwrapApiResponse<{ user: UserDTO }>(
        rpcClient.api.auth.setup.$post({ json: input }),
        { suppressUnauthorizedRedirect: true },
      )
    },
    login(input: LoginInput): Promise<{ user: UserDTO }> {
      return unwrapApiResponse<{ user: UserDTO }>(
        rpcClient.api.auth.login.$post({ json: input }),
        { suppressUnauthorizedRedirect: true },
      )
    },
    logout(): Promise<{ loggedOut: boolean }> {
      return unwrapApiResponse<{ loggedOut: boolean }>(
        rpcClient.api.auth.logout.$post(),
        { suppressUnauthorizedRedirect: true },
      )
    },
    changePassword(input: ChangePasswordInput): Promise<{ updated: boolean }> {
      return unwrapApiResponse<{ updated: boolean }>(
        rpcClient.api.auth['change-password'].$post({ json: input }),
      )
    },
  },

  users: {
    list(): Promise<readonly UserDTO[]> {
      return unwrapApiResponse<readonly UserDTO[]>(rpcClient.api.users.$get())
    },
    create(input: CreateUserInput): Promise<UserDTO> {
      return unwrapApiResponse<UserDTO>(rpcClient.api.users.$post({ json: input }))
    },
    update(id: number, input: UpdateUserInput): Promise<UserDTO> {
      return unwrapApiResponse<UserDTO>(
        rpcClient.api.users[':id'].$patch({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
    resetPassword(
      id: number,
      input: ResetUserPasswordInput,
    ): Promise<{ reset: boolean }> {
      return unwrapApiResponse<{ reset: boolean }>(
        rpcClient.api.users[':id']['reset-password'].$post({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
  },

  categories: {
    list(): Promise<readonly CategoryDTO[]> {
      return unwrapApiResponse<readonly CategoryDTO[]>(rpcClient.api.categories.$get())
    },
    create(input: CategoryInput): Promise<CategoryDTO> {
      return unwrapApiResponse<CategoryDTO>(
        rpcClient.api.categories.$post({ json: input }),
      )
    },
    update(id: number, input: CategoryInput): Promise<CategoryDTO> {
      return unwrapApiResponse<CategoryDTO>(
        rpcClient.api.categories[':id'].$put({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
    remove(id: number): Promise<{ deleted: boolean }> {
      return unwrapApiResponse<{ deleted: boolean }>(
        rpcClient.api.categories[':id'].$delete({
          param: { id: String(id) },
        }),
      )
    },
  },

  products: {
    list(
      params: {
        search?: string
        categoryId?: number
        status?: ProductStatusFilter
        lowStockOnly?: boolean
        page?: number
        pageSize?: number
      },
      signal?: AbortSignal,
    ): Promise<PaginatedResult<ProductDTO>> {
      return unwrapApiResponse<PaginatedResult<ProductDTO>>(
        rpcClient.api.products.$get(
          {
            query: {
              search: params.search || undefined,
              categoryId:
                params.categoryId !== undefined ? String(params.categoryId) : undefined,
              status: params.status,
              lowStockOnly:
                params.lowStockOnly !== undefined
                  ? String(params.lowStockOnly)
                  : undefined,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    lookupByCode(code: string): Promise<ProductDTO> {
      return unwrapApiResponse<ProductDTO>(
        rpcClient.api.products.lookup.$get({ query: { code } }),
      )
    },
    create(input: CreateProductInput): Promise<ProductDTO> {
      return unwrapApiResponse<ProductDTO>(rpcClient.api.products.$post({ json: input }))
    },
    update(id: number, input: UpdateProductInput): Promise<ProductDTO> {
      return unwrapApiResponse<ProductDTO>(
        rpcClient.api.products[':id'].$put({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
  },

  inventory: {
    listMovements(
      params: {
        productId?: number
        movementType?: MovementType
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
      },
      signal?: AbortSignal,
    ): Promise<PaginatedResult<StockMovementDTO>> {
      return unwrapApiResponse<PaginatedResult<StockMovementDTO>>(
        rpcClient.api.inventory.movements.$get(
          {
            query: {
              productId:
                params.productId !== undefined ? String(params.productId) : undefined,
              movementType: params.movementType,
              dateFrom: params.dateFrom || undefined,
              dateTo: params.dateTo || undefined,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    recordMovement(input: RecordStockMovementInput): Promise<StockMovementDTO> {
      return unwrapApiResponse<StockMovementDTO>(
        rpcClient.api.inventory.movements.$post({ json: input }),
      )
    },
  },

  sales: {
    checkout(input: CheckoutSaleInput): Promise<SaleDetailDTO> {
      return unwrapApiResponse<SaleDetailDTO>(rpcClient.api.sales.$post({ json: input }))
    },
    list(
      params: {
        search?: string
        status?: SaleStatus
        paymentMethod?: PaymentMethod
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
      },
      signal?: AbortSignal,
    ): Promise<PaginatedResult<SaleSummaryDTO>> {
      return unwrapApiResponse<PaginatedResult<SaleSummaryDTO>>(
        rpcClient.api.sales.$get(
          {
            query: {
              search: params.search || undefined,
              status: params.status,
              paymentMethod: params.paymentMethod,
              dateFrom: params.dateFrom || undefined,
              dateTo: params.dateTo || undefined,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    getDetail(id: number): Promise<SaleDetailDTO> {
      return unwrapApiResponse<SaleDetailDTO>(
        rpcClient.api.sales[':id'].$get({ param: { id: String(id) } }),
      )
    },
    voidSale(id: number, input: VoidSaleInput): Promise<SaleDetailDTO> {
      return unwrapApiResponse<SaleDetailDTO>(
        rpcClient.api.sales[':id'].void.$post({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
    buildExportCsvUrl(params: SalesExportQueryInput): string {
      const searchParams = new URLSearchParams(cleanQueryRecord(params))
      const qs = searchParams.toString()
      return qs ? `/api/sales/export.csv?${qs}` : '/api/sales/export.csv'
    },
  },

  shifts: {
    getCurrent(signal?: AbortSignal): Promise<CurrentShiftStatusDTO> {
      return unwrapApiResponse<CurrentShiftStatusDTO>(
        rpcClient.api.shifts.current.$get({}, { init: { signal } }),
      )
    },
    open(input: OpenShiftInput): Promise<CashShiftDetailDTO> {
      return unwrapApiResponse<CashShiftDetailDTO>(
        rpcClient.api.shifts.open.$post({ json: input }),
      )
    },
    recordMovement(input: RecordCashMovementInput): Promise<CashShiftMovementDTO> {
      return unwrapApiResponse<CashShiftMovementDTO>(
        rpcClient.api.shifts['cash-movement'].$post({ json: input }),
      )
    },
    close(input: CloseShiftInput): Promise<CashShiftDetailDTO> {
      return unwrapApiResponse<CashShiftDetailDTO>(
        rpcClient.api.shifts.close.$post({ json: input }),
      )
    },
    list(
      params: {
        cashierUserId?: number
        status?: ShiftStatus
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
      } = {},
      signal?: AbortSignal,
    ): Promise<PaginatedResult<CashShiftSummaryDTO>> {
      return unwrapApiResponse<PaginatedResult<CashShiftSummaryDTO>>(
        rpcClient.api.shifts.$get(
          {
            query: {
              cashierUserId:
                params.cashierUserId !== undefined
                  ? String(params.cashierUserId)
                  : undefined,
              status: params.status,
              dateFrom: params.dateFrom || undefined,
              dateTo: params.dateTo || undefined,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    getDetail(id: number, signal?: AbortSignal): Promise<CashShiftDetailDTO> {
      return unwrapApiResponse<CashShiftDetailDTO>(
        rpcClient.api.shifts[':id'].$get(
          { param: { id: String(id) } },
          { init: { signal } },
        ),
      )
    },
  },

  suppliers: {
    list(
      params: {
        search?: string
        status?: 'all' | 'active' | 'archived'
        page?: number
        pageSize?: number
      } = {},
      signal?: AbortSignal,
    ): Promise<PaginatedResult<SupplierDTO>> {
      return unwrapApiResponse<PaginatedResult<SupplierDTO>>(
        rpcClient.api.suppliers.$get(
          {
            query: {
              search: params.search || undefined,
              status: params.status,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    listActive(signal?: AbortSignal): Promise<readonly SupplierDTO[]> {
      return unwrapApiResponse<readonly SupplierDTO[]>(
        rpcClient.api.suppliers.active.$get({}, { init: { signal } }),
      )
    },
    create(input: CreateSupplierInput): Promise<SupplierDTO> {
      return unwrapApiResponse<SupplierDTO>(
        rpcClient.api.suppliers.$post({ json: input }),
      )
    },
    update(id: number, input: UpdateSupplierInput): Promise<SupplierDTO> {
      return unwrapApiResponse<SupplierDTO>(
        rpcClient.api.suppliers[':id'].$put({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
    getById(id: number, signal?: AbortSignal): Promise<SupplierDTO> {
      return unwrapApiResponse<SupplierDTO>(
        rpcClient.api.suppliers[':id'].$get(
          { param: { id: String(id) } },
          { init: { signal } },
        ),
      )
    },
  },

  purchases: {
    create(input: CreatePurchaseInput): Promise<PurchaseDetailDTO> {
      return unwrapApiResponse<PurchaseDetailDTO>(
        rpcClient.api.purchases.$post({ json: input }),
      )
    },
    list(
      params: {
        supplierId?: number
        paymentStatus?: PurchasePaymentStatus
        search?: string
        dateFrom?: string
        dateTo?: string
        page?: number
        pageSize?: number
      } = {},
      signal?: AbortSignal,
    ): Promise<PaginatedResult<PurchaseSummaryDTO>> {
      return unwrapApiResponse<PaginatedResult<PurchaseSummaryDTO>>(
        rpcClient.api.purchases.$get(
          {
            query: {
              supplierId:
                params.supplierId !== undefined ? String(params.supplierId) : undefined,
              paymentStatus: params.paymentStatus,
              search: params.search || undefined,
              dateFrom: params.dateFrom || undefined,
              dateTo: params.dateTo || undefined,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    getDetail(id: number, signal?: AbortSignal): Promise<PurchaseDetailDTO> {
      return unwrapApiResponse<PurchaseDetailDTO>(
        rpcClient.api.purchases[':id'].$get(
          { param: { id: String(id) } },
          { init: { signal } },
        ),
      )
    },
    updatePaymentStatus(
      id: number,
      input: UpdatePurchasePaymentStatusInput,
    ): Promise<PurchaseDetailDTO> {
      return unwrapApiResponse<PurchaseDetailDTO>(
        rpcClient.api.purchases[':id'].payment.$patch({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
  },

  customers: {
    list(
      params: {
        search?: string
        status?: 'all' | 'active' | 'inactive'
        page?: number
        pageSize?: number
      } = {},
      signal?: AbortSignal,
    ): Promise<PaginatedResult<CustomerDTO>> {
      return unwrapApiResponse<PaginatedResult<CustomerDTO>>(
        rpcClient.api.customers.$get(
          {
            query: {
              search: params.search || undefined,
              status: params.status,
              page: params.page !== undefined ? String(params.page) : undefined,
              pageSize:
                params.pageSize !== undefined ? String(params.pageSize) : undefined,
            },
          },
          { init: { signal } },
        ),
      )
    },
    getTop(signal?: AbortSignal): Promise<readonly CustomerDTO[]> {
      return unwrapApiResponse<readonly CustomerDTO[]>(
        rpcClient.api.customers.top.$get({}, { init: { signal } }),
      )
    },
    getByPhone(phone: string, signal?: AbortSignal): Promise<CustomerDTO | null> {
      return unwrapApiResponse<CustomerDTO | null>(
        rpcClient.api.customers['by-phone'][':phone'].$get(
          { param: { phone } },
          { init: { signal } },
        ),
      )
    },
    getDetail(id: number, signal?: AbortSignal): Promise<CustomerDTO> {
      return unwrapApiResponse<CustomerDTO>(
        rpcClient.api.customers[':id'].$get(
          { param: { id: String(id) } },
          { init: { signal } },
        ),
      )
    },
    listMutations(
      id: number,
      signal?: AbortSignal,
    ): Promise<readonly CustomerPointMutationDTO[]> {
      return unwrapApiResponse<readonly CustomerPointMutationDTO[]>(
        rpcClient.api.customers[':id'].mutations.$get(
          { param: { id: String(id) } },
          { init: { signal } },
        ),
      )
    },
    create(input: CreateCustomerInput): Promise<CustomerDTO> {
      return unwrapApiResponse<CustomerDTO>(
        rpcClient.api.customers.$post({ json: input }),
      )
    },
    update(id: number, input: UpdateCustomerInput): Promise<CustomerDTO> {
      return unwrapApiResponse<CustomerDTO>(
        rpcClient.api.customers[':id'].$patch({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
    adjustPoints(id: number, input: AdjustCustomerPointsInput): Promise<CustomerDTO> {
      return unwrapApiResponse<CustomerDTO>(
        rpcClient.api.customers[':id'].points.$post({
          param: { id: String(id) },
          json: input,
        }),
      )
    },
  },

  dashboard: {
    getMetrics(days = 14, signal?: AbortSignal): Promise<DashboardMetricsDTO> {
      return unwrapApiResponse<DashboardMetricsDTO>(
        rpcClient.api.dashboard.$get(
          { query: { days: String(days) } },
          { init: { signal } },
        ),
      )
    },
  },

  audit: {
    list(
      params: {
        page?: number
        pageSize?: number
        actionType?: AuditActionType
        actorUserId?: number
        dateFrom?: string
        dateTo?: string
      } = {},
      signal?: AbortSignal,
    ): Promise<PaginatedResult<AuditLogDTO>> {
      const query: Record<string, string> = {}
      if (params.page !== undefined) query.page = String(params.page)
      if (params.pageSize !== undefined) query.pageSize = String(params.pageSize)
      if (params.actionType) query.actionType = params.actionType
      if (params.actorUserId !== undefined) query.actorUserId = String(params.actorUserId)
      if (params.dateFrom) query.dateFrom = params.dateFrom
      if (params.dateTo) query.dateTo = params.dateTo

      return unwrapApiResponse<PaginatedResult<AuditLogDTO>>(
        rpcClient.api.audit.$get({ query }, { init: { signal } }),
      )
    },
  },

  backup: {
    list(signal?: AbortSignal): Promise<readonly BackupFileDTO[]> {
      return unwrapApiResponse<readonly BackupFileDTO[]>(
        rpcClient.api.backup.$get({}, { init: { signal } }),
      )
    },
    create(): Promise<BackupFileDTO> {
      return unwrapApiResponse<BackupFileDTO>(rpcClient.api.backup.$post({}))
    },
    getDownloadUrl(fileName: string): string {
      return `/api/backup/${encodeURIComponent(fileName)}`
    },
  },
}
