import { useEffect, useState } from 'hono/jsx/dom'
import { formatRupiah } from '../../../shared/formatters.js'
import type { SaleDetailDTO, SaleSummaryDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { IconAlert } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface VoidSaleModalProps {
  readonly targetSale: SaleSummaryDTO | null
  readonly onClose: () => void
  readonly onVoidSuccess: (voidedSale: SaleDetailDTO) => void
}

export function VoidSaleModal(props: VoidSaleModalProps) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [errorText, setErrorText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (props.targetSale) {
      setReason('')
      setErrorText('')
      setSubmitting(false)
    }
  }, [props.targetSale])

  const sale = props.targetSale
  if (!sale) return null

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 5) {
      setErrorText('Alasan pembatalan wajib diisi minimal 5 karakter.')
      return
    }
    if (trimmed.length > 240) {
      setErrorText('Alasan pembatalan maksimal 240 karakter.')
      return
    }

    setErrorText('')
    setSubmitting(true)
    try {
      const updated = await api.sales.voidSale(sale.id, { reason: trimmed })
      showToast(
        `Transaksi ${sale.invoiceNumber} berhasil dibatalkan dan stok dikembalikan.`,
        'success',
      )
      props.onVoidSuccess(updated)
      props.onClose()
    } catch (err) {
      const message =
        err instanceof ClientApiError
          ? err.message
          : 'Gagal membatalkan transaksi penjualan.'
      setErrorText(message)
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={Boolean(sale)}
      title={`Void Transaksi — ${sale.invoiceNumber}`}
      description="Pembatalan ini bersifat permanen dan tercatat di Kartu Stok."
      maxWidthClass="max-w-md"
      onClose={() => {
        if (!submitting) props.onClose()
      }}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={submitting} onClick={props.onClose}>
            Batal
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={submitting}
            onClick={() => {
              const form = document.getElementById(
                'void-sale-form',
              ) as HTMLFormElement | null
              form?.requestSubmit()
            }}
          >
            Konfirmasi Void
          </Button>
        </>
      }
    >
      <form id="void-sale-form" onSubmit={handleSubmit} class="flex flex-col gap-4">
        <div class="rounded-2xl bg-m3-danger-container/60 border border-m3-danger/25 p-3.5 flex items-start gap-3 text-xs text-m3-on-danger-container">
          <IconAlert class="w-5 h-5 text-m3-danger shrink-0 mt-0.5" />
          <div class="flex flex-col gap-1 leading-relaxed">
            <p class="font-semibold">
              Total nilai {formatRupiah(sale.totalAmount)} ({sale.totalQty} unit) akan
              dibatalkan.
            </p>
            <p>
              Seluruh kuantitas barang pada struk ini akan otomatis dikembalikan ke saldo
              stok melalui entri mutasi <span class="font-semibold">VOID_REVERSAL</span>.
            </p>
          </div>
        </div>

        <TextField
          label="Alasan Pembatalan (Wajib Audit)"
          placeholder="Contoh: Salah input metode pembayaran / batal beli"
          value={reason}
          onValueChange={(val) => {
            setReason(val)
            if (errorText) setErrorText('')
          }}
          required
          disabled={submitting}
          maxLength={240}
          helperText="Minimal 5 karakter. Akan tampil pada struk dan laporan penjualan."
          errorText={errorText || undefined}
        />
      </form>
    </Modal>
  )
}
