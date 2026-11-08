import { useEffect, useState } from 'hono/jsx/dom'
import { formatInteger } from '../../../shared/formatters.js'
import type {
  ReplenishmentRecommendationDTO,
  SupplierDTO,
} from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Card } from '../../components/ui/Card.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { useToast } from '../../stores/toast.store.js'

export interface ReplenishmentPanelProps {
  readonly suppliers: readonly SupplierDTO[]
}

export function ReplenishmentPanel({ suppliers }: ReplenishmentPanelProps) {
  const { showToast } = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [recommendations, setRecommendations] = useState<
    readonly ReplenishmentRecommendationDTO[]
  >([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (supplierId || suppliers.length === 0) return
    const firstSupplier = suppliers[0]
    if (firstSupplier) setSupplierId(String(firstSupplier.id))
  }, [supplierId, suppliers])

  useEffect(() => {
    if (!supplierId) {
      setRecommendations([])
      return
    }

    let active = true
    setLoading(true)
    void api.purchases
      .recommendations(Number(supplierId))
      .then((result) => {
        if (active) setRecommendations(result)
      })
      .catch((error: unknown) => {
        if (active) {
          showToast(
            error instanceof ClientApiError
              ? error.message
              : 'Gagal menghitung rekomendasi pengadaan.',
            'error',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [supplierId, showToast])

  if (suppliers.length === 0) return null

  return (
    <Card class="p-4 sm:p-5 space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold text-m3-on-surface">Rekomendasi Pengadaan</h2>
          <p class="text-xs text-m3-on-surface-variant mt-1">
            Perkiraan kebutuhan memakai penjualan 30 hari terakhir, stok minimum, dan lead
            time supplier. Konfirmasi jumlah sebelum membuat faktur.
          </p>
        </div>
        <div class="w-full sm:w-64">
          <SelectField
            label="Supplier acuan"
            value={supplierId}
            onValueChange={setSupplierId}
            options={suppliers.map((supplier) => ({
              value: String(supplier.id),
              label: `${supplier.name} (${supplier.leadTimeDays} hari)`,
            }))}
          />
        </div>
      </div>

      {loading ? (
        <p class="py-4 text-center text-xs text-m3-on-surface-variant">
          Menghitung rekomendasi...
        </p>
      ) : recommendations.length === 0 ? (
        <p class="py-4 text-center text-xs text-m3-on-surface-variant">
          Tidak ada kebutuhan restock berdasarkan stok dan penjualan saat ini.
        </p>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-m3-on-surface-variant border-b border-m3-outline-variant">
              <tr>
                <th class="py-2 pr-3">Produk</th>
                <th class="py-2 px-3 text-right">Stok</th>
                <th class="py-2 px-3 text-right">Rata-rata/hari</th>
                <th class="py-2 pl-3 text-right">Saran pesan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-m3-outline-variant/50">
              {recommendations.map((item) => (
                <tr key={item.productId}>
                  <td class="py-2 pr-3">
                    <span class="font-medium">{item.productName}</span>
                    <span class="block text-[10px] text-m3-on-surface-variant">
                      {item.sku}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-right tabular-nums">
                    {formatInteger(item.stockQty)} / min {formatInteger(item.minStockQty)}
                  </td>
                  <td class="py-2 px-3 text-right tabular-nums">
                    {item.avgDailySales.toFixed(1)} {item.unit}
                  </td>
                  <td class="py-2 pl-3 text-right font-bold text-m3-primary tabular-nums">
                    {formatInteger(item.recommendedQty)} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
