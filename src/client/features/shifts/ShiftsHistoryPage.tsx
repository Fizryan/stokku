import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import type { ShiftStatus } from '../../../shared/constants.js'
import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type {
  CashShiftDetailDTO,
  CashShiftSummaryDTO,
  PaginationMeta,
} from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconClock, IconRefresh } from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'
import { ShiftZReportModal } from './ShiftZReportModal.js'

export function ShiftsHistoryPage() {
  const { showToast } = useToast()
  const [shifts, setShifts] = useState<readonly CashShiftSummaryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedShiftDetail, setSelectedShiftDetail] =
    useState<CashShiftDetailDTO | null>(null)

  const [statusFilter, setStatusFilter] = useState<ShiftStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  })

  const loadShifts = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.shifts.list(
          {
            status: statusFilter || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: 20,
          },
          signal,
        )
        setShifts(res.items)
        setMeta(res.meta)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError
            ? err.message
            : 'Gagal memuat riwayat shift kasir.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [statusFilter, dateFrom, dateTo, page, showToast],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadShifts(controller.signal)
    return () => controller.abort()
  }, [loadShifts])

  const handleOpenDetail = async (shiftId: number) => {
    try {
      const detail = await api.shifts.getDetail(shiftId)
      setSelectedShiftDetail(detail)
    } catch (err) {
      showToast(
        err instanceof ClientApiError
          ? err.message
          : 'Gagal memuat rincian laporan shift.',
        'error',
      )
    }
  }

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  return (
    <div class="flex flex-col gap-6">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-m3-on-surface">
            Riwayat Shift & Laci Kas
          </h1>
          <p class="text-xs sm:text-sm text-m3-on-surface-variant">
            Audit rekapitulasi shift kasir, saldo modal awal, mutasi laci, dan laporan
            rekonsiliasi Z-Report.
          </p>
        </div>

        <Button
          type="button"
          variant="outlined"
          size="sm"
          onClick={() => void loadShifts()}
          disabled={loading}
        >
          <IconRefresh
            class={['w-4 h-4 mr-1.5', loading ? 'animate-spin' : ''].join(' ')}
          />
          Segarkan
        </Button>
      </div>

      {/* Filter Bar */}
      <Card class="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SelectField
          label="Status Shift"
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val as ShiftStatus | '')
            setPage(1)
          }}
          options={[
            { value: '', label: 'Semua Status' },
            { value: 'OPEN', label: 'Sedang Berlangsung (OPEN)' },
            { value: 'CLOSED', label: 'Sudah Ditutup (CLOSED)' },
          ]}
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
      </Card>

      {/* Shifts Table */}
      <Card class="overflow-hidden">
        {loading && shifts.length === 0 ? (
          <div class="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                class="h-10 rounded-xl bg-m3-surface-container animate-pulse"
              />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <EmptyState
            icon={<IconClock />}
            title="Belum ada data shift"
            description="Shift kasir yang dibuka atau ditutup akan tercatat otomatis di sini."
          />
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-m3-on-surface">
              <thead class="bg-m3-surface-container text-m3-on-surface-variant border-b border-m3-outline-variant/60">
                <tr>
                  <th class="p-3.5 font-semibold">Shift & Kasir</th>
                  <th class="p-3.5 font-semibold">Waktu Buka / Tutup</th>
                  <th class="p-3.5 font-semibold text-right">Modal Awal</th>
                  <th class="p-3.5 font-semibold text-right">Penjualan Tunai</th>
                  <th class="p-3.5 font-semibold text-right">Kas Akhir Aktual</th>
                  <th class="p-3.5 font-semibold text-right">Selisih</th>
                  <th class="p-3.5 font-semibold text-center">Status</th>
                  <th class="p-3.5 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-m3-outline-variant/40">
                {shifts.map((s) => (
                  <tr
                    key={s.id}
                    class="hover:bg-m3-surface-container-low/50 transition-colors"
                  >
                    <td class="p-3.5 font-medium">
                      <div class="font-bold text-m3-on-surface">Shift #{s.id}</div>
                      <div class="text-[11px] text-m3-on-surface-variant">
                        {s.cashierName}
                      </div>
                    </td>

                    <td class="p-3.5 text-m3-on-surface-variant whitespace-nowrap">
                      <div>Buka: {formatDateTime(s.openedAt)}</div>
                      <div class="text-[11px]">Tutup: {formatDateTime(s.closedAt)}</div>
                    </td>

                    <td class="p-3.5 text-right font-medium tabular-nums">
                      {formatRupiah(s.openingCash)}
                    </td>

                    <td class="p-3.5 text-right tabular-nums text-m3-success font-medium">
                      +{formatRupiah(s.totalCashSales)}
                      <div class="text-[10px] text-m3-on-surface-variant">
                        {formatInteger(s.transactionCount)} transaksi
                      </div>
                    </td>

                    <td class="p-3.5 text-right tabular-nums font-semibold">
                      {s.closingCash !== null ? formatRupiah(s.closingCash) : '-'}
                      {s.status === 'OPEN' && (
                        <div class="text-[10px] text-m3-primary font-normal">
                          Live: {formatRupiah(s.expectedCash ?? 0)}
                        </div>
                      )}
                    </td>

                    <td class="p-3.5 text-right tabular-nums">
                      {s.status === 'CLOSED' && s.cashDifference !== null ? (
                        s.cashDifference === 0 ? (
                          <span class="text-m3-success font-semibold">Pas (Rp 0)</span>
                        ) : s.cashDifference > 0 ? (
                          <span class="text-m3-primary font-semibold">
                            +{formatRupiah(s.cashDifference)}
                          </span>
                        ) : (
                          <span class="text-m3-danger font-semibold">
                            -{formatRupiah(Math.abs(s.cashDifference))}
                          </span>
                        )
                      ) : (
                        <span class="text-m3-on-surface-variant">-</span>
                      )}
                    </td>

                    <td class="p-3.5 text-center">
                      <Badge tone={s.status === 'OPEN' ? 'success' : 'neutral'}>
                        {s.status === 'OPEN' ? 'Sedang Buka' : 'Ditutup'}
                      </Badge>
                    </td>

                    <td class="p-3.5 text-center">
                      <Button
                        type="button"
                        variant="outlined"
                        size="sm"
                        onClick={() => void handleOpenDetail(s.id)}
                      >
                        Detail & Struk
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div class="p-4 border-t border-m3-outline-variant/50">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <ShiftZReportModal
        shift={selectedShiftDetail}
        onClose={() => setSelectedShiftDetail(null)}
      />
    </div>
  )
}
