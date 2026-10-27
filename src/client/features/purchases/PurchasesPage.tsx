import { useCallback, useEffect, useMemo, useState } from 'hono/jsx/dom'
import {
  PURCHASE_PAYMENT_STATUS_LABELS,
  PURCHASE_PAYMENT_STATUSES,
  type PurchasePaymentStatus,
} from '../../../shared/constants.js'
import {
  formatDateShort,
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type {
  PaginationMeta,
  PurchaseDetailDTO,
  PurchaseSummaryDTO,
  SupplierDTO,
} from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconPlus, IconRefresh, IconTruck } from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SelectField, type SelectOption } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'
import { PurchaseDetailModal } from './PurchaseDetailModal.js'
import { PurchaseInvoiceModal } from './PurchaseInvoiceModal.js'
import { SupplierManagerModal } from './SupplierManagerModal.js'

export function PurchasesPage() {
  const { can } = useAuth()
  const { showToast } = useToast()

  const canManagePurchases = can('purchases:manage')
  const canManageSuppliers = can('suppliers:manage')

  const [purchases, setPurchases] = useState<readonly PurchaseSummaryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<readonly SupplierDTO[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [supplierIdFilter, setSupplierIdFilter] = useState<string>('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  })

  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] =
    useState<PurchaseDetailDTO | null>(null)
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null)

  // Load active suppliers for dropdown filter
  const loadSuppliers = useCallback(async () => {
    try {
      const list = await api.suppliers.listActive()
      setSuppliers(list)
    } catch {
      // Non-blocking lookup fail
    }
  }, [])

  useEffect(() => {
    void loadSuppliers()
  }, [loadSuppliers])

  const supplierOptions = useMemo<readonly SelectOption[]>(() => {
    return [
      { value: '', label: 'Semua Supplier' },
      ...suppliers.map((s) => ({ value: String(s.id), label: s.name })),
    ]
  }, [suppliers])

  const paymentStatusOptions = useMemo<readonly SelectOption[]>(() => {
    return [
      { value: '', label: 'Semua Status' },
      ...PURCHASE_PAYMENT_STATUSES.map((status) => ({
        value: status,
        label: PURCHASE_PAYMENT_STATUS_LABELS[status],
      })),
    ]
  }, [])

  const loadPurchases = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.purchases.list(
          {
            search: search.trim() || undefined,
            supplierId: supplierIdFilter ? Number(supplierIdFilter) : undefined,
            paymentStatus: (paymentStatusFilter || undefined) as
              | PurchasePaymentStatus
              | undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: 20,
          },
          signal,
        )
        setPurchases(res.items)
        setMeta(res.meta)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError
            ? err.message
            : 'Gagal memuat daftar faktur pembelian.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [search, supplierIdFilter, paymentStatusFilter, dateFrom, dateTo, page, showToast],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadPurchases(controller.signal)
    return () => controller.abort()
  }, [loadPurchases])

  const handleOpenDetail = async (purchaseId: number) => {
    setLoadingDetailId(purchaseId)
    try {
      const detail = await api.purchases.getDetail(purchaseId)
      setSelectedPurchaseDetail(detail)
    } catch (err) {
      showToast(
        err instanceof ClientApiError
          ? err.message
          : 'Gagal memuat rincian faktur pembelian.',
        'error',
      )
    } finally {
      setLoadingDetailId(null)
    }
  }

  const handleResetFilters = () => {
    setSearch('')
    setSupplierIdFilter('')
    setPaymentStatusFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  // Aggregate Stats on Current Loaded List
  const stats = useMemo(() => {
    let totalPurchases = 0
    let totalDebt = 0
    let unpaidCount = 0

    for (const p of purchases) {
      totalPurchases += p.subtotalAmount
      if (p.paymentStatus === 'UNPAID') {
        totalDebt += p.subtotalAmount
        unpaidCount += 1
      }
    }

    return {
      totalPurchases,
      totalDebt,
      unpaidCount,
    }
  }, [purchases])

  return (
    <div class="space-y-6">
      {/* Top Header & Actions */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-m3-on-surface flex items-center gap-2">
            <IconTruck class="w-6 h-6 text-m3-primary" />
            <span>Faktur Pembelian & Supplier</span>
          </h1>
          <p class="text-xs text-m3-on-surface-variant mt-1">
            Pencatatan barang masuk restock, kalkulasi HPP tertimbang otomatis, dan
            pelacakan hutang tempo supplier.
          </p>
        </div>

        <div class="flex items-center gap-2">
          {canManageSuppliers && (
            <Button
              variant="outlined"
              size="sm"
              onClick={() => setIsSupplierModalOpen(true)}
            >
              <IconTruck class="w-4 h-4" />
              <span>Kelola Supplier</span>
            </Button>
          )}

          {canManagePurchases && (
            <Button
              variant="filled"
              size="sm"
              onClick={() => setIsInvoiceModalOpen(true)}
            >
              <IconPlus class="w-4 h-4" />
              <span>+ Faktur Pembelian</span>
            </Button>
          )}
        </div>
      </div>

      {/* Aggregate Stat Cards */}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card class="p-4 border border-m3-outline-variant bg-m3-surface-container-low">
          <p class="text-xs font-medium text-m3-on-surface-variant">
            Total Faktur Tercatat
          </p>
          <p class="text-2xl font-bold text-m3-on-surface mt-1">
            {formatInteger(meta.totalItems)}
          </p>
          <p class="text-[11px] text-m3-on-surface-variant mt-1">
            Halaman {meta.page} dari {meta.totalPages}
          </p>
        </Card>

        <Card class="p-4 border border-m3-outline-variant bg-m3-surface-container-low">
          <p class="text-xs font-medium text-m3-on-surface-variant">
            Nilai Pembelian (Halaman Ini)
          </p>
          <p class="text-2xl font-bold text-m3-primary mt-1">
            {formatRupiah(stats.totalPurchases)}
          </p>
          <p class="text-[11px] text-m3-on-surface-variant mt-1">
            Dari {purchases.length} transaksi ditampilkan
          </p>
        </Card>

        <Card class="p-4 border border-m3-outline-variant bg-m3-surface-container-low">
          <p class="text-xs font-medium text-m3-on-surface-variant">
            Hutang / Tempo Aktif (Halaman Ini)
          </p>
          <p class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {formatRupiah(stats.totalDebt)}
          </p>
          <p class="text-[11px] text-m3-on-surface-variant mt-1">
            {stats.unpaidCount} faktur belum lunas
          </p>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card class="p-4 border border-m3-outline-variant">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div class="sm:col-span-2 md:col-span-1">
            <TextField
              label="Cari Faktur / Supplier"
              placeholder="No. faktur..."
              value={search}
              onValueChange={(val) => {
                setSearch(val)
                setPage(1)
              }}
            />
          </div>

          <div>
            <SelectField
              label="Filter Supplier"
              value={supplierIdFilter}
              options={supplierOptions}
              onValueChange={(val) => {
                setSupplierIdFilter(val)
                setPage(1)
              }}
            />
          </div>

          <div>
            <SelectField
              label="Status Pembayaran"
              value={paymentStatusFilter}
              options={paymentStatusOptions}
              onValueChange={(val) => {
                setPaymentStatusFilter(val)
                setPage(1)
              }}
            />
          </div>

          <div>
            <TextField
              label="Dari Tanggal"
              type="date"
              value={dateFrom}
              onValueChange={(val) => {
                setDateFrom(val)
                setPage(1)
              }}
            />
          </div>

          <div>
            <TextField
              label="Sampai Tanggal"
              type="date"
              value={dateTo}
              onValueChange={(val) => {
                setDateTo(val)
                setPage(1)
              }}
            />
          </div>
        </div>

        {(search || supplierIdFilter || paymentStatusFilter || dateFrom || dateTo) && (
          <div class="mt-3 pt-3 border-t border-m3-outline-variant flex items-center justify-between text-xs">
            <span class="text-m3-on-surface-variant">Filter aktif diterapkan</span>
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <IconRefresh class="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </Button>
          </div>
        )}
      </Card>

      {/* Main Content Table */}
      <Card class="border border-m3-outline-variant overflow-hidden">
        {loading ? (
          <div class="p-12 text-center">
            <div
              class="w-8 h-8 rounded-full border-3 border-m3-primary border-t-transparent animate-spin mx-auto"
              aria-hidden="true"
            />
            <p class="text-xs font-medium text-m3-on-surface-variant mt-3">
              Memuat data faktur pembelian...
            </p>
          </div>
        ) : purchases.length === 0 ? (
          <div class="p-8">
            <EmptyState
              icon={<IconTruck class="w-10 h-10 text-m3-on-surface-variant" />}
              title="Belum Ada Faktur Pembelian"
              description="Catat faktur barang masuk dari supplier untuk menambah stok dan memperbarui HPP secara otomatis."
              action={
                canManagePurchases ? (
                  <Button size="sm" onClick={() => setIsInvoiceModalOpen(true)}>
                    + Catat Faktur Pertama
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-m3-surface-container text-m3-on-surface-variant font-semibold">
                  <tr>
                    <th class="py-3 px-4">No. Faktur</th>
                    <th class="py-3 px-4">Supplier</th>
                    <th class="py-3 px-4">Waktu Penerimaan</th>
                    <th class="py-3 px-4">Jatuh Tempo</th>
                    <th class="py-3 px-4 text-right">Barang Masuk</th>
                    <th class="py-3 px-4 text-right">Total Tagihan</th>
                    <th class="py-3 px-4 text-center">Status</th>
                    <th class="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant">
                  {purchases.map((p) => {
                    const isUnpaid = p.paymentStatus === 'UNPAID'
                    return (
                      <tr
                        key={p.id}
                        class="hover:bg-m3-surface-container-low/60 transition-colors"
                      >
                        <td class="py-3 px-4 font-bold font-mono text-m3-on-surface">
                          {p.invoiceNumber}
                        </td>
                        <td class="py-3 px-4">
                          <p class="font-semibold text-m3-on-surface">{p.supplierName}</p>
                          <p class="text-[11px] text-m3-on-surface-variant">
                            Penerima: {p.receiverName}
                          </p>
                        </td>
                        <td class="py-3 px-4 text-m3-on-surface">
                          {formatDateTime(p.createdAt)}
                        </td>
                        <td class="py-3 px-4">
                          {p.dueDate ? (
                            <span
                              class={
                                isUnpaid
                                  ? 'font-semibold text-amber-600 dark:text-amber-400'
                                  : 'text-m3-on-surface-variant'
                              }
                            >
                              {formatDateShort(p.dueDate)}
                            </span>
                          ) : (
                            <span class="text-m3-on-surface-variant">-</span>
                          )}
                        </td>
                        <td class="py-3 px-4 text-right text-m3-on-surface">
                          <p class="font-medium">{formatInteger(p.totalQty)} unit</p>
                          <p class="text-[11px] text-m3-on-surface-variant">
                            ({formatInteger(p.itemCount)} SKU)
                          </p>
                        </td>
                        <td class="py-3 px-4 text-right font-extrabold text-sm text-m3-on-surface">
                          {formatRupiah(p.subtotalAmount)}
                        </td>
                        <td class="py-3 px-4 text-center">
                          <Badge tone={isUnpaid ? 'warning' : 'success'}>
                            {PURCHASE_PAYMENT_STATUS_LABELS[p.paymentStatus]}
                          </Badge>
                        </td>
                        <td class="py-3 px-4 text-right">
                          <Button
                            variant="outlined"
                            size="sm"
                            loading={loadingDetailId === p.id}
                            onClick={() => handleOpenDetail(p.id)}
                          >
                            Lihat Rincian
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div class="p-4 border-t border-m3-outline-variant">
              <Pagination meta={meta} onPageChange={setPage} />
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      <SupplierManagerModal
        open={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        onSupplierMutated={() => {
          void loadSuppliers()
          void loadPurchases()
        }}
      />

      <PurchaseInvoiceModal
        open={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onManageSuppliersClick={() => {
          setIsInvoiceModalOpen(false)
          setIsSupplierModalOpen(true)
        }}
        onPurchaseCreated={(created) => {
          setIsInvoiceModalOpen(false)
          setSelectedPurchaseDetail(created)
          void loadPurchases()
        }}
      />

      <PurchaseDetailModal
        purchase={selectedPurchaseDetail}
        onClose={() => setSelectedPurchaseDetail(null)}
        onStatusUpdated={(updated) => {
          setSelectedPurchaseDetail(updated)
          void loadPurchases()
        }}
      />
    </div>
  )
}
