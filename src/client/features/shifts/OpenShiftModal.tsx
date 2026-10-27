import { useState } from 'hono/jsx/dom'
import { formatRupiah } from '../../../shared/formatters.js'
import type { CashShiftDetailDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface OpenShiftModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onShiftOpened: (shift: CashShiftDetailDTO) => void
}

const QUICK_AMOUNTS = [0, 50_000, 100_000, 200_000, 500_000]

export function OpenShiftModal(props: OpenShiftModalProps) {
  const { showToast } = useToast()
  const [openingCash, setOpeningCash] = useState<number>(100_000)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)

    try {
      const created = await api.shifts.open({
        openingCash,
        notes: notes.trim() ? notes.trim() : null,
      })
      showToast(
        `Shift kasir #${created.id} berhasil dibuka dengan modal awal ${formatRupiah(created.openingCash)}.`,
        'success',
      )
      props.onShiftOpened(created)
      props.onClose()
    } catch (err) {
      const msg =
        err instanceof ClientApiError
          ? err.message
          : 'Terjadi kesalahan saat membuka shift kasir.'
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
      title="Buka Shift Kasir & Laci Kas"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-4">
        <p class="text-xs text-m3-on-surface-variant">
          Kasir wajib memasukkan modal awal fisik yang ada di laci kas sebelum dapat
          memproses transaksi penjualan POS.
        </p>

        {errorMessage && (
          <div class="p-3 rounded-xl bg-m3-danger-container/60 border border-m3-danger/40 text-xs text-m3-danger">
            {errorMessage}
          </div>
        )}

        <div class="flex flex-col gap-2">
          <MoneyField
            label="Modal Awal Kas di Laci"
            value={openingCash}
            onValueChange={setOpeningCash}
            disabled={submitting}
            required
            helperText="Hitung uang tunai fisik yang ada di laci saat ini."
          />

          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] text-m3-on-surface-variant mr-1">Cepat:</span>
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={submitting}
                onClick={() => setOpeningCash(amt)}
                class={[
                  'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                  openingCash === amt
                    ? 'bg-m3-primary text-m3-on-primary border-m3-primary'
                    : 'bg-m3-surface-container-low text-m3-on-surface-variant border-m3-outline-variant hover:bg-m3-surface-container-high',
                ].join(' ')}
              >
                {amt === 0 ? 'Rp 0 (Tanpa Modal)' : formatRupiah(amt)}
              </button>
            ))}
          </div>
        </div>

        <TextField
          label="Catatan Shift (Opsional)"
          placeholder="Misal: Uang receh kembalian Rp 50.000 disiapkan oleh supervisor..."
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
            Buka Shift Sekarang
          </Button>
        </div>
      </form>
    </Modal>
  )
}
