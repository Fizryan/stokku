import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type { SaleDetailDTO } from '../../../shared/types.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { IconPrinter } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'

export interface ReceiptModalProps {
  readonly sale: SaleDetailDTO | null
  readonly onClose: () => void
  readonly onRequestVoid?: (sale: SaleDetailDTO) => void
}

export function ReceiptModal(props: ReceiptModalProps) {
  const sale = props.sale
  if (!sale) return null

  return (
    <Modal
      open={Boolean(sale)}
      title={`Detail Struk — ${sale.invoiceNumber}`}
      description="Siap dicetak pada printer struk termal 58mm/80mm maupun kertas standar."
      maxWidthClass="max-w-md"
      onClose={props.onClose}
      footer={
        <div class="w-full flex items-center justify-between gap-2">
          <div>
            {props.onRequestVoid && sale.status === 'COMPLETED' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => props.onRequestVoid?.(sale)}
              >
                Void Transaksi
              </Button>
            )}
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Tutup
            </Button>
            <Button
              size="sm"
              onClick={() => {
                window.print()
              }}
            >
              <IconPrinter class="w-4 h-4" />
              <span>Cetak Struk</span>
            </Button>
          </div>
        </div>
      }
    >
      <div
        id="printable-receipt"
        class="rounded-2xl border border-dashed border-m3-outline-variant bg-white p-5 text-xs text-slate-900 font-mono"
      >
        <div class="text-center pb-3 border-b border-dashed border-slate-300">
          <p class="text-base font-bold tracking-wide font-sans">STOKKU POS</p>
          <p class="text-[11px] text-slate-600 mt-0.5 font-sans">
            Bukti Transaksi Penjualan Resmi
          </p>
          {sale.status === 'VOIDED' && (
            <div class="mt-2">
              <Badge tone="danger">{SALE_STATUS_LABELS[sale.status]}</Badge>
            </div>
          )}
        </div>

        <div class="py-3 border-b border-dashed border-slate-300 flex flex-col gap-1 text-[11px]">
          <div class="flex justify-between gap-2">
            <span class="text-slate-600">No. Struk:</span>
            <span class="font-semibold">{sale.invoiceNumber}</span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-slate-600">Waktu:</span>
            <span>{formatDateTime(sale.createdAt)}</span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-slate-600">Kasir:</span>
            <span>{sale.cashierName}</span>
          </div>
          {sale.customerName && (
            <div class="flex justify-between gap-2">
              <span class="text-slate-600">Pelanggan:</span>
              <span>{sale.customerName}</span>
            </div>
          )}
        </div>

        <div class="py-3 border-b border-dashed border-slate-300 flex flex-col gap-2">
          {sale.items.map((item) => (
            <div key={item.id} class="flex flex-col gap-0.5">
              <span class="font-semibold text-slate-900 font-sans">
                {item.productNameSnapshot}
              </span>
              <div class="flex justify-between text-[11px] text-slate-700 tabular-nums">
                <span>
                  {formatInteger(item.qty)} {item.unitSnapshot} x{' '}
                  {formatRupiah(item.sellPriceAtSale)}
                </span>
                <span class="font-medium">{formatRupiah(item.lineSubtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        <div class="py-3 flex flex-col gap-1.5 tabular-nums text-[11px]">
          <div class="flex justify-between">
            <span class="text-slate-600">Subtotal</span>
            <span>{formatRupiah(sale.subtotalAmount)}</span>
          </div>
          {sale.discountAmount > 0 && (
            <div class="flex justify-between text-emerald-700">
              <span>Potongan Diskon</span>
              <span>-{formatRupiah(sale.discountAmount)}</span>
            </div>
          )}
          <div class="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
            <span>TOTAL</span>
            <span>{formatRupiah(sale.totalAmount)}</span>
          </div>
          <div class="flex justify-between pt-1">
            <span class="text-slate-600">
              Bayar ({PAYMENT_METHOD_LABELS[sale.paymentMethod]})
            </span>
            <span>{formatRupiah(sale.paidAmount)}</span>
          </div>
          <div class="flex justify-between font-semibold">
            <span class="text-slate-600">Kembalian</span>
            <span>{formatRupiah(sale.changeAmount)}</span>
          </div>
        </div>

        {sale.status === 'VOIDED' && (
          <div class="mt-2 rounded-xl bg-red-50 border border-red-200 p-2.5 text-[11px] font-sans text-red-900">
            <p class="font-semibold">Dibatalkan oleh: {sale.voidedByName ?? 'Owner'}</p>
            <p class="mt-0.5">Alasan: {sale.voidReason ?? '—'}</p>
          </div>
        )}

        <p class="pt-3 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-500 font-sans">
          Terima kasih telah berbelanja!
        </p>
      </div>
    </Modal>
  )
}
