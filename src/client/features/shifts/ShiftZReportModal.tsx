import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { CashShiftDetailDTO } from '../../../shared/types.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { IconPrinter } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'

export interface ShiftZReportModalProps {
  readonly shift: CashShiftDetailDTO | null
  readonly onClose: () => void
}

export function ShiftZReportModal(props: ShiftZReportModalProps) {
  if (!props.shift) return null
  const shift = props.shift

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const difference = shift.cashDifference ?? 0

  return (
    <Modal
      open={Boolean(props.shift)}
      onClose={props.onClose}
      title="Laporan Penutupan Shift Kasir (Z-Report)"
      maxWidthClass="max-w-md"
    >
      <div class="flex flex-col gap-4">
        {/* Printable Receipt Paper Container */}
        <div class="p-5 rounded-2xl bg-m3-surface-container-lowest border-2 border-dashed border-m3-outline-variant font-mono text-xs flex flex-col gap-3 shadow-inner">
          <div class="text-center pb-3 border-b border-dashed border-m3-outline-variant">
            <h3 class="text-base font-bold tracking-wider text-m3-on-surface">
              STOKKU POS
            </h3>
            <p class="text-[11px] text-m3-on-surface-variant">
              Laporan Penutupan Kasir (Z-Report)
            </p>
            <p class="text-[10px] text-m3-on-surface-variant mt-1">
              Shift #{shift.id} — {shift.cashierName}
            </p>
          </div>

          <div class="flex flex-col gap-1 text-[11px] text-m3-on-surface-variant pb-2 border-b border-dashed border-m3-outline-variant">
            <div class="flex justify-between">
              <span>Buka Shift:</span>
              <span class="text-m3-on-surface">{formatDateTime(shift.openedAt)}</span>
            </div>
            <div class="flex justify-between">
              <span>Tutup Shift:</span>
              <span class="text-m3-on-surface">{formatDateTime(shift.closedAt)}</span>
            </div>
            <div class="flex justify-between">
              <span>Total Transaksi:</span>
              <span class="text-m3-on-surface font-semibold">
                {formatInteger(shift.transactionCount)} struk
              </span>
            </div>
          </div>

          {/* Breakdown Section */}
          <div class="flex flex-col gap-1.5 py-1">
            <div class="flex justify-between">
              <span>Modal Awal Kas:</span>
              <span class="text-m3-on-surface font-bold">
                {formatRupiah(shift.openingCash)}
              </span>
            </div>

            <div class="flex justify-between text-m3-success">
              <span>(+) Penjualan Tunai:</span>
              <span class="font-bold">+{formatRupiah(shift.totalCashSales)}</span>
            </div>

            <div class="flex justify-between text-m3-primary">
              <span>Penjualan QRIS/Transfer:</span>
              <span>{formatRupiah(shift.totalNonCashSales)}</span>
            </div>

            {shift.totalCashIn > 0 && (
              <div class="flex justify-between text-m3-success">
                <span>(+) Kas Masuk (Petty Cash):</span>
                <span>+{formatRupiah(shift.totalCashIn)}</span>
              </div>
            )}

            {shift.totalCashOut > 0 && (
              <div class="flex justify-between text-m3-danger">
                <span>(-) Kas Keluar (Petty Cash):</span>
                <span>-{formatRupiah(shift.totalCashOut)}</span>
              </div>
            )}
          </div>

          {/* Reconciliation Section */}
          <div class="pt-2 border-t-2 border-dashed border-m3-outline-variant flex flex-col gap-1.5">
            <div class="flex justify-between text-m3-on-surface font-semibold">
              <span>Kas Laci Diharapkan:</span>
              <span class="tabular-nums">{formatRupiah(shift.expectedCash ?? 0)}</span>
            </div>

            <div class="flex justify-between text-m3-on-surface font-bold text-sm">
              <span>Kas Aktual di Laci:</span>
              <span class="text-m3-primary tabular-nums">
                {formatRupiah(shift.closingCash ?? 0)}
              </span>
            </div>

            <div class="flex justify-between items-center pt-1.5 border-t border-dashed border-m3-outline-variant">
              <span>Selisih Rekonsiliasi:</span>
              {difference === 0 ? (
                <Badge tone="success" class="tabular-nums">
                  ✓ PAS (Rp 0)
                </Badge>
              ) : difference > 0 ? (
                <Badge tone="primary" class="tabular-nums">
                  + Lebih {formatRupiah(difference)}
                </Badge>
              ) : (
                <Badge tone="danger" class="tabular-nums">
                  - Kurang {formatRupiah(Math.abs(difference))}
                </Badge>
              )}
            </div>
          </div>

          {shift.notes && (
            <div class="pt-2 border-t border-dashed border-m3-outline-variant text-[11px] text-m3-on-surface-variant">
              <span class="font-bold">Catatan:</span> {shift.notes}
            </div>
          )}

          {/* Movement Log */}
          {shift.movements.length > 0 && (
            <div class="pt-2 border-t border-dashed border-m3-outline-variant flex flex-col gap-1">
              <span class="font-bold text-[10px] text-m3-on-surface-variant uppercase tracking-wider">
                Rincian Mutasi Kas Laci:
              </span>
              {shift.movements.map((mov) => (
                <div key={mov.id} class="text-[10px] flex justify-between gap-2">
                  <span class="truncate">
                    [{mov.movementType === 'CASH_IN' ? 'IN' : 'OUT'}] {mov.reason}
                  </span>
                  <span class="shrink-0 font-semibold">
                    {mov.movementType === 'CASH_IN' ? '+' : '-'}
                    {formatRupiah(mov.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div class="text-center pt-3 border-t border-dashed border-m3-outline-variant text-[10px] text-m3-on-surface-variant">
            *** DOKUMEN RESMI TERTUTUP ***
          </div>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-m3-outline-variant/50">
          <Button type="button" variant="outlined" onClick={handlePrint}>
            <IconPrinter class="w-4 h-4 mr-1.5" />
            Cetak Z-Report
          </Button>
          <Button type="button" onClick={props.onClose}>
            Selesai
          </Button>
        </div>
      </div>
    </Modal>
  )
}
