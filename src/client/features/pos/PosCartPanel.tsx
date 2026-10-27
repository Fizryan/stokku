import {
  formatInteger,
  formatRupiah,
  parseDigitsToInt,
} from '../../../shared/formatters.js'
import { Button } from '../../components/ui/Button.js'
import { IconCart, IconMinus, IconPlus, IconTrash } from '../../components/ui/Icons.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { TextField } from '../../components/ui/TextField.js'
import { usePosCart } from '../../stores/pos-cart.store.js'
import { useToast } from '../../stores/toast.store.js'

export interface PosCartPanelProps {
  readonly onOpenCheckout: () => void
}

export function PosCartPanel(props: PosCartPanelProps) {
  const {
    lines,
    discountAmount,
    customerName,
    totalItemsCount,
    subtotalAmount,
    effectiveDiscountAmount,
    grandTotalAmount,
    updateLineQty,
    removeLine,
    setDiscountAmount,
    setCustomerName,
    clearCart,
  } = usePosCart()
  const { showToast } = useToast()

  return (
    <div class="flex flex-col h-full gap-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-xl bg-m3-primary-container text-m3-primary flex items-center justify-center">
            <IconCart class="w-4 h-4" />
          </span>
          <div>
            <h3 class="text-sm font-semibold text-m3-on-surface">Keranjang Kasir</h3>
            <p class="text-xs text-m3-on-surface-variant tabular-nums">
              {formatInteger(totalItemsCount)} unit dipilih
            </p>
          </div>
        </div>

        {lines.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            class="text-xs font-medium text-m3-danger hover:underline cursor-pointer"
          >
            Kosongkan
          </button>
        )}
      </div>

      {lines.length === 0 ? (
        <div class="py-12 px-4 rounded-2xl bg-m3-surface-container-low text-center flex flex-col items-center justify-center">
          <IconCart class="w-8 h-8 text-m3-outline mb-2" />
          <p class="text-xs font-medium text-m3-on-surface">Keranjang masih kosong</p>
          <p class="mt-0.5 text-[11px] text-m3-on-surface-variant">
            Klik produk di katalog atau scan kode barcode untuk mulai transaksi.
          </p>
        </div>
      ) : (
        <>
          <div class="flex-1 max-h-80 lg:max-h-96 overflow-y-auto divide-y divide-m3-outline-variant/50 pr-1">
            {lines.map((line) => (
              <div key={line.productId} class="py-3 flex flex-col gap-2 text-xs">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-semibold text-m3-on-surface truncate">{line.name}</p>
                    <p class="text-m3-on-surface-variant tabular-nums">
                      {formatRupiah(line.sellPrice)} / {line.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.productId)}
                    aria-label={`Hapus ${line.name}`}
                    class="w-7 h-7 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-danger hover:bg-m3-danger-container/50 cursor-pointer shrink-0"
                  >
                    <IconTrash class="w-3.5 h-3.5" />
                  </button>
                </div>

                <div class="flex items-center justify-between gap-2">
                  <div class="inline-flex items-center rounded-full border border-m3-outline-variant bg-m3-surface-container-low p-0.5">
                    <button
                      type="button"
                      onClick={() => updateLineQty(line.productId, line.qty - 1)}
                      class="w-7 h-7 rounded-full flex items-center justify-center text-m3-on-surface hover:bg-m3-surface-container-high cursor-pointer"
                      aria-label="Kurangi jumlah"
                    >
                      <IconMinus class="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="text"
                      inputmode="numeric"
                      aria-label="Jumlah beli"
                      value={String(line.qty)}
                      onInput={(e) => {
                        const parsed = parseDigitsToInt(
                          (e.currentTarget as HTMLInputElement).value,
                        )
                        if (parsed > 0) {
                          const res = updateLineQty(line.productId, parsed)
                          if (!res.added && res.reason) {
                            showToast(res.reason, 'warning')
                          }
                        }
                      }}
                      class="w-11 text-center text-xs font-semibold tabular-nums bg-transparent focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        const res = updateLineQty(line.productId, line.qty + 1)
                        if (!res.added && res.reason) {
                          showToast(res.reason, 'warning')
                        }
                      }}
                      class="w-7 h-7 rounded-full flex items-center justify-center text-m3-on-surface hover:bg-m3-surface-container-high cursor-pointer"
                      aria-label="Tambah jumlah"
                    >
                      <IconPlus class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span class="font-semibold text-m3-on-surface tabular-nums">
                    {formatRupiah(line.sellPrice * line.qty)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div class="flex flex-col gap-3 pt-3 border-t border-m3-outline-variant/60">
            <TextField
              label="Nama Pelanggan (Opsional)"
              placeholder="Umum / Walk-in"
              value={customerName}
              onValueChange={setCustomerName}
            />

            <MoneyField
              label="Potongan Diskon Transaksi"
              value={discountAmount}
              onValueChange={setDiscountAmount}
            />

            <div class="rounded-2xl bg-m3-surface-container-low p-3.5 flex flex-col gap-1.5 text-xs tabular-nums">
              <div class="flex justify-between text-m3-on-surface-variant">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotalAmount)}</span>
              </div>
              {effectiveDiscountAmount > 0 && (
                <div class="flex justify-between text-m3-success font-medium">
                  <span>Diskon</span>
                  <span>-{formatRupiah(effectiveDiscountAmount)}</span>
                </div>
              )}
              <div class="flex justify-between text-base font-bold text-m3-on-surface pt-1.5 border-t border-m3-outline-variant/50">
                <span>Total Tagihan</span>
                <span class="text-m3-primary">{formatRupiah(grandTotalAmount)}</span>
              </div>
            </div>

            <Button size="lg" fullWidth onClick={props.onOpenCheckout}>
              Bayar {formatRupiah(grandTotalAmount)}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
