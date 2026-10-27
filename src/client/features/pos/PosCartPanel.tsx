import { useState } from 'hono/jsx/dom'
import { LOYALTY_RULES } from '../../../shared/constants.js'
import {
  formatInteger,
  formatRupiah,
  parseDigitsToInt,
} from '../../../shared/formatters.js'
import { api } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import {
  IconCart,
  IconHeart,
  IconMinus,
  IconPlus,
  IconTrash,
} from '../../components/ui/Icons.js'
import { MoneyField } from '../../components/ui/MoneyField.js'
import { TextField } from '../../components/ui/TextField.js'
import { usePosCart } from '../../stores/pos-cart.store.js'
import { useToast } from '../../stores/toast.store.js'
import { CustomerModal } from '../customers/CustomerModal.js'

export interface PosCartPanelProps {
  readonly onOpenCheckout: () => void
  readonly hasActiveShift?: boolean
  readonly onOpenShift?: () => void
}

export function PosCartPanel(props: PosCartPanelProps) {
  const {
    lines,
    discountAmount,
    customerName,
    selectedCustomer,
    pointsRedeemed,
    pointsDiscountAmount,
    totalItemsCount,
    subtotalAmount,
    grandTotalAmount,
    updateLineQty,
    removeLine,
    setDiscountAmount,
    setCustomerName,
    setSelectedCustomer,
    setPointsRedeemed,
    clearCart,
  } = usePosCart()
  const { showToast } = useToast()

  const [phoneLookup, setPhoneLookup] = useState('')
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)

  const handleLookupCustomer = async () => {
    const clean = phoneLookup.trim()
    if (!clean) {
      showToast('Masukkan nomor HP / WA pelanggan.', 'warning')
      return
    }

    setSearchingCustomer(true)
    try {
      const found = await api.customers.getByPhone(clean)
      if (found) {
        setSelectedCustomer(found)
        setCustomerName(found.name)
        setPhoneLookup('')
        showToast(`Member "${found.name}" ditemukan!`, 'success')
      } else {
        showToast(
          'Pelanggan belum terdaftar. Klik "+ Member" untuk mendaftar.',
          'warning',
        )
      }
    } catch {
      showToast('Gagal mencari data member pelanggan.', 'error')
    } finally {
      setSearchingCustomer(false)
    }
  }

  return (
    <div class="flex flex-col h-full gap-4">
      {/* Header Cart */}
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
          {/* Cart Lines List */}
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
                      onBlur={(e) => {
                        const parsed = parseDigitsToInt(
                          (e.currentTarget as HTMLInputElement).value,
                        )
                        if (parsed <= 0) {
                          updateLineQty(line.productId, 1)
                        }
                      }}
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

          {/* Member & Discount Section */}
          <div class="flex flex-col gap-3 pt-3 border-t border-m3-outline-variant/60">
            {/* Member Selector Box */}
            <div class="p-3 bg-m3-surface-container-low rounded-2xl border border-m3-outline-variant/60 text-xs space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-medium text-m3-on-surface flex items-center gap-1.5">
                  <IconHeart class="w-3.5 h-3.5 text-m3-primary" />
                  <span>Pelanggan & Member</span>
                </span>
                {selectedCustomer ? (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    class="text-[11px] text-m3-danger hover:underline cursor-pointer"
                  >
                    Hapus
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    class="text-[11px] text-m3-primary hover:underline cursor-pointer font-medium"
                  >
                    + Member Baru
                  </button>
                )}
              </div>

              {selectedCustomer ? (
                <div class="space-y-2">
                  <div class="flex items-center justify-between bg-white dark:bg-m3-surface p-2.5 rounded-xl border border-m3-outline-variant">
                    <div>
                      <p class="font-bold text-m3-on-surface">{selectedCustomer.name}</p>
                      <p class="text-[11px] font-mono text-m3-on-surface-variant">
                        {selectedCustomer.phone}
                      </p>
                    </div>
                    <Badge tone="primary">
                      ⭐ {formatInteger(selectedCustomer.pointsBalance)} Poin
                    </Badge>
                  </div>

                  {/* Points Redemption Slider / Input */}
                  {selectedCustomer.pointsBalance > 0 && (
                    <div class="pt-2 border-t border-m3-outline-variant/50 space-y-1.5">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-m3-on-surface-variant">
                          Tukar Poin Reward (1 Poin = Rp{' '}
                          {LOYALTY_RULES.POINT_VALUE_IN_RUPIAH}):
                        </span>
                        {pointsRedeemed > 0 && (
                          <span class="font-bold text-emerald-600 dark:text-emerald-400">
                            -{formatRupiah(pointsDiscountAmount)}
                          </span>
                        )}
                      </div>
                      <div class="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max={selectedCustomer.pointsBalance}
                          value={pointsRedeemed}
                          onInput={(e) => {
                            const val = Number.parseInt(
                              (e.currentTarget as HTMLInputElement).value,
                              10,
                            )
                            setPointsRedeemed(val)
                          }}
                          class="w-full h-1.5 bg-m3-surface-container-highest rounded-lg appearance-none cursor-pointer accent-m3-primary"
                        />
                        <span class="font-bold tabular-nums text-m3-on-surface w-14 text-right">
                          {formatInteger(pointsRedeemed)} pts
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="No. WhatsApp..."
                    value={phoneLookup}
                    onInput={(e) =>
                      setPhoneLookup((e.currentTarget as HTMLInputElement).value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleLookupCustomer()
                      }
                    }}
                    class="h-8 px-2.5 w-full rounded-xl bg-m3-surface border border-m3-outline-variant text-xs text-m3-on-surface focus:outline-m3-primary"
                  />
                  <Button
                    variant="outlined"
                    size="sm"
                    loading={searchingCustomer}
                    onClick={handleLookupCustomer}
                  >
                    Cari
                  </Button>
                </div>
              )}
            </div>

            {!selectedCustomer && (
              <TextField
                label="Nama Pelanggan Umum (Opsional)"
                placeholder="Umum / Walk-in"
                value={customerName}
                onValueChange={setCustomerName}
              />
            )}

            <MoneyField
              label="Potongan Diskon Manual"
              value={discountAmount}
              onValueChange={setDiscountAmount}
            />

            {/* Subtotal & Grand Total Summary */}
            <div class="rounded-2xl bg-m3-surface-container-low p-3.5 flex flex-col gap-1.5 text-xs tabular-nums">
              <div class="flex justify-between text-m3-on-surface-variant">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotalAmount)}</span>
              </div>
              {pointsDiscountAmount > 0 && (
                <div class="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Diskon Poin ({pointsRedeemed} pts)</span>
                  <span>-{formatRupiah(pointsDiscountAmount)}</span>
                </div>
              )}
              {discountAmount > 0 && (
                <div class="flex justify-between text-m3-success font-medium">
                  <span>Diskon Manual</span>
                  <span>-{formatRupiah(discountAmount)}</span>
                </div>
              )}
              <div class="flex justify-between text-base font-bold text-m3-on-surface pt-1.5 border-t border-m3-outline-variant/50">
                <span>Total Tagihan</span>
                <span class="text-m3-primary">{formatRupiah(grandTotalAmount)}</span>
              </div>
            </div>

            <Button
              size="lg"
              fullWidth
              onClick={
                props.hasActiveShift === false ? props.onOpenShift : props.onOpenCheckout
              }
              variant={props.hasActiveShift === false ? 'tonal' : 'filled'}
            >
              {props.hasActiveShift === false
                ? 'Buka Shift Kasir Dahulu'
                : `Bayar ${formatRupiah(grandTotalAmount)}`}
            </Button>
          </div>
        </>
      )}

      {/* Quick Customer Modal */}
      <CustomerModal
        open={isRegisterModalOpen}
        initialPhone={phoneLookup}
        onClose={() => setIsRegisterModalOpen(false)}
        onCustomerSaved={(newCustomer) => {
          setSelectedCustomer(newCustomer)
          setCustomerName(newCustomer.name)
          setPhoneLookup('')
        }}
      />
    </div>
  )
}
