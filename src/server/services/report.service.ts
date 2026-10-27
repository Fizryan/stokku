import {
  hasPermission,
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
} from '../../shared/constants.js'
import type {
  DashboardQueryInput,
  SalesExportQueryInput,
} from '../../shared/schemas/index.js'
import type { DashboardMetricsDTO, UserDTO } from '../../shared/types.js'
import type { ReportServiceContract } from '../contracts/services.contract.js'
import type { DashboardRepository } from '../repositories/dashboard.repo.js'
import type { SaleRepository } from '../repositories/sale.repo.js'

export interface ReportServiceDeps {
  readonly dashboardRepo: DashboardRepository
  readonly saleRepo: SaleRepository
}

function escapeCsvCell(rawValue: string | number | null | undefined): string {
  if (rawValue === null || rawValue === undefined) {
    return ''
  }
  if (typeof rawValue === 'number') {
    return String(rawValue)
  }

  let text = rawValue
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export class ReportService implements ReportServiceContract {
  private readonly deps: ReportServiceDeps

  public constructor(deps: ReportServiceDeps) {
    this.deps = deps
  }

  public getDashboardMetrics(
    actor: UserDTO,
    query: DashboardQueryInput,
  ): DashboardMetricsDTO {
    const includeFinancials = hasPermission(actor.role, 'dashboard:financials')
    const canViewAllSales = hasPermission(actor.role, 'sales:view_all')
    const canViewSales = hasPermission(actor.role, 'sales:view')

    const recentSales = canViewSales
      ? this.deps.saleRepo.listPaginated(
          {
            page: 1,
            pageSize: 6,
            search: undefined,
            status: undefined,
            paymentMethod: undefined,
            dateFrom: undefined,
            dateTo: undefined,
          },
          {
            includeFinancials,
            restrictToCashierId: canViewAllSales ? undefined : actor.id,
          },
        ).items
      : []

    return this.deps.dashboardRepo.getMetrics({
      days: query.days,
      includeFinancials,
      recentSales,
    })
  }

  public exportSalesCsv(query: SalesExportQueryInput): string {
    const headers = [
      'No Invoice',
      'Waktu Transaksi (UTC)',
      'Status',
      'Kasir',
      'Pelanggan',
      'Metode Pembayaran',
      'Jumlah Jenis Item',
      'Total Qty',
      'Subtotal (Rp)',
      'Diskon (Rp)',
      'Total Tagihan (Rp)',
      'Estimasi Laba Kotor (Rp)',
      'Catatan Pembatalan',
    ]

    const lines: string[] = [`\uFEFF${headers.join(',')}`]

    for (const row of this.deps.saleRepo.iterateForExport(query)) {
      lines.push(
        [
          escapeCsvCell(row.invoiceNumber),
          escapeCsvCell(row.createdAt),
          escapeCsvCell(SALE_STATUS_LABELS[row.status]),
          escapeCsvCell(row.cashierName),
          escapeCsvCell(row.customerName),
          escapeCsvCell(PAYMENT_METHOD_LABELS[row.paymentMethod]),
          escapeCsvCell(row.itemCount),
          escapeCsvCell(row.totalQty),
          escapeCsvCell(row.subtotalAmount),
          escapeCsvCell(row.discountAmount),
          escapeCsvCell(row.totalAmount),
          escapeCsvCell(row.grossProfitAmount),
          escapeCsvCell(row.voidReason),
        ].join(','),
      )
    }

    return lines.join('\r\n')
  }
}
