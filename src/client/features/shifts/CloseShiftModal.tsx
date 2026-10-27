import { useMemo, useState } from 'hono/jsx/dom'
import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { CashShiftDetailDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface CloseShiftModalProps {
  readonly open: boolean
  readonly shift: CashShiftDetailDTO | null
  readonly onClose: () => void
  readonly onShiftClosed: (closedShift: CashShiftDetailDTO) => void
}

export function CloseShiftModal(props: CloseShiftModalProps) {
  const { showToast } = useToast()
  const expectedCash = props.shift?.expectedCash ?? 0

  const [actualCash, setActualCash] = useState<number>(() => expectedCash)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const cashDifference = useMemo(
    () => actualCash - expectedCash,
    [actualCash, expectedCash],
  )

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!props.shift) return

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const closed = await api.shifts.close({
        actualCash,
        notes: notes.trim() ? notes.trim() : null,
      })
      showToast(
        `Shift #${closed.id} berhasil ditutup. Laporan Z-Report siap dicetak.`,
        'success',
      )
      props.onShiftClosed(closed)
      props.onClose()
    } catch (err) {
      const msg =
        err instanceof ClientApiError ? err.message : 'Gagal menutup shift kasir.'
      setErrorMessage(msg)
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!props.shift) return null

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={`Tutup Shift Kasir & Rekonsiliasi (#${props.shift.id})`}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-4">
        <p class="text-xs text-m3-on-surface-variant">
          Hitung seluruh uang fisik di laci kasir dan masukkan jumlah riil untuk
          merekonsiliasi kas dengan pembukuan sistem.
        </p>

        {errorMessage && (
          <div class="p-3 rounded-xl bg-m3-danger-container/60 border border-m3-danger/40 text-xs text-m3-danger">
            {errorMessage}
          </div>
        )}

        {/* Shift Financial Summary Breakdown */}
        <div class="rounded-2xl bg-m3-surface-container-low p-4 border border-m3-outline-variant/60 flex flex-col gap-2.5 text-xs">
          <div class="flex justify-between items-center text-m3-on-surface-variant">
            <span>Modal Awal Kas:</span>
            <span class="font-medium text-m3-on-surface tabular-nums">
              {formatRupiah(props.shift.openingCash)}
            </span>
          </div>

          <div class="flex justify-between items-center text-m3-on-surface-variant">
            <span>
              Total Penjualan Tunai ({formatInteger(props.shift.transactionCount)}{' '}
              transaksi):
            </span>
            <span class="font-medium text-m3-success tabular-nums">
              +{formatRupiah(props.shift.totalCashSales)}
            </span>
          </div>

          <div class="flex justify-between items-center text-m3-on-surface-variant">
            <span>Total Penjualan Non-Tunai (QRIS / Transfer):</span>
            <span class="font-medium text-m3-primary tabular-nums">
              {formatRupiah(props.shift.totalNonCashSales)}
            </span>
          </div>

          {props.shift.totalCashIn > 0 && (
            <div class="flex justify-between items-center text-m3-on-surface-variant">
              <span>Kas Masuk Tambahan (Petty Cash In):</span>
              <span class="font-medium text-m3-success tabular-nums">
                +{formatRupiah(props.shift.totalCashIn)}
              </span>
            </div>
          )}

          {props.shift.totalCashOut > 0 && (
            <div class="flex justify-between items-center text-m3-on-surface-variant">
              <span>Pengeluaran Kas Laci (Petty Cash Out):</span>
              <span class="font-medium text-m3-danger tabular-nums">
                -{formatRupiah(props.shift.totalCashOut)}
              </span>
            </div>
          )}

          <div class="pt-2 border-t border-m3-outline-variant/50 flex justify-between items-center text-sm font-bold">
            <span class="text-m3-on-surface">Estimasi Saldo Kas di Laci:</span>
            <span class="text-m3-primary tabular-nums">{formatRupiah(expectedCash)}</span>
          </div>
        </div>

        {/* Actual Count Input & Live Discrepancy Status */}
        <div class="flex flex-col gap-2">
          <MoneyField
            label="Jumlah Kas Fisik Aktual di Laci"
            value={actualCash}
            onValueChange={setActualCash}
            disabled={submitting}
            required
            helperText="Hitung seluruh uang kertas dan koin yang ada di laci saat ini."
          />

          <div class="p-3 rounded-xl border flex items-center justify-between gap-3 text-xs">
            <span class="font-medium text-m3-on-surface">Status Rekonsiliasi:</span>
            {cashDifference === 0 ? (
              <Badge tone="success" class="font-bold">
                ✓ Seimbang (Pas: {formatRupiah(0)})
              </Badge>
            ) : cashDifference > 0 ? (
              <Badge tone="primary" class="font-bold">
                + Lebih {formatRupiah(cashDifference)} (Surplus)
              </Badge>
            ) : (
              <Badge tone="danger" class="font-bold">
                - Kurang {formatRupiah(Math.abs(cashDifference))} (Defisit)
              </Badge>
            )}
          </div>
        </div>

        <TextField
          label="Catatan Penutupan Shift (Opsional)"
          placeholder={
            cashDifference !== 0
              ? 'Jelaskan penyebab kelebihan atau kekurangan uang kas...'
              : 'Catatan operasional selama shift berlangsung...'
          }
          value={notes}
          onValueChange={setNotes}
          disabled={submitting}
        />

        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-m3-outline-variant/50">
          <Button
            type="button"
            variant="ghost"
            onClick={props.onClose}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            Tutup Shift & Cetak Z-Report
          </Button>
        </div>
      </form>
    </Modal>
  )
}
