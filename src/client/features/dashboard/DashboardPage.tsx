import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type { DashboardMetricsDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import {
  IconAlert,
  IconCatalog,
  IconPos,
  IconReceipt,
  IconRefresh,
} from '../../components/ui/Icons.js'
import { StatCard } from '../../components/ui/StatCard.js'
import { useAuth } from '../../stores/auth.store.js'
import { useRouter } from '../../stores/router.store.js'
import { useToast } from '../../stores/toast.store.js'
import { LowStockAlertPanel } from './LowStockAlertPanel.js'
import { SalesTrendChart } from './SalesTrendChart.js'

export function DashboardPage() {
  const { can } = useAuth()
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [days, setDays] = useState(14)
  const [metrics, setMetrics] = useState<DashboardMetricsDTO | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(
    async (selectedDays: number, signal?: AbortSignal) => {
      setLoading(true)
      try {
        const data = await api.dashboard.getMetrics(selectedDays, signal)
        setMetrics(data)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        showToast(
          err instanceof ClientApiError
            ? err.message
            : 'Gagal memuat ringkasan dashboard.',
          'error',
        )
      } finally {
        setLoading(false)
      }
    },
    [showToast],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadDashboard(days, controller.signal)
    return () => controller.abort()
  }, [days, loadDashboard])

  const canSeeFinancials = can('dashboard:financials')

  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-m3-on-surface">
            Ringkasan Operasional Toko
          </h2>
          <p class="text-xs text-m3-on-surface-variant">
            Pantau penjualan harian, ketersediaan stok, dan produk terlaris secara
            real-time.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="outlined"
            size="sm"
            onClick={() => void loadDashboard(days)}
            disabled={loading}
          >
            <IconRefresh class="w-4 h-4" />
            <span>Muat Ulang</span>
          </Button>

          {can('pos:checkout') && (
            <Button size="sm" onClick={() => navigate('/pos')}>
              <IconPos class="w-4 h-4" />
              <span>Buka Kasir</span>
            </Button>
          )}
        </div>
      </div>

      {loading && !metrics ? (
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              class="h-28 rounded-2xl bg-m3-surface-container animate-pulse"
            />
          ))}
        </div>
      ) : metrics ? (
        <>
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Omzet Hari Ini"
              value={formatRupiah(metrics.todayRevenueAmount)}
              subtitle={`${formatInteger(metrics.todayTransactionCount)} transaksi selesai hari ini`}
              icon={<IconReceipt />}
              tone="primary"
            />

            {canSeeFinancials && metrics.todayGrossProfitAmount !== null ? (
              <StatCard
                label="Estimasi Laba Kotor Hari Ini"
                value={formatRupiah(metrics.todayGrossProfitAmount)}
                subtitle="Berdasarkan snapshot HPP saat transaksi"
                icon={<IconPos />}
                tone="success"
              />
            ) : (
              <StatCard
                label="Nilai Jual Persediaan"
                value={formatRupiah(metrics.totalInventoryRetailValue)}
                subtitle={`${formatInteger(metrics.totalActiveProducts)} SKU produk aktif`}
                icon={<IconCatalog />}
                tone="neutral"
              />
            )}

            <StatCard
              label="Stok Perlu Perhatian"
              value={`${formatInteger(metrics.lowStockCount)} SKU`}
              subtitle={`${formatInteger(metrics.outOfStockCount)} produk stok habis (0)`}
              icon={<IconAlert />}
              tone={metrics.lowStockCount > 0 ? 'warning' : 'success'}
            />

            {canSeeFinancials && metrics.totalInventoryCostValue !== null ? (
              <StatCard
                label="Nilai Modal Persediaan (HPP)"
                value={formatRupiah(metrics.totalInventoryCostValue)}
                subtitle={`Potensi ritel ${formatRupiah(metrics.totalInventoryRetailValue)}`}
                icon={<IconCatalog />}
                tone="neutral"
              />
            ) : (
              <StatCard
                label="Produk Aktif"
                value={`${formatInteger(metrics.totalActiveProducts)} Item`}
                subtitle="Siap ditransaksikan di katalog"
                icon={<IconCatalog />}
                tone="primary"
              />
            )}
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2">
              <SalesTrendChart
                points={metrics.salesTrend}
                days={days}
                onChangeDays={setDays}
              />
            </div>

            <LowStockAlertPanel products={metrics.lowStockProducts} />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card class="p-5 flex flex-col gap-3.5">
              <div>
                <h3 class="text-sm font-semibold text-m3-on-surface">
                  Produk Terlaris ({days} Hari Terakhir)
                </h3>
                <p class="text-xs text-m3-on-surface-variant">
                  Berdasarkan kuantitas unit terjual
                </p>
              </div>

              {metrics.topProducts.length === 0 ? (
                <p class="py-8 text-center text-xs text-m3-on-surface-variant">
                  Belum ada penjualan pada rentang waktu ini.
                </p>
              ) : (
                <div class="divide-y divide-m3-outline-variant/50">
                  {metrics.topProducts.map((prod, index) => (
                    <div
                      key={prod.productId}
                      class="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div class="flex items-center gap-3 min-w-0">
                        <span class="w-6 h-6 rounded-full bg-m3-primary-container text-m3-primary font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {index + 1}
                        </span>
                        <div class="min-w-0">
                          <p class="font-medium text-m3-on-surface truncate">
                            {prod.name}
                          </p>
                          <p class="text-m3-on-surface-variant tabular-nums">
                            {prod.sku} · {formatInteger(prod.soldQty)} {prod.unit} terjual
                          </p>
                        </div>
                      </div>
                      <span class="font-semibold text-m3-on-surface tabular-nums shrink-0">
                        {formatRupiah(prod.revenueAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {can('sales:view') && (
              <Card class="p-5 flex flex-col gap-3.5">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-semibold text-m3-on-surface">
                      Transaksi Terbaru
                    </h3>
                    <p class="text-xs text-m3-on-surface-variant">
                      Aktivitas kasir paling akhir
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/sales')}>
                    Lihat Semua
                  </Button>
                </div>

                {metrics.recentSales.length === 0 ? (
                  <p class="py-8 text-center text-xs text-m3-on-surface-variant">
                    Belum ada riwayat transaksi penjualan.
                  </p>
                ) : (
                  <div class="divide-y divide-m3-outline-variant/50">
                    {metrics.recentSales.map((sale) => (
                      <div
                        key={sale.id}
                        class="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-semibold text-m3-on-surface tabular-nums">
                              {sale.invoiceNumber}
                            </span>
                            <Badge
                              tone={sale.status === 'COMPLETED' ? 'success' : 'danger'}
                            >
                              {SALE_STATUS_LABELS[sale.status]}
                            </Badge>
                          </div>
                          <p class="text-m3-on-surface-variant mt-0.5 truncate">
                            {formatDateTime(sale.createdAt)} ·{' '}
                            {PAYMENT_METHOD_LABELS[sale.paymentMethod]} ·{' '}
                            {sale.cashierName}
                          </p>
                        </div>
                        <span class="font-semibold text-m3-on-surface tabular-nums shrink-0">
                          {formatRupiah(sale.totalAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
