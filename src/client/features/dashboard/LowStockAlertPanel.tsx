import { formatInteger } from '../../../shared/formatters.js'
import type { ProductDTO } from '../../../shared/types.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { IconAlert, IconCheck } from '../../components/ui/Icons.js'
import { useAuth } from '../../stores/auth.store.js'
import { useRouter } from '../../stores/router.store.js'

export interface LowStockAlertPanelProps {
  readonly products: readonly ProductDTO[]
}

export function LowStockAlertPanel(props: LowStockAlertPanelProps) {
  const { can } = useAuth()
  const { navigate } = useRouter()

  return (
    <Card class="p-5 flex flex-col gap-3.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-xl bg-m3-warning-container text-m3-warning flex items-center justify-center">
            <IconAlert class="w-4 h-4" />
          </span>
          <div>
            <h2 class="text-sm font-semibold text-m3-on-surface">
              Peringatan Stok Menipis
            </h2>
            <p class="text-xs text-m3-on-surface-variant">
              Produk pada atau di bawah batas minimum
            </p>
          </div>
        </div>

        {can('inventory:view') && (
          <Button variant="tonal" size="sm" onClick={() => navigate('/inventory')}>
            Kelola Stok
          </Button>
        )}
      </div>

      {props.products.length === 0 ? (
        <div class="py-8 flex flex-col items-center text-center text-xs text-m3-on-surface-variant">
          <span class="w-10 h-10 rounded-full bg-m3-success-container text-m3-success flex items-center justify-center mb-2">
            <IconCheck />
          </span>
          <p class="font-medium text-m3-on-surface">Semua stok dalam batas aman</p>
          <p class="mt-0.5">Tidak ada produk aktif yang melewati ambang minimum.</p>
        </div>
      ) : (
        <div class="divide-y divide-m3-outline-variant/50">
          {props.products.map((product) => {
            const isOut = product.stockQty === 0
            return (
              <div
                key={product.id}
                class="py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div class="min-w-0">
                  <p class="font-medium text-m3-on-surface truncate">{product.name}</p>
                  <p class="text-m3-on-surface-variant tabular-nums">
                    SKU: {product.sku} · Min: {formatInteger(product.minStockQty)}{' '}
                    {product.unit}
                  </p>
                </div>

                <Badge tone={isOut ? 'danger' : 'warning'} class="tabular-nums">
                  {isOut
                    ? 'Habis (0)'
                    : `Sisa ${formatInteger(product.stockQty)} ${product.unit}`}
                </Badge>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
