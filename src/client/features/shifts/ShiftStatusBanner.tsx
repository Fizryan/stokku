import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { CashShiftDetailDTO } from '../../../shared/types.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { IconAlert, IconClock, IconPlus } from '../../components/ui/Icons.js'

export interface ShiftStatusBannerProps {
  readonly shift: CashShiftDetailDTO | null
  readonly loading: boolean
  readonly onOpenShiftClick: () => void
  readonly onMovementClick: () => void
  readonly onCloseShiftClick: () => void
}

export function ShiftStatusBanner(props: ShiftStatusBannerProps) {
  if (props.loading) {
    return <div class="h-16 rounded-2xl bg-m3-surface-container animate-pulse w-full" />
  }

  if (!props.shift) {
    return (
      <Card class="p-4 border-l-4 border-l-m3-warning bg-m3-warning/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-full bg-m3-warning/20 text-m3-warning flex items-center justify-center shrink-0">
            <IconAlert class="w-5 h-5" />
          </span>
          <div>
            <h4 class="text-sm font-bold text-m3-on-surface">Shift Kasir Belum Dibuka</h4>
            <p class="text-xs text-m3-on-surface-variant">
              Kasir wajib memasukkan modal awal laci kas sebelum memproses transaksi
              penjualan pelanggan.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={props.onOpenShiftClick}
          class="shrink-0 w-full sm:w-auto"
        >
          <IconPlus class="w-4 h-4 mr-1.5" />
          Buka Shift Sekarang
        </Button>
      </Card>
    )
  }

  const shift = props.shift
  const openTime = new Date(shift.openedAt).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card class="p-4 bg-m3-surface-container-lowest border-m3-primary/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-10 h-10 rounded-2xl bg-m3-primary-container text-m3-primary flex items-center justify-center shrink-0">
          <IconClock class="w-5 h-5" />
        </span>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="text-sm font-bold text-m3-on-surface truncate">
              Shift #{shift.id} — {shift.cashierName}
            </h4>
            <Badge tone="success" class="text-[11px] font-semibold">
              ● Shift Aktif
            </Badge>
          </div>
          <p class="text-xs text-m3-on-surface-variant mt-0.5">
            Dibuka pukul {openTime} WIB • Modal Awal: {formatRupiah(shift.openingCash)}
          </p>
        </div>
      </div>

      <div class="w-full md:w-auto flex flex-wrap items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-m3-outline-variant/40">
        {/* Metric Pills */}
        <div class="flex items-center gap-3 text-xs tabular-nums">
          <div class="flex flex-col items-start md:items-end">
            <span class="text-[10px] text-m3-on-surface-variant uppercase font-medium">
              Penjualan Tunai ({formatInteger(shift.transactionCount)})
            </span>
            <span class="font-bold text-m3-success">
              {formatRupiah(shift.totalCashSales)}
            </span>
          </div>

          <div class="h-7 w-px bg-m3-outline-variant/60" />

          <div class="flex flex-col items-start md:items-end">
            <span class="text-[10px] text-m3-on-surface-variant uppercase font-medium">
              Saldo Kas Laci
            </span>
            <span class="font-bold text-m3-primary text-sm">
              {formatRupiah(shift.expectedCash)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <Button
            type="button"
            variant="outlined"
            size="sm"
            onClick={props.onMovementClick}
            class="flex-1 sm:flex-initial"
          >
            +/- Kas Laci
          </Button>

          <Button
            type="button"
            variant="outlined"
            size="sm"
            onClick={props.onCloseShiftClick}
            class="flex-1 sm:flex-initial text-m3-danger border-m3-danger/40 hover:bg-m3-danger-container/30"
          >
            Tutup Shift
          </Button>
        </div>
      </div>
    </Card>
  )
}
