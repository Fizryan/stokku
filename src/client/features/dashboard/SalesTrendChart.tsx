import { formatInteger, formatRupiah } from '../../../shared/formatters.js'
import type { DailySalesPointDTO } from '../../../shared/types.js'
import { Card } from '../../components/ui/Card.js'

export interface SalesTrendChartProps {
  readonly points: readonly DailySalesPointDTO[]
  readonly days: number
  readonly onChangeDays: (days: number) => void
}

const DAY_OPTIONS = [7, 14, 30] as const

export function SalesTrendChart(props: SalesTrendChartProps) {
  const maxRevenue = Math.max(1, ...props.points.map((point) => point.revenueAmount))
  const totalWindowRevenue = props.points.reduce((acc, p) => acc + p.revenueAmount, 0)
  const totalWindowTx = props.points.reduce((acc, p) => acc + p.transactionCount, 0)

  return (
    <Card class="p-5 flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-m3-on-surface">
            Tren Omzet Penjualan ({props.days} Hari Terakhir)
          </h2>
          <p class="text-xs text-m3-on-surface-variant mt-0.5 tabular-nums">
            Total periode:{' '}
            <strong class="text-m3-on-surface">{formatRupiah(totalWindowRevenue)}</strong>{' '}
            ({formatInteger(totalWindowTx)} transaksi)
          </p>
        </div>

        <div class="inline-flex rounded-full bg-m3-surface-container p-1 self-start sm:self-auto">
          {DAY_OPTIONS.map((d) => {
            const active = props.days === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => props.onChangeDays(d)}
                class={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-m3-primary text-m3-on-primary'
                    : 'text-m3-on-surface-variant hover:text-m3-on-surface',
                ].join(' ')}
              >
                {d}H
              </button>
            )
          })}
        </div>
      </div>

      <div class="h-48 pt-4 flex items-end gap-1.5 sm:gap-2 border-b border-m3-outline-variant/60 pb-2">
        {props.points.map((point) => {
          const heightPct =
            point.revenueAmount === 0
              ? 3
              : Math.max(8, Math.round((point.revenueAmount / maxRevenue) * 100))
          const shortDate = point.date.slice(5).replace('-', '/')

          return (
            <div
              key={point.date}
              title={`${point.date}: ${formatRupiah(point.revenueAmount)} (${point.transactionCount} transaksi)`}
              class="group flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5"
            >
              <div class="w-full flex-1 flex items-end justify-center">
                <div
                  style={`height: ${heightPct}%`}
                  class={[
                    'w-full max-w-8 rounded-t-lg transition-all duration-200',
                    point.revenueAmount > 0
                      ? 'bg-m3-primary/85 group-hover:bg-m3-primary'
                      : 'bg-m3-surface-container-high',
                  ].join(' ')}
                />
              </div>
              <span
                class={[
                  'text-[10px] text-m3-on-surface-variant tabular-nums truncate max-w-full',
                  props.points.length > 14 ? 'hidden sm:inline' : '',
                ].join(' ')}
              >
                {shortDate}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
