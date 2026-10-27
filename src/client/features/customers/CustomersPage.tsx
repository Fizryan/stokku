import { useCallback, useEffect, useMemo, useState } from 'hono/jsx/dom'
import { LOYALTY_RULES } from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type { CustomerDTO, PaginationMeta } from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconHeart, IconPlus, IconRefresh, IconStar } from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SelectField, type SelectOption } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'
import { CustomerDetailModal } from './CustomerDetailModal.js'
import { CustomerModal } from './CustomerModal.js'

export function CustomersPage() {
  const { can } = useAuth()
  const { showToast } = useToast()
  const canManage = can('customers:manage')

  const [customers, setCustomers] = useState<readonly CustomerDTO[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  })

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customerToEdit, setCustomerToEdit] = useState<CustomerDTO | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CustomerDTO | null>(null)

  const statusOptions = useMemo<readonly SelectOption[]>(() => {
    return [
      { value: 'all', label: 'Semua Status' },
      { value: 'active', label: 'Pelanggan Aktif' },
      { value: 'inactive', label: 'Pelanggan Nonaktif' },
    ]
  }, [])

  const loadCustomers = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.customers.list(
          {
            search: search.trim() || undefined,
            status: statusFilter,
            page,
            pageSize: 20,
          },
          signal,
        )
        setCustomers(res.items)
        setMeta(res.meta)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError ? err.message : 'Gagal memuat daftar pelanggan.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [search, statusFilter, page, showToast],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadCustomers(controller.signal)
    return () => controller.abort()
  }, [loadCustomers])

  const handleResetFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  // Aggregate stats on loaded page
  const stats = useMemo(() => {
    let totalPoints = 0
    let totalSpend = 0
    for (const c of customers) {
      totalPoints += c.pointsBalance
      totalSpend += c.totalSpend
    }
    return { totalPoints, totalSpend }
  }, [customers])

  return (
    <div class="space-y-6">
      {/* Top Header & Actions */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-m3-on-surface flex items-center gap-2">
            <IconHeart class="w-6 h-6 text-m3-primary" />
            <span>Pelanggan & Poin Loyalitas</span>
          </h1>
          <p class="text-xs text-m3-on-surface-variant mt-1">
            Program retensi pelanggan, registrasi nomor WhatsApp member, dan histori
            penukaran reward poin belanja.
          </p>
        </div>

        <div>
          {canManage && (
            <Button
              variant="filled"
              size="sm"
              onClick={() => {
                setCustomerToEdit(null)
                setIsModalOpen(true)
              }}
            >
              <IconPlus class="w-4 h-4" />
              <span>+ Tambah Pelanggan</span>
            </Button>
          )}
        </div>
      </div>

      {/* Aggregate Stat Cards */}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card class="p-4 border border-m3-outline-variant bg-m3-surface-container-low">
          <p class="text-xs font-medium text-m3-on-surface-variant">
            Total Pelanggan Terdaftar
          </p>
          <p class="text-2xl font-bold text-m3-on-surface mt-1">
            {formatInteger(meta.totalItems)}
          </p>
          <p class="text-[11px] text-m3-on-surface-variant mt-1">
            Halaman {meta.page} dari {meta.totalPages}
          </p>
        </Card>

        <Card class="p-4 border border-m3-outline-variant bg-m3-surface-container-low">
          <div class="flex items-center gap-1.5 text-xs font-medium text-m3-on-surface-variant">
            <IconStar class="w-4 h-4 text-amber-500" />
            <span>Poin Loyalitas Beredar (Halaman Ini)</span>
          </div>
          <p class="text-2xl font-bold text-m3-primary mt-1">
            {formatInteger(stats.totalPoints)} Poin
          </p>
          <p class="text-[11px] text-m3-on-surface-variant mt-1">
            Nilai tukar belanja:{' '}
            {formatRupiah(stats.totalPoints * LOYALTY_RULES.POINT_VALUE_IN_RUPIAH)}
          </p>
        </Card>

        <Card class="p-4 border border-m3-outline-variant bg-m3-surface-container-low">
          <p class="text-xs font-medium text-m3-on-surface-variant">
            Akumulasi Belanja Member (Halaman Ini)
          </p>
          <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatRupiah(stats.totalSpend)}
          </p>
          <p class="text-[11px] text-m3-on-surface-variant mt-1">
            Dari {customers.length} pelanggan ditampilkan
          </p>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card class="p-4 border border-m3-outline-variant">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div class="sm:col-span-2">
            <TextField
              label="Cari Pelanggan"
              placeholder="Cari nama pelanggan atau nomor WhatsApp..."
              value={search}
              onValueChange={(val) => {
                setSearch(val)
                setPage(1)
              }}
            />
          </div>

          <div>
            <SelectField
              label="Status Pelanggan"
              value={statusFilter}
              options={statusOptions}
              onValueChange={(val) => {
                setStatusFilter(val as 'all' | 'active' | 'inactive')
                setPage(1)
              }}
            />
          </div>
        </div>

        {(search || statusFilter !== 'all') && (
          <div class="mt-3 pt-3 border-t border-m3-outline-variant flex items-center justify-between text-xs">
            <span class="text-m3-on-surface-variant">Filter aktif diterapkan</span>
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <IconRefresh class="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </Button>
          </div>
        )}
      </Card>

      {/* Customers Table */}
      <Card class="border border-m3-outline-variant overflow-hidden">
        {loading ? (
          <div class="p-12 text-center">
            <div
              class="w-8 h-8 rounded-full border-3 border-m3-primary border-t-transparent animate-spin mx-auto"
              aria-hidden="true"
            />
            <p class="text-xs font-medium text-m3-on-surface-variant mt-3">
              Memuat data pelanggan...
            </p>
          </div>
        ) : customers.length === 0 ? (
          <div class="p-8">
            <EmptyState
              icon={<IconHeart class="w-10 h-10 text-m3-on-surface-variant" />}
              title="Belum Ada Pelanggan"
              description="Daftarkan member pelanggan untuk mulai mengumpulkan poin reward setiap transaksi belanja."
              action={
                canManage ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setCustomerToEdit(null)
                      setIsModalOpen(true)
                    }}
                  >
                    + Tambah Pelanggan Pertama
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
                    <th class="py-3 px-4">Nama Pelanggan</th>
                    <th class="py-3 px-4">No. Telepon / WA</th>
                    <th class="py-3 px-4 text-right">Saldo Poin</th>
                    <th class="py-3 px-4 text-right">Total Belanja</th>
                    <th class="py-3 px-4 text-center">Kunjungan</th>
                    <th class="py-3 px-4 text-center">Status</th>
                    <th class="py-3 px-4">Terdaftar</th>
                    <th class="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      class="hover:bg-m3-surface-container-low/60 transition-colors"
                    >
                      <td class="py-3 px-4">
                        <p class="font-bold text-m3-on-surface">{c.name}</p>
                        {c.email && (
                          <p class="text-[11px] text-m3-on-surface-variant">{c.email}</p>
                        )}
                      </td>
                      <td class="py-3 px-4 font-mono font-medium text-m3-on-surface">
                        {c.phone}
                      </td>
                      <td class="py-3 px-4 text-right font-bold text-m3-primary">
                        {formatInteger(c.pointsBalance)} Poin
                      </td>
                      <td class="py-3 px-4 text-right font-semibold text-m3-on-surface">
                        {formatRupiah(c.totalSpend)}
                      </td>
                      <td class="py-3 px-4 text-center text-m3-on-surface">
                        {formatInteger(c.visitCount)}x
                      </td>
                      <td class="py-3 px-4 text-center">
                        <Badge tone={c.isActive ? 'success' : 'neutral'}>
                          {c.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      <td class="py-3 px-4 text-m3-on-surface-variant">
                        {formatDateTime(c.createdAt)}
                      </td>
                      <td class="py-3 px-4 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outlined"
                            size="sm"
                            onClick={() => setSelectedDetail(c)}
                          >
                            Rincian
                          </Button>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCustomerToEdit(c)
                                setIsModalOpen(true)
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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
      <CustomerModal
        open={isModalOpen}
        customerToEdit={customerToEdit}
        onClose={() => {
          setIsModalOpen(false)
          setCustomerToEdit(null)
        }}
        onCustomerSaved={() => {
          void loadCustomers()
        }}
      />

      <CustomerDetailModal
        customer={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        onCustomerUpdated={(updated) => {
          setSelectedDetail(updated)
          void loadCustomers()
        }}
      />
    </div>
  )
}
