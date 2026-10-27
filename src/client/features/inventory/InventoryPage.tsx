import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import {
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
  type MovementType,
} from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type {
  PaginatedResult,
  ProductDTO,
  StockMovementDTO,
} from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge, type BadgeTone } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconInventory, IconPlus } from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'
import { StockMovementModal } from './StockMovementModal.js'

const MOVEMENT_BADGE_TONES: Readonly<Record<MovementType, BadgeTone>> = {
  INITIAL: 'neutral',
  IN_PURCHASE: 'success',
  OUT_SALE: 'primary',
  ADJUSTMENT_OPNAME: 'warning',
  OUT_DAMAGED: 'danger',
  VOID_REVERSAL: 'warning',
}

export function InventoryPage() {
  const { can } = useAuth()
  const { showToast } = useToast()
  const canManage = can('inventory:manage')

  const [products, setProducts] = useState<readonly ProductDTO[]>([])
  const [movementsData, setMovementsData] =
    useState<PaginatedResult<StockMovementDTO> | null>(null)
  const [loading, setLoading] = useState(true)

  const [productIdFilter, setProductIdFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)

  const loadProductDropdown = useCallback(async () => {
    try {
      const res = await api.products.list({ status: 'all', page: 1, pageSize: 100 })
      setProducts(res.items)
    } catch {
      // Fallback empty
    }
  }, [])

  const loadMovements = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.inventory.listMovements(
          {
            productId: productIdFilter ? Number.parseInt(productIdFilter, 10) : undefined,
            movementType: (typeFilter || undefined) as MovementType | undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: 20,
          },
          signal,
        )
        setMovementsData(res)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        showToast(
          err instanceof ClientApiError
            ? err.message
            : 'Gagal memuat histori Kartu Stok.',
          'error',
        )
      } finally {
        setLoading(false)
      }
    },
    [productIdFilter, typeFilter, dateFrom, dateTo, page, showToast],
  )

  useEffect(() => {
    void loadProductDropdown()
  }, [loadProductDropdown])

  useEffect(() => {
    const controller = new AbortController()
    void loadMovements(controller.signal)
    return () => controller.abort()
  }, [loadMovements])

  const movements = movementsData?.items ?? []

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-m3-on-surface">
            Mutasi &amp; Kartu Stok (Audit Ledger)
          </h2>
          <p class="text-xs text-m3-on-surface-variant">
            Rekam jejak seluruh pergerakan stok masuk, penjualan, opname, hingga barang
            rusak secara permanen.
          </p>
        </div>

        {canManage && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <IconPlus class="w-4 h-4" />
            <span>Catat Mutasi Stok</span>
          </Button>
        )}
      </div>

      <Card class="p-4 sm:p-5 flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <SelectField
            label="Filter Produk"
            value={productIdFilter}
            options={[
              { value: '', label: 'Semua Produk' },
              ...products.map((p) => ({
                value: String(p.id),
                label: `${p.sku} — ${p.name}`,
              })),
            ]}
            onValueChange={(v) => {
              setProductIdFilter(v)
              setPage(1)
            }}
          />

          <SelectField
            label="Jenis Mutasi"
            value={typeFilter}
            options={[
              { value: '', label: 'Semua Jenis Mutasi' },
              ...MOVEMENT_TYPES.map((t) => ({
                value: t,
                label: MOVEMENT_TYPE_LABELS[t],
              })),
            ]}
            onValueChange={(v) => {
              setTypeFilter(v)
              setPage(1)
            }}
          />

          <TextField
            label="Dari Tanggal"
            type="date"
            value={dateFrom}
            onValueChange={(v) => {
              setDateFrom(v)
              setPage(1)
            }}
          />

          <TextField
            label="Sampai Tanggal"
            type="date"
            value={dateTo}
            onValueChange={(v) => {
              setDateTo(v)
              setPage(1)
            }}
          />
        </div>

        {loading && !movementsData ? (
          <div class="py-12 text-center text-xs text-m3-on-surface-variant">
            Memuat histori Kartu Stok...
          </div>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={<IconInventory />}
            title="Belum ada catatan mutasi stok"
            description="Setiap stok awal produk, restock gudang, opname, maupun transaksi POS akan tercatat otomatis di sini."
          />
        ) : (
          <>
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-m3-outline-variant text-m3-on-surface-variant uppercase tracking-wider text-[11px]">
                    <th class="py-3 px-3 font-semibold">Waktu</th>
                    <th class="py-3 px-3 font-semibold">Produk</th>
                    <th class="py-3 px-3 font-semibold">Jenis Mutasi</th>
                    <th class="py-3 px-3 font-semibold text-right">Awal</th>
                    <th class="py-3 px-3 font-semibold text-right">Perubahan</th>
                    <th class="py-3 px-3 font-semibold text-right">Saldo Akhir</th>
                    <th class="py-3 px-3 font-semibold">Keterangan &amp; Petugas</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant/50">
                  {movements.map((mv) => (
                    <tr
                      key={mv.id}
                      class="hover:bg-m3-surface-container-low/70 transition-colors"
                    >
                      <td class="py-3 px-3 text-m3-on-surface-variant whitespace-nowrap tabular-nums">
                        {formatDateTime(mv.createdAt)}
                      </td>
                      <td class="py-3 px-3">
                        <p class="font-semibold text-m3-on-surface">{mv.productName}</p>
                        <p class="text-m3-on-surface-variant tabular-nums">
                          {mv.productSku}
                        </p>
                      </td>
                      <td class="py-3 px-3">
                        <Badge tone={MOVEMENT_BADGE_TONES[mv.movementType]}>
                          {MOVEMENT_TYPE_LABELS[mv.movementType]}
                        </Badge>
                      </td>
                      <td class="py-3 px-3 text-right tabular-nums text-m3-on-surface-variant">
                        {formatInteger(mv.qtyBefore)}
                      </td>
                      <td
                        class={[
                          'py-3 px-3 text-right font-semibold tabular-nums',
                          mv.qtyChange > 0 ? 'text-m3-success' : 'text-m3-danger',
                        ].join(' ')}
                      >
                        {mv.qtyChange > 0
                          ? `+${formatInteger(mv.qtyChange)}`
                          : formatInteger(mv.qtyChange)}{' '}
                        {mv.productUnit}
                      </td>
                      <td class="py-3 px-3 text-right font-semibold tabular-nums text-m3-on-surface">
                        {formatInteger(mv.qtyAfter)} {mv.productUnit}
                      </td>
                      <td class="py-3 px-3">
                        <p class="text-m3-on-surface">{mv.note ?? '—'}</p>
                        <p class="text-[11px] text-m3-on-surface-variant mt-0.5">
                          Oleh {mv.actorName}
                          {mv.unitCostSnapshot !== null
                            ? ` · HPP: ${formatRupiah(mv.unitCostSnapshot)}`
                            : ''}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div class="md:hidden flex flex-col gap-3">
              {movements.map((mv) => (
                <div
                  key={mv.id}
                  class="rounded-2xl border border-m3-outline-variant/70 p-3.5 flex flex-col gap-2 bg-m3-surface-container-lowest text-xs"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="font-semibold text-m3-on-surface truncate">
                        {mv.productName}
                      </p>
                      <p class="text-m3-on-surface-variant tabular-nums">
                        {mv.productSku} · {formatDateTime(mv.createdAt)}
                      </p>
                    </div>
                    <Badge tone={MOVEMENT_BADGE_TONES[mv.movementType]}>
                      {MOVEMENT_TYPE_LABELS[mv.movementType]}
                    </Badge>
                  </div>

                  <div class="flex items-center justify-between pt-1.5 border-t border-m3-outline-variant/40 tabular-nums">
                    <span class="text-m3-on-surface-variant">
                      Saldo: {formatInteger(mv.qtyBefore)} →{' '}
                      <strong class="text-m3-on-surface">
                        {formatInteger(mv.qtyAfter)} {mv.productUnit}
                      </strong>
                    </span>
                    <span
                      class={[
                        'font-bold',
                        mv.qtyChange > 0 ? 'text-m3-success' : 'text-m3-danger',
                      ].join(' ')}
                    >
                      {mv.qtyChange > 0
                        ? `+${formatInteger(mv.qtyChange)}`
                        : formatInteger(mv.qtyChange)}{' '}
                      {mv.productUnit}
                    </span>
                  </div>

                  <p class="text-m3-on-surface-variant">
                    {mv.note ?? 'Tanpa catatan'} · Oleh {mv.actorName}
                  </p>
                </div>
              ))}
            </div>

            {movementsData && (
              <Pagination meta={movementsData.meta} onPageChange={setPage} />
            )}
          </>
        )}
      </Card>

      <StockMovementModal
        open={modalOpen}
        preselectedProduct={null}
        products={products}
        onClose={() => setModalOpen(false)}
        onRecorded={() => {
          void loadProductDropdown()
          void loadMovements()
        }}
      />
    </div>
  )
}
