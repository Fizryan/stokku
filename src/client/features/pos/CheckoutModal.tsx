import { useEffect, useMemo, useState } from 'hono/jsx/dom'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '../../../shared/constants.js'
import { formatRupiah } from '../../../shared/formatters.js'
import type { SaleDetailDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { usePosCart } from '../../stores/pos-cart.store.js'
import { useToast } from '../../stores/toast.store.js'

export interface CheckoutModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onCheckoutSuccess: (sale: SaleDetailDTO) => void
}

function buildQuickCashDenominations(total: number): readonly number[] {
  const candidates = new Set<number>([total])
  const steps = [10_000, 20_000, 50_000, 100_000]
  for (const step of steps) {
    const rounded = Math.ceil(total / step) * step
    if (rounded >= total) {
      candidates.add(rounded)
    }
  }
  return Array.from(candidates)
    .sort((a, b) => a - b)
    .slice(0, 4)
}

export function CheckoutModal(props: CheckoutModalProps) {
  const {
    lines,
    discountAmount,
    selectedCustomer,
    pointsRedeemed,
    grandTotalAmount,
    paymentMethod,
    customerName,
    setPaymentMethod,
    clearCart,
  } = usePosCart()
  const { showToast } = useToast()

  const [paidAmount, setPaidAmount] = useState(grandTotalAmount)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    setPaidAmount(grandTotalAmount)
    setErrorMessage(null)
  }, [props.open, grandTotalAmount])

  useEffect(() => {
    if (paymentMethod !== 'CASH') {
      setPaidAmount(grandTotalAmount)
    }
  }, [paymentMethod, grandTotalAmount])

  const quickAmounts = useMemo(
    () => buildQuickCashDenominations(grandTotalAmount),
    [grandTotalAmount],
  )

  const changeAmount = paidAmount - grandTotalAmount
  const isPaidValid =
    paymentMethod === 'CASH'
      ? paidAmount >= grandTotalAmount
      : paidAmount === grandTotalAmount

  const handleConfirmPayment = async (e: Event) => {
    e.preventDefault()
    if (!isPaidValid || lines.length === 0) return

    setErrorMessage(null)
    setSubmitting(true)

    try {
      const receipt = await api.sales.checkout({
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        discountAmount,
        customerId: selectedCustomer?.id ?? null,
        pointsRedeemed,
        paymentMethod,
        paidAmount,
        customerName: selectedCustomer
          ? selectedCustomer.name
          : customerName.trim() || null,
      })

      clearCart()
      showToast(`Transaksi ${receipt.invoiceNumber} selesai!`, 'success')
      props.onClose()
      props.onCheckoutSuccess(receipt)
    } catch (err) {
      setErrorMessage(
        err instanceof ClientApiError
          ? err.message
          : 'Gagal memproses transaksi pembayaran.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      title="Selesaikan Pembayaran"
      description="Pastikan metode pembayaran dan nominal diterima sudah sesuai."
      maxWidthClass="max-w-md"
      onClose={props.onClose}
    >
      <form onSubmit={handleConfirmPayment} class="flex flex-col gap-4">
        {errorMessage && (
          <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <div class="rounded-2xl bg-m3-primary-container/60 px-4 py-3.5 flex items-center justify-between">
          <span class="text-xs font-semibold text-m3-on-primary-container">
            Total Harus Dibayar
          </span>
          <span class="text-xl font-bold text-m3-primary tabular-nums">
            {formatRupiah(grandTotalAmount)}
          </span>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-m3-on-surface-variant">
            Metode Pembayaran
          </span>
          <div class="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((method) => {
              const active = paymentMethod === method
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  class={[
                    'h-10 rounded-xl text-xs font-semibold border transition-colors cursor-pointer',
                    active
                      ? 'bg-m3-primary text-m3-on-primary border-m3-primary'
                      : 'bg-m3-surface-container-lowest text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-low',
                  ].join(' ')}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              )
            })}
          </div>
        </div>

        {paymentMethod === 'CASH' ? (
          <>
            <MoneyField
              label="Uang Tunai Diterima"
              value={paidAmount}
              onValueChange={setPaidAmount}
              required
            />

            <div class="flex flex-wrap gap-1.5">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPaidAmount(amt)}
                  class="px-3 py-1.5 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-medium text-m3-on-surface tabular-nums cursor-pointer"
                >
                  {amt === grandTotalAmount ? 'Uang Pas' : formatRupiah(amt)}
                </button>
              ))}
            </div>

            <div class="rounded-2xl border border-m3-outline-variant px-4 py-3 flex items-center justify-between text-sm tabular-nums">
              <span class="text-m3-on-surface-variant font-medium">Uang Kembalian</span>
              <span
                class={[
                  'font-bold text-base',
                  changeAmount >= 0 ? 'text-m3-success' : 'text-m3-danger',
                ].join(' ')}
              >
                {changeAmount >= 0
                  ? formatRupiah(changeAmount)
                  : `Kurang ${formatRupiah(Math.abs(changeAmount))}`}
              </span>
            </div>
          </>
        ) : (
          <div class="rounded-2xl bg-m3-surface-container-low p-3.5 text-xs text-m3-on-surface-variant leading-relaxed">
            Pastikan pembayaran <strong>{PAYMENT_METHOD_LABELS[paymentMethod]}</strong>{' '}
            sebesar{' '}
            <strong class="text-m3-on-surface tabular-nums">
              {formatRupiah(grandTotalAmount)}
            </strong>{' '}
            telah berhasil terverifikasi sebelum menyelesaikan transaksi.
          </div>
        )}

        <div class="pt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>
            Kembali
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={!isPaidValid || lines.length === 0}
          >
            Konfirmasi &amp; Cetak Struk
          </Button>
        </div>
      </form>
    </Modal>
  )
}
