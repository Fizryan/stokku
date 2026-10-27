import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
  SALE_STATUS_LABELS,
  SALE_STATUSES,
  type SaleStatus,
} from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type {
  PaginatedResult,
  SaleDetailDTO,
  SaleSummaryDTO,
} from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconDownload, IconPrinter, IconReceipt } from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SearchInput } from '../../components/ui/SearchInput.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'
import { ReceiptModal } from './ReceiptModal.js'
import { VoidSaleModal } from './VoidSaleModal.js'

export function SalesHistoryPage() {
  const { can, refreshSession } = useAuth()
  const { showToast } = useToast()

  const canVoid = can('sales:void')
  const canExport = can('sales:export')
  const canSeeFinancials = can('dashboard:financials')

  const [salesData, setSalesData] = useState<PaginatedResult<SaleSummaryDTO> | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const [selectedReceipt, setSelectedReceipt] = useState<SaleDetailDTO | null>(null)
  const [voidTarget, setVoidTarget] = useState<SaleSummaryDTO | null>(null)

  const loadSales = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.sales.list(
          {
            search: search || undefined,
            status: (statusFilter || undefined) as SaleStatus | undefined,
            paymentMethod: (paymentMethodFilter || undefined) as
              | PaymentMethod
              | undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: 20,
          },
          signal,
        )
        setSalesData(res)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError ? err.message : 'Gagal memuat riwayat penjualan.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [search, statusFilter, paymentMethodFilter, dateFrom, dateTo, page, showToast],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadSales(controller.signal)
    return () => controller.abort()
  }, [loadSales])

  const handleOpenReceipt = async (saleId: number) => {
    setLoadingDetailId(saleId)
    try {
      const detail = await api.sales.getDetail(saleId)
      setSelectedReceipt(detail)
    } catch (err) {
      showToast(
        err instanceof ClientApiError ? err.message : 'Gagal mengambil rincian struk.',
        'error',
      )
    } finally {
      setLoadingDetailId(null)
    }
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const url = api.sales.buildExportCsvUrl({
        search: search || undefined,
        status: (statusFilter || undefined) as SaleStatus | undefined,
        paymentMethod: (paymentMethodFilter || undefined) as PaymentMethod | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })

      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok) {
        if (response.status === 401) {
          await refreshSession()
          showToast('Sesi Anda telah berakhir. Silakan login kembali.', 'warning')
          return
        }

        let message = `Gagal mengunduh CSV (HTTP ${response.status}).`
        try {
          const body = (await response.json()) as {
            error?: { message?: string }
          }
          if (body.error?.message) {
            message = body.error.message
          }
        } catch {
          // Keep fallback status message
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      anchor.href = objectUrl
      anchor.download = `laporan-penjualan-stokku-${stamp}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)

      showToast('Laporan CSV berhasil diunduh.', 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal mengekspor laporan CSV.',
        'error',
      )
    } finally {
      setExporting(false)
    }
  }

  const sales = salesData?.items ?? []

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-m3-on-surface">
            Riwayat Transaksi Penjualan
          </h2>
          <p class="text-xs text-m3-on-surface-variant">
            Telusuri invoice penjualan, cetak ulang struk, batalkan transaksi (Void), atau
            ekspor laporan CSV.
          </p>
        </div>

        {canExport && (
          <Button
            variant="tonal"
            size="sm"
            loading={exporting}
            onClick={() => void handleExportCsv()}
          >
            <IconDownload class="w-4 h-4" />
            <span>Ekspor CSV</span>
          </Button>
        )}
      </div>

      <Card class="p-4 sm:p-5 flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div class="lg:col-span-4 flex flex-col gap-1.5">
            <span class="text-xs font-medium text-m3-on-surface-variant tracking-wide">
              Pencarian Invoice / Pelanggan
            </span>
            <SearchInput
              placeholder="Cari nomor struk (INV-...) atau nama pelanggan..."
              ariaLabel="Pencarian invoice atau nama pelanggan"
              value={search}
              onDebouncedChange={(val) => {
                setSearch(val)
                setPage(1)
              }}
            />
          </div>

          <SelectField
            label="Status"
            value={statusFilter}
            options={[
              { value: '', label: 'Semua Status' },
              ...SALE_STATUSES.map((st) => ({
                value: st,
                label: SALE_STATUS_LABELS[st],
              })),
            ]}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
            class="lg:col-span-2"
          />

          <SelectField
            label="Pembayaran"
            value={paymentMethodFilter}
            options={[
              { value: '', label: 'Semua Metode' },
              ...PAYMENT_METHODS.map((pm) => ({
                value: pm,
                label: PAYMENT_METHOD_LABELS[pm],
              })),
            ]}
            onValueChange={(v) => {
              setPaymentMethodFilter(v)
              setPage(1)
            }}
            class="lg:col-span-2"
          />

          <TextField
            label="Dari Tanggal"
            type="date"
            value={dateFrom}
            onValueChange={(v) => {
              setDateFrom(v)
              setPage(1)
            }}
            class="lg:col-span-2"
          />

          <TextField
            label="Sampai Tanggal"
            type="date"
            value={dateTo}
            onValueChange={(v) => {
              setDateTo(v)
              setPage(1)
            }}
            class="lg:col-span-2"
          />
        </div>

        {loading && !salesData ? (
          <div class="py-12 text-center text-xs text-m3-on-surface-variant">
            Memuat riwayat penjualan...
          </div>
        ) : sales.length === 0 ? (
          <EmptyState
            icon={<IconReceipt />}
            title="Belum ada transaksi yang sesuai"
            description="Transaksi kasir (POS) yang selesai maupun dibatalkan akan tampil secara kronologis di halaman ini."
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-m3-outline-variant text-m3-on-surface-variant uppercase tracking-wider text-[11px]">
                    <th class="py-3 px-3 font-semibold">Invoice &amp; Waktu</th>
                    <th class="py-3 px-3 font-semibold">Kasir / Pelanggan</th>
                    <th class="py-3 px-3 font-semibold">Metode</th>
                    <th class="py-3 px-3 font-semibold text-right">Item</th>
                    <th class="py-3 px-3 font-semibold text-right">Total</th>
                    {canSeeFinancials && (
                      <th class="py-3 px-3 font-semibold text-right">Laba Kotor</th>
                    )}
                    <th class="py-3 px-3 font-semibold text-center">Status</th>
                    <th class="py-3 px-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant/50">
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      class="hover:bg-m3-surface-container-low/70 transition-colors"
                    >
                      <td class="py-3 px-3">
                        <p class="font-semibold text-m3-on-surface tabular-nums">
                          {sale.invoiceNumber}
                        </p>
                        <p class="text-m3-on-surface-variant tabular-nums mt-0.5">
                          {formatDateTime(sale.createdAt)}
                        </p>
                      </td>
                      <td class="py-3 px-3">
                        <p class="font-medium text-m3-on-surface">{sale.cashierName}</p>
                        <p class="text-m3-on-surface-variant">
                          {sale.customerName
                            ? `Pelanggan: ${sale.customerName}`
                            : 'Pelanggan Umum'}
                        </p>
                      </td>
                      <td class="py-3 px-3 text-m3-on-surface">
                        {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                      </td>
                      <td class="py-3 px-3 text-right tabular-nums text-m3-on-surface-variant">
                        {formatInteger(sale.totalQty)} unit ({sale.itemCount} baris)
                      </td>
                      <td class="py-3 px-3 text-right font-semibold tabular-nums text-m3-on-surface">
                        {formatRupiah(sale.totalAmount)}
                        {sale.discountAmount > 0 && (
                          <p class="text-[11px] font-normal text-m3-success">
                            Diskon -{formatRupiah(sale.discountAmount)}
                          </p>
                        )}
                      </td>
                      {canSeeFinancials && (
                        <td class="py-3 px-3 text-right tabular-nums">
                          {sale.status === 'VOIDED' ? (
                            <span class="text-m3-on-surface-variant">—</span>
                          ) : sale.grossProfitAmount !== null ? (
                            <span
                              class={
                                sale.grossProfitAmount >= 0
                                  ? 'font-medium text-m3-success'
                                  : 'font-medium text-m3-danger'
                              }
                            >
                              {formatRupiah(sale.grossProfitAmount)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      <td class="py-3 px-3 text-center">
                        <Badge tone={sale.status === 'COMPLETED' ? 'success' : 'danger'}>
                          {SALE_STATUS_LABELS[sale.status]}
                        </Badge>
                      </td>
                      <td class="py-3 px-3 text-right">
                        <div class="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="outlined"
                            size="sm"
                            loading={loadingDetailId === sale.id}
                            onClick={() => void handleOpenReceipt(sale.id)}
                          >
                            <IconPrinter class="w-3.5 h-3.5" />
                            <span>Struk</span>
                          </Button>
                          {canVoid && sale.status === 'COMPLETED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              class="text-m3-danger hover:text-m3-danger"
                              onClick={() => setVoidTarget(sale)}
                            >
                              Void
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div class="md:hidden flex flex-col gap-3">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  class="rounded-2xl border border-m3-outline-variant/70 p-3.5 flex flex-col gap-2.5 bg-m3-surface-container-lowest text-xs"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="font-semibold text-sm text-m3-on-surface tabular-nums">
                        {sale.invoiceNumber}
                      </p>
                      <p class="text-m3-on-surface-variant tabular-nums">
                        {formatDateTime(sale.createdAt)} · {sale.cashierName}
                      </p>
                    </div>
                    <Badge tone={sale.status === 'COMPLETED' ? 'success' : 'danger'}>
                      {SALE_STATUS_LABELS[sale.status]}
                    </Badge>
                  </div>

                  <div class="flex items-center justify-between pt-2 border-t border-m3-outline-variant/40 tabular-nums">
                    <span class="text-m3-on-surface-variant">
                      {PAYMENT_METHOD_LABELS[sale.paymentMethod]} ·{' '}
                      {formatInteger(sale.totalQty)} unit
                    </span>
                    <span class="text-sm font-bold text-m3-on-surface">
                      {formatRupiah(sale.totalAmount)}
                    </span>
                  </div>

                  <div class="flex items-center justify-end gap-2 pt-1">
                    {canVoid && sale.status === 'COMPLETED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        class="text-m3-danger"
                        onClick={() => setVoidTarget(sale)}
                      >
                        Void
                      </Button>
                    )}
                    <Button
                      variant="tonal"
                      size="sm"
                      loading={loadingDetailId === sale.id}
                      onClick={() => void handleOpenReceipt(sale.id)}
                    >
                      <IconPrinter class="w-3.5 h-3.5" />
                      <span>Lihat Struk</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {salesData && <Pagination meta={salesData.meta} onPageChange={setPage} />}
          </>
        )}
      </Card>

      <ReceiptModal
        sale={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        onRequestVoid={
          canVoid
            ? (detail) => {
                setSelectedReceipt(null)
                setVoidTarget(detail)
              }
            : undefined
        }
      />

      <VoidSaleModal
        targetSale={voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoidSuccess={(updatedDetail) => {
          setSelectedReceipt(updatedDetail)
          void loadSales()
        }}
      />
    </div>
  )
}
