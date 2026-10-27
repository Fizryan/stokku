import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { CategoryDTO, PaginatedResult, ProductDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import {
  IconCatalog,
  IconCategory,
  IconEdit,
  IconInventory,
  IconPlus,
} from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SearchInput } from '../../components/ui/SearchInput.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'
import { StockMovementModal } from '../inventory/StockMovementModal.js'
import { CategoryManagerModal } from './CategoryManagerModal.js'
import { ProductFormModal } from './ProductFormModal.js'

export function CatalogPage() {
  const { can } = useAuth()
  const { showToast } = useToast()

  const canManageCatalog = can('catalog:manage')
  const canManageInventory = can('inventory:manage')

  const [categories, setCategories] = useState<readonly CategoryDTO[]>([])
  const [productsData, setProductsData] = useState<PaginatedResult<ProductDTO> | null>(
    null,
  )
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [categoryIdFilter, setCategoryIdFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>(
    'active',
  )
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(1)

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductDTO | null>(null)
  const [stockModalProduct, setStockModalProduct] = useState<ProductDTO | null>(null)

  const loadCategories = useCallback(async () => {
    try {
      const list = await api.categories.list()
      setCategories(list)
    } catch {
      // Categories will fallback empty gracefully
    }
  }, [])

  const loadProducts = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const result = await api.products.list(
          {
            search: search || undefined,
            categoryId: categoryIdFilter
              ? Number.parseInt(categoryIdFilter, 10)
              : undefined,
            status: statusFilter,
            lowStockOnly: lowStockOnly || undefined,
            page,
            pageSize: 20,
          },
          signal,
        )
        setProductsData(result)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        showToast(
          err instanceof ClientApiError ? err.message : 'Gagal memuat katalog produk.',
          'error',
        )
      } finally {
        setLoading(false)
      }
    },
    [search, categoryIdFilter, statusFilter, lowStockOnly, page, showToast],
  )

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    const controller = new AbortController()
    void loadProducts(controller.signal)
    return () => controller.abort()
  }, [loadProducts])

  const products = productsData?.items ?? []
  const showCostColumn = products.some((p) => p.costPrice !== null) || canManageCatalog

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-m3-on-surface">
            Katalog Produk &amp; Kategori
          </h2>
          <p class="text-xs text-m3-on-surface-variant">
            Master SKU, harga jual, HPP, serta ambang peringatan stok minimum.
          </p>
        </div>

        {canManageCatalog && (
          <div class="flex items-center gap-2 flex-wrap">
            <Button variant="tonal" size="sm" onClick={() => setCategoryModalOpen(true)}>
              <IconCategory class="w-4 h-4" />
              <span>Kategori</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setEditingProduct(null)
                setProductModalOpen(true)
              }}
            >
              <IconPlus class="w-4 h-4" />
              <span>Tambah Produk</span>
            </Button>
          </div>
        )}
      </div>

      <Card class="p-4 sm:p-5 flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          <SearchInput
            placeholder="Cari nama produk, SKU, atau barcode..."
            onDebouncedChange={(val) => {
              setSearch(val)
              setPage(1)
            }}
            class="lg:col-span-5"
          />

          <SelectField
            value={categoryIdFilter}
            options={[
              { value: '', label: 'Semua Kategori' },
              ...categories.map((c) => ({
                value: String(c.id),
                label: `${c.name} (${c.productCount})`,
              })),
            ]}
            onValueChange={(v) => {
              setCategoryIdFilter(v)
              setPage(1)
            }}
            class="lg:col-span-3"
          />

          <SelectField
            value={statusFilter}
            options={[
              { value: 'active', label: 'Status: Aktif' },
              { value: 'archived', label: 'Status: Diarsipkan' },
              { value: 'all', label: 'Semua Status' },
            ]}
            onValueChange={(v) => {
              setStatusFilter(v as 'active' | 'archived' | 'all')
              setPage(1)
            }}
            class="lg:col-span-2"
          />

          <label class="lg:col-span-2 h-11 px-3.5 rounded-xl border border-m3-outline-variant bg-m3-surface-container-low flex items-center gap-2 text-xs font-medium text-m3-on-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setLowStockOnly((e.currentTarget as HTMLInputElement).checked)
                setPage(1)
              }}
              class="w-4 h-4 accent-m3-primary rounded cursor-pointer"
            />
            <span class="truncate">Stok Menipis</span>
          </label>
        </div>

        {loading && !productsData ? (
          <div class="py-12 text-center text-xs text-m3-on-surface-variant">
            Memuat data katalog produk...
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<IconCatalog />}
            title="Belum ada produk yang cocok"
            description="Tambahkan produk baru atau ubah kata kunci dan filter pencarian Anda."
            action={
              canManageCatalog ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingProduct(null)
                    setProductModalOpen(true)
                  }}
                >
                  <IconPlus class="w-4 h-4" />
                  <span>Tambah Produk Pertama</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop & Tablet Table View */}
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-m3-outline-variant text-m3-on-surface-variant uppercase tracking-wider text-[11px]">
                    <th class="py-3 px-3 font-semibold">SKU / Produk</th>
                    <th class="py-3 px-3 font-semibold">Kategori</th>
                    {showCostColumn && (
                      <th class="py-3 px-3 font-semibold text-right">HPP</th>
                    )}
                    <th class="py-3 px-3 font-semibold text-right">Harga Jual</th>
                    <th class="py-3 px-3 font-semibold text-right">Saldo Stok</th>
                    <th class="py-3 px-3 font-semibold text-center">Status</th>
                    {(canManageCatalog || canManageInventory) && (
                      <th class="py-3 px-3 font-semibold text-right">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant/50">
                  {products.map((prod) => (
                    <tr
                      key={prod.id}
                      class="hover:bg-m3-surface-container-low/70 transition-colors"
                    >
                      <td class="py-3 px-3">
                        <p class="font-semibold text-m3-on-surface">{prod.name}</p>
                        <p class="text-m3-on-surface-variant tabular-nums mt-0.5">
                          {prod.sku}
                          {prod.barcode ? ` · Barcode: ${prod.barcode}` : ''}
                        </p>
                      </td>
                      <td class="py-3 px-3 text-m3-on-surface-variant">
                        {prod.categoryName ?? '—'}
                      </td>
                      {showCostColumn && (
                        <td class="py-3 px-3 text-right tabular-nums text-m3-on-surface-variant">
                          {prod.costPrice !== null ? formatRupiah(prod.costPrice) : '—'}
                        </td>
                      )}
                      <td class="py-3 px-3 text-right font-semibold tabular-nums text-m3-on-surface">
                        {formatRupiah(prod.sellPrice)}
                      </td>
                      <td class="py-3 px-3 text-right tabular-nums">
                        <span
                          class={[
                            'font-semibold',
                            prod.stockQty === 0
                              ? 'text-m3-danger'
                              : prod.isLowStock
                                ? 'text-m3-warning'
                                : 'text-m3-on-surface',
                          ].join(' ')}
                        >
                          {formatInteger(prod.stockQty)} {prod.unit}
                        </span>
                        <p class="text-[11px] text-m3-on-surface-variant">
                          Min: {formatInteger(prod.minStockQty)}
                        </p>
                      </td>
                      <td class="py-3 px-3 text-center">
                        {!prod.isActive ? (
                          <Badge tone="neutral">Arsip</Badge>
                        ) : prod.stockQty === 0 ? (
                          <Badge tone="danger">Habis</Badge>
                        ) : prod.isLowStock ? (
                          <Badge tone="warning">Menipis</Badge>
                        ) : (
                          <Badge tone="success">Aman</Badge>
                        )}
                      </td>
                      {(canManageCatalog || canManageInventory) && (
                        <td class="py-3 px-3 text-right">
                          <div class="inline-flex items-center justify-end gap-1">
                            {canManageInventory && prod.isActive && (
                              <Button
                                variant="tonal"
                                size="sm"
                                onClick={() => setStockModalProduct(prod)}
                              >
                                <IconInventory class="w-3.5 h-3.5" />
                                <span>Stok</span>
                              </Button>
                            )}
                            {canManageCatalog && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingProduct(prod)
                                  setProductModalOpen(true)
                                }}
                              >
                                <IconEdit class="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div class="md:hidden flex flex-col gap-3">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  class="rounded-2xl border border-m3-outline-variant/70 p-3.5 flex flex-col gap-2.5 bg-m3-surface-container-lowest"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-m3-on-surface truncate">
                        {prod.name}
                      </p>
                      <p class="text-xs text-m3-on-surface-variant tabular-nums">
                        {prod.sku} · {prod.categoryName ?? 'Tanpa Kategori'}
                      </p>
                    </div>
                    {!prod.isActive ? (
                      <Badge tone="neutral">Arsip</Badge>
                    ) : prod.stockQty === 0 ? (
                      <Badge tone="danger">Habis</Badge>
                    ) : prod.isLowStock ? (
                      <Badge tone="warning">Menipis</Badge>
                    ) : (
                      <Badge tone="success">Aman</Badge>
                    )}
                  </div>

                  <div class="flex items-center justify-between text-xs pt-1 border-t border-m3-outline-variant/40 tabular-nums">
                    <div>
                      <span class="text-m3-on-surface-variant">Harga Jual: </span>
                      <strong class="text-m3-on-surface">
                        {formatRupiah(prod.sellPrice)}
                      </strong>
                    </div>
                    <div>
                      <span class="text-m3-on-surface-variant">Stok: </span>
                      <strong class="text-m3-on-surface">
                        {formatInteger(prod.stockQty)} {prod.unit}
                      </strong>
                    </div>
                  </div>

                  {(canManageCatalog || canManageInventory) && (
                    <div class="flex justify-end gap-2 pt-1">
                      {canManageInventory && prod.isActive && (
                        <Button
                          variant="tonal"
                          size="sm"
                          onClick={() => setStockModalProduct(prod)}
                        >
                          Mutasi Stok
                        </Button>
                      )}
                      {canManageCatalog && (
                        <Button
                          variant="outlined"
                          size="sm"
                          onClick={() => {
                            setEditingProduct(prod)
                            setProductModalOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {productsData && (
              <Pagination meta={productsData.meta} onPageChange={setPage} />
            )}
          </>
        )}
      </Card>

      <CategoryManagerModal
        open={categoryModalOpen}
        categories={categories}
        onClose={() => setCategoryModalOpen(false)}
        onCategoriesChanged={() => {
          void loadCategories()
          void loadProducts()
        }}
      />

      <ProductFormModal
        open={productModalOpen}
        editingProduct={editingProduct}
        categories={categories}
        onClose={() => setProductModalOpen(false)}
        onSaved={() => {
          void loadCategories()
          void loadProducts()
        }}
      />

      <StockMovementModal
        open={stockModalProduct !== null}
        preselectedProduct={stockModalProduct}
        products={products}
        onClose={() => setStockModalProduct(null)}
        onRecorded={() => {
          void loadProducts()
        }}
      />
    </div>
  )
}
