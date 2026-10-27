import { useCallback, useEffect, useMemo, useState } from 'hono/jsx/dom'
import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { CategoryDTO, ProductDTO, SaleDetailDTO } from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { BottomSheet } from '../../components/ui/BottomSheet.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconCart, IconCatalog, IconPlus } from '../../components/ui/Icons.js'
import { SearchInput } from '../../components/ui/SearchInput.js'
import { usePosCart } from '../../stores/pos-cart.store.js'
import { useToast } from '../../stores/toast.store.js'
import { ReceiptModal } from '../sales/ReceiptModal.js'
import { CheckoutModal } from './CheckoutModal.js'
import { PosCartPanel } from './PosCartPanel.js'

export function PosPage() {
  const {
    lines,
    totalItemsCount,
    grandTotalAmount,
    addProduct,
    syncProductStockSnapshot,
  } = usePosCart()
  const { showToast } = useToast()

  const [categories, setCategories] = useState<readonly CategoryDTO[]>([])
  const [products, setProducts] = useState<readonly ProductDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [completedReceipt, setCompletedReceipt] = useState<SaleDetailDTO | null>(null)

  const loadCategories = useCallback(async () => {
    try {
      const list = await api.categories.list()
      setCategories(list)
    } catch {
      // Ignore optional category filter errors
    }
  }, [])

  const loadProducts = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.products.list(
          {
            search: search || undefined,
            categoryId: selectedCategoryId ?? undefined,
            status: 'active',
            page: 1,
            pageSize: 60,
          },
          signal,
        )
        setProducts(res.items)
        syncProductStockSnapshot(res.items)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError
            ? err.message
            : 'Gagal memuat daftar produk kasir.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [search, selectedCategoryId, syncProductStockSnapshot, showToast],
  )

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    const controller = new AbortController()
    void loadProducts(controller.signal)
    return () => controller.abort()
  }, [loadProducts])

  const cartQtyMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const line of lines) {
      map.set(line.productId, line.qty)
    }
    return map
  }, [lines])

  const handleAddTile = (product: ProductDTO) => {
    const res = addProduct(product, 1)
    if (!res.added && res.reason) {
      showToast(res.reason, 'warning')
    }
  }

  const handleBarcodeEnter = async (code: string, clearInput: () => void) => {
    try {
      const matched = await api.products.lookupByCode(code)
      const res = addProduct(matched, 1)
      if (!res.added && res.reason) {
        showToast(res.reason, 'warning')
        return
      }
      clearInput()
      showToast(`"${matched.name}" ditambahkan ke keranjang.`, 'success')
    } catch (err) {
      showToast(
        err instanceof ClientApiError ? err.message : `Kode "${code}" tidak ditemukan.`,
        'warning',
      )
    }
  }

  return (
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-20 lg:pb-0">
      {/* Left Workspace: Search, Category Pills & Product Grid */}
      <div class="lg:col-span-8 flex flex-col gap-4">
        <Card class="p-4 flex flex-col gap-3">
          <SearchInput
            placeholder="Scan barcode + tekan Enter, atau ketik nama produk..."
            ariaLabel="Pencarian barcode atau produk kasir"
            value={search}
            onDebouncedChange={setSearch}
            onEnterSubmit={(code, clear) => {
              void handleBarcodeEnter(code, clear)
            }}
          />

          {categories.length > 0 && (
            <div class="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                class={[
                  'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                  selectedCategoryId === null
                    ? 'bg-m3-primary text-m3-on-primary'
                    : 'bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high',
                ].join(' ')}
              >
                Semua Produk
              </button>
              {categories.map((cat) => {
                const active = selectedCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    class={[
                      'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                      active
                        ? 'bg-m3-primary text-m3-on-primary'
                        : 'bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high',
                    ].join(' ')}
                  >
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {loading && products.length === 0 ? (
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                class="h-32 rounded-2xl bg-m3-surface-container animate-pulse"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconCatalog />}
              title="Produk tidak ditemukan"
              description="Coba kata kunci lain atau pastikan produk sudah diaktifkan pada menu Katalog."
            />
          </Card>
        ) : (
          <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((prod) => {
              const inCart = cartQtyMap.get(prod.id) ?? 0
              const remaining = prod.stockQty - inCart
              const disabled = prod.stockQty <= 0

              return (
                <button
                  key={prod.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleAddTile(prod)}
                  class={[
                    'group text-left rounded-2xl p-3.5 border transition-all duration-150 flex flex-col justify-between gap-3 select-none',
                    disabled
                      ? 'bg-m3-surface-container/60 border-m3-outline-variant/40 opacity-55 cursor-not-allowed'
                      : inCart > 0
                        ? 'bg-m3-primary-container/35 border-m3-primary shadow-xs cursor-pointer'
                        : 'bg-m3-surface-container-lowest border-m3-outline-variant/70 hover:border-m3-primary/60 hover:bg-m3-surface-container-low/50 cursor-pointer',
                  ].join(' ')}
                >
                  <div class="flex flex-col gap-1 min-w-0 w-full">
                    <div class="flex items-center justify-between gap-1.5">
                      <span class="text-[11px] font-medium text-m3-on-surface-variant tabular-nums truncate">
                        {prod.sku}
                      </span>
                      {inCart > 0 && (
                        <Badge tone="primary" class="tabular-nums">
                          {inCart}x
                        </Badge>
                      )}
                    </div>
                    <p class="text-xs sm:text-sm font-semibold text-m3-on-surface line-clamp-2 leading-snug">
                      {prod.name}
                    </p>
                  </div>

                  <div class="w-full pt-2 border-t border-m3-outline-variant/40 flex items-end justify-between gap-2">
                    <div>
                      <p class="text-sm font-bold text-m3-primary tabular-nums">
                        {formatRupiah(prod.sellPrice)}
                      </p>
                      <p
                        class={[
                          'text-[11px] tabular-nums',
                          remaining <= 0
                            ? 'text-m3-danger font-medium'
                            : prod.isLowStock
                              ? 'text-m3-warning'
                              : 'text-m3-on-surface-variant',
                        ].join(' ')}
                      >
                        {prod.stockQty === 0
                          ? 'Stok Habis'
                          : `Sisa ${formatInteger(remaining)} ${prod.unit}`}
                      </p>
                    </div>

                    {!disabled && (
                      <span class="w-7 h-7 rounded-full bg-m3-primary-container text-m3-primary group-hover:bg-m3-primary group-hover:text-m3-on-primary flex items-center justify-center transition-colors shrink-0">
                        <IconPlus class="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Desktop Persistent Cart Panel */}
      <Card class="hidden lg:block lg:col-span-4 sticky top-20 p-5">
        <PosCartPanel onOpenCheckout={() => setCheckoutOpen(true)} />
      </Card>

      {/* Mobile / Tablet Floating Cart Trigger Bar */}
      {lines.length > 0 && (
        <div class="lg:hidden fixed bottom-18 md:bottom-4 inset-x-4 z-30">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            class="w-full h-14 px-5 rounded-full bg-m3-primary text-m3-on-primary shadow-xl flex items-center justify-between gap-3 cursor-pointer"
          >
            <div class="flex items-center gap-2.5">
              <IconCart />
              <span class="text-sm font-semibold tabular-nums">
                {formatInteger(totalItemsCount)} Item di Keranjang
              </span>
            </div>
            <span class="text-sm font-bold tabular-nums">
              {formatRupiah(grandTotalAmount)} →
            </span>
          </button>
        </div>
      )}

      <BottomSheet
        open={mobileCartOpen}
        title="Keranjang Belanja"
        onClose={() => setMobileCartOpen(false)}
      >
        <PosCartPanel
          onOpenCheckout={() => {
            setMobileCartOpen(false)
            setCheckoutOpen(true)
          }}
        />
      </BottomSheet>

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onCheckoutSuccess={(receipt) => {
          setCompletedReceipt(receipt)
          void loadProducts()
        }}
      />

      <ReceiptModal sale={completedReceipt} onClose={() => setCompletedReceipt(null)} />
    </div>
  )
}
