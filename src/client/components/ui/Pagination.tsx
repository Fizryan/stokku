import { formatInteger } from '../../../shared/formatters.js'
import type { PaginationMeta } from '../../../shared/types.js'
import { Button } from './Button.js'

export interface PaginationProps {
  readonly meta: PaginationMeta
  readonly onPageChange: (nextPage: number) => void
}

export function Pagination(props: PaginationProps) {
  const { page, pageSize, totalItems, totalPages } = props.meta
  if (totalItems === 0) return null

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalItems)

  return (
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-m3-outline-variant/50 text-xs text-m3-on-surface-variant">
      <p class="tabular-nums">
        Menampilkan{' '}
        <span class="font-semibold text-m3-on-surface">{formatInteger(startItem)}</span>–
        <span class="font-semibold text-m3-on-surface">{formatInteger(endItem)}</span>{' '}
        dari{' '}
        <span class="font-semibold text-m3-on-surface">{formatInteger(totalItems)}</span>{' '}
        data
      </p>

      <div class="flex items-center gap-2 self-end sm:self-auto">
        <Button
          variant="outlined"
          size="sm"
          disabled={page <= 1}
          onClick={() => props.onPageChange(page - 1)}
        >
          Sebelumnya
        </Button>
        <span class="px-2.5 font-medium text-m3-on-surface tabular-nums">
          Hal. {page} / {totalPages}
        </span>
        <Button
          variant="outlined"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => props.onPageChange(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  )
}
