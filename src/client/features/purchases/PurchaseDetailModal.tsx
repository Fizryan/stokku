import { useState } from 'hono/jsx/dom'
import { PURCHASE_PAYMENT_STATUS_LABELS } from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type { PurchaseDetailDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { IconCheck, IconPrinter } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'

export interface PurchaseDetailModalProps {
  readonly purchase: PurchaseDetailDTO | null
  readonly onClose: () => void
  readonly onStatusUpdated?: (updated: PurchaseDetailDTO) => void
}

export function PurchaseDetailModal(props: PurchaseDetailModalProps) {
  const { can } = useAuth()
  const { showToast } = useToast()
  const [settling, setSettling] = useState(false)

  const purchase = props.purchase
  if (!purchase) return null

  const canManage = can('purchases:manage')
  const isUnpaid = purchase.paymentStatus === 'UNPAID'

  const handleSettlePayment = async () => {
    if (
      !window.confirm(
        `Konfirmasi pelunasan tagihan faktur ${purchase.invoiceNumber} sebesar ${formatRupiah(purchase.subtotalAmount)}?`,
      )
    ) {
      return
    }

    setSettling(true)
    try {
      const updated = await api.purchases.updatePaymentStatus(purchase.id, {
        paymentStatus: 'PAID',
        notes: null,
      })
      showToast(`Faktur ${purchase.invoiceNumber} berhasil ditandai Lunas.`, 'success')
      props.onStatusUpdated?.(updated)
    } catch (err) {
      showToast(
        err instanceof ClientApiError
          ? err.message
          : 'Gagal memperbarui status pelunasan faktur.',
        'error',
      )
    } finally {
      setSettling(false)
    }
  }

  return (
    <Modal
      open={Boolean(purchase)}
      title={`Detail Faktur Pembelian — ${purchase.invoiceNumber}`}
      description="Rincian barang masuk restock, kalkulasi HPP tertimbang, dan status pelunasan faktur."
      maxWidthClass="max-w-2xl"
      onClose={props.onClose}
      footer={
        <div class="w-full flex items-center justify-between gap-2">
          <div>
            {isUnpaid && canManage && (
              <Button
                variant="filled"
                size="sm"
                loading={settling}
                onClick={handleSettlePayment}
              >
                <IconCheck class="w-4 h-4" />
                <span>Tandai Lunas (Settle Hutang)</span>
              </Button>
            )}
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Tutup
            </Button>
            <Button
              variant="outlined"
              size="sm"
              onClick={() => {
                window.print()
              }}
            >
              <IconPrinter class="w-4 h-4" />
              <span>Cetak Faktur</span>
            </Button>
          </div>
        </div>
      }
    >
      <div class="space-y-4">
        {/* Header Metadata Info */}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-m3-surface-container-low p-4 rounded-xl border border-m3-outline-variant">
          <div>
            <span class="text-m3-on-surface-variant font-medium">Supplier:</span>
            <p class="font-bold text-sm text-m3-on-surface mt-0.5">
              {purchase.supplierName}
            </p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant font-medium">
              No. Faktur / Referensi:
            </span>
            <p class="font-bold text-sm text-m3-on-surface mt-0.5 font-mono">
              {purchase.invoiceNumber}
            </p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant font-medium">Diterima Oleh:</span>
            <p class="font-semibold text-m3-on-surface mt-0.5">{purchase.receiverName}</p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant font-medium">Waktu Penerimaan:</span>
            <p class="font-semibold text-m3-on-surface mt-0.5">
              {formatDateTime(purchase.createdAt)}
            </p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant font-medium">Status Pembayaran:</span>
            <div class="mt-1">
              <Badge tone={isUnpaid ? 'warning' : 'success'}>
                {PURCHASE_PAYMENT_STATUS_LABELS[purchase.paymentStatus]}
              </Badge>
            </div>
          </div>
          <div>
            <span class="text-m3-on-surface-variant font-medium">Jatuh Tempo:</span>
            <p class="font-semibold text-m3-on-surface mt-0.5">
              {purchase.dueDate
                ? formatDateTime(purchase.dueDate)
                : 'Tidak ada (Bayar Tunai / Langsung)'}
            </p>
          </div>
          {purchase.notes && (
            <div class="sm:col-span-2 pt-2 border-t border-m3-outline-variant">
              <span class="text-m3-on-surface-variant font-medium">Catatan Faktur:</span>
              <p class="text-m3-on-surface mt-0.5 italic">{purchase.notes}</p>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div>
          <h4 class="text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider mb-2">
            Rincian Item Pembelian ({purchase.itemCount} Jenis Barang)
          </h4>
          <div class="overflow-x-auto rounded-xl border border-m3-outline-variant">
            <table class="w-full text-left text-xs">
              <thead class="bg-m3-surface-container text-m3-on-surface-variant font-semibold">
                <tr>
                  <th class="py-2.5 px-3">Produk / SKU</th>
                  <th class="py-2.5 px-3 text-right">Jumlah (Qty)</th>
                  <th class="py-2.5 px-3 text-right">Harga Beli Satuan</th>
                  <th class="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-m3-outline-variant">
                {purchase.items.map((item) => (
                  <tr key={item.id} class="hover:bg-m3-surface-container-low/50">
                    <td class="py-2 px-3">
                      <p class="font-bold text-m3-on-surface">
                        {item.productNameSnapshot}
                      </p>
                      <p class="text-[11px] font-mono text-m3-on-surface-variant">
                        {item.skuSnapshot}
                      </p>
                    </td>
                    <td class="py-2 px-3 text-right font-medium text-m3-on-surface">
                      {formatInteger(item.qty)} {item.unitSnapshot}
                    </td>
                    <td class="py-2 px-3 text-right text-m3-on-surface">
                      {formatRupiah(item.unitCost)}
                    </td>
                    <td class="py-2 px-3 text-right font-bold text-m3-on-surface">
                      {formatRupiah(item.lineSubtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calculation Total Summary */}
        <Card class="p-3 bg-m3-surface-container-low border border-m3-outline-variant">
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between text-m3-on-surface-variant">
              <span>Total Kuantitas Masuk:</span>
              <span class="font-semibold text-m3-on-surface">
                {formatInteger(purchase.totalQty)} unit
              </span>
            </div>
            <div class="flex justify-between text-m3-on-surface-variant">
              <span>Total Jenis Produk:</span>
              <span class="font-semibold text-m3-on-surface">
                {formatInteger(purchase.itemCount)} SKU
              </span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-m3-outline-variant text-sm">
              <span class="font-bold text-m3-on-surface">Total Tagihan Faktur:</span>
              <span class="font-extrabold text-base text-m3-primary">
                {formatRupiah(purchase.subtotalAmount)}
              </span>
            </div>
          </div>
        </Card>

        {/* Unpaid Warning Banner */}
        {isUnpaid && (
          <div class="p-3 bg-m3-warning-container/30 border border-m3-warning/40 rounded-xl text-xs text-m3-warning-container flex items-center justify-between gap-3">
            <div>
              <p class="font-bold text-amber-900 dark:text-amber-200">
                Faktur Ini Berstatus Hutang (Tempo)
              </p>
              <p class="text-[11px] text-amber-800 dark:text-amber-300">
                Barang sudah masuk stok & HPP sudah diperbarui. Selesaikan pembayaran saat
                jatuh tempo.
              </p>
            </div>
            {canManage && (
              <Button
                variant="filled"
                size="sm"
                loading={settling}
                onClick={handleSettlePayment}
              >
                Tandai Lunas
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
