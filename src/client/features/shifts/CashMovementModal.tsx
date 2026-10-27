import { useState } from 'hono/jsx/dom'
import type { ShiftMovementType } from '../../../shared/constants.js'
import { formatRupiah } from '../../../shared/formatters.js'
import type { CashShiftDetailDTO, CashShiftMovementDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface CashMovementModalProps {
  readonly open: boolean
  readonly shift: CashShiftDetailDTO | null
  readonly onClose: () => void
  readonly onMovementRecorded: (movement: CashShiftMovementDTO) => void
}

export function CashMovementModal(props: CashMovementModalProps) {
  const { showToast } = useToast()
  const [movementType, setMovementType] = useState<ShiftMovementType>('CASH_OUT')
  const [amount, setAmount] = useState<number>(0)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const maxCashOut = props.shift?.expectedCash ?? 0
  const isCashOutExceeded = movementType === 'CASH_OUT' && amount > maxCashOut

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!props.shift) return

    if (amount <= 0) {
      setErrorMessage('Nominal kas harus lebih dari Rp 0.')
      return
    }

    if (!reason.trim()) {
      setErrorMessage('Alasan mutasi kas wajib diisi.')
      return
    }

    if (isCashOutExceeded) {
      setErrorMessage(
        `Penarikan kas melebihi saldo kas saat ini di laci (${formatRupiah(maxCashOut)}).`,
      )
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const movement = await api.shifts.recordMovement({
        movementType,
        amount,
        reason: reason.trim(),
      })
      showToast(
        `Mutasi kas ${movementType === 'CASH_IN' ? 'masuk' : 'keluar'} sebesar ${formatRupiah(amount)} berhasil dicatat.`,
        'success',
      )
      props.onMovementRecorded(movement)
      setAmount(0)
      setReason('')
      props.onClose()
    } catch (err) {
      const msg =
        err instanceof ClientApiError ? err.message : 'Gagal mencatat mutasi kas laci.'
      setErrorMessage(msg)
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Mutasi Kas Laci (Petty Cash)"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-4">
        <p class="text-xs text-m3-on-surface-variant">
          Catat penambahan kas receh atau pengeluaran operasional kecil langsung dari laci
          kasir secara akuntabel.
        </p>

        {errorMessage && (
          <div class="p-3 rounded-xl bg-m3-danger-container/60 border border-m3-danger/40 text-xs text-m3-danger">
            {errorMessage}
          </div>
        )}

        {/* Movement Type Tabs */}
        <div class="grid grid-cols-2 p-1 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/60 gap-1">
          <button
            type="button"
            onClick={() => setMovementType('CASH_OUT')}
            class={[
              'py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              movementType === 'CASH_OUT'
                ? 'bg-m3-danger text-m3-on-danger shadow-xs'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface',
            ].join(' ')}
          >
            Kas Keluar (CASH_OUT)
          </button>
          <button
            type="button"
            onClick={() => setMovementType('CASH_IN')}
            class={[
              'py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              movementType === 'CASH_IN'
                ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface',
            ].join(' ')}
          >
            Kas Masuk (CASH_IN)
          </button>
        </div>

        {props.shift && (
          <div class="p-3 rounded-xl bg-m3-surface-container-low border border-m3-outline-variant/50 flex justify-between items-center text-xs">
            <span class="text-m3-on-surface-variant">Saldo Kas Laci Saat Ini:</span>
            <span class="font-bold text-m3-on-surface tabular-nums">
              {formatRupiah(props.shift.expectedCash)}
            </span>
          </div>
        )}

        <MoneyField
          label={movementType === 'CASH_IN' ? 'Nominal Kas Masuk' : 'Nominal Kas Keluar'}
          value={amount}
          onValueChange={setAmount}
          disabled={submitting}
          required
          errorText={isCashOutExceeded ? 'Melebihi saldo kas saat ini' : undefined}
          helperText={
            movementType === 'CASH_OUT'
              ? `Maksimal penarikan: ${formatRupiah(maxCashOut)}`
              : 'Masukkan jumlah uang tunai yang ditambahkan ke laci.'
          }
        />

        <TextField
          label="Alasan Mutasi Kas"
          placeholder={
            movementType === 'CASH_IN'
              ? 'Misal: Tambah uang koin kembalian dari brankas...'
              : 'Misal: Beli kertas thermal struk kasir, plastik kresek...'
          }
          value={reason}
          onValueChange={setReason}
          disabled={submitting}
          required
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
          <Button
            type="submit"
            loading={submitting}
            disabled={amount <= 0 || !reason.trim() || isCashOutExceeded}
          >
            Simpan Mutasi Kas
          </Button>
        </div>
      </form>
    </Modal>
  )
}
