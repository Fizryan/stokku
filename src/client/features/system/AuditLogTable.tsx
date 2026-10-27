import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import {
  AUDIT_ACTION_TYPE_LABELS,
  AUDIT_ACTION_TYPES,
  type AuditActionType,
  ROLE_LABELS,
} from '../../../shared/constants.js'
import { formatDateTime } from '../../../shared/formatters.js'
import type { AuditLogDTO, PaginationMeta } from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge, type BadgeTone } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconClock, IconRefresh, IconShield } from '../../components/ui/Icons.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { SelectField, type SelectOption } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

function getAuditBadgeTone(actionType: AuditActionType): BadgeTone {
  switch (actionType) {
    case 'SALE_VOIDED':
    case 'USER_DEACTIVATED':
      return 'danger'
    case 'USER_ROLE_CHANGED':
    case 'PASSWORD_RESET':
      return 'warning'
    case 'BACKUP_CREATED':
    case 'USER_ACTIVATED':
      return 'success'
    case 'STOCK_ADJUSTED':
      return 'primary'
    default:
      return 'neutral'
  }
}

const ACTION_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'Semua Jenis Aktivitas' },
  ...AUDIT_ACTION_TYPES.map((type) => ({
    value: type,
    label: AUDIT_ACTION_TYPE_LABELS[type],
  })),
]

export function AuditLogTable() {
  const { showToast } = useToast()
  const [logs, setLogs] = useState<readonly AuditLogDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [actionTypeFilter, setActionTypeFilter] = useState<AuditActionType | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  })

  const loadAuditLogs = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const res = await api.audit.list(
          {
            actionType: actionTypeFilter || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: 20,
          },
          signal,
        )
        setLogs(res.items)
        setMeta(res.meta)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError
            ? err.message
            : 'Gagal memuat log audit aktivitas.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [actionTypeFilter, dateFrom, dateTo, page, showToast],
  )

  useEffect(() => {
    const ac = new AbortController()
    void loadAuditLogs(ac.signal)
    return () => ac.abort()
  }, [loadAuditLogs])

  return (
    <div class="space-y-4">
      {/* Filters Card */}
      <Card class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <SelectField
          label="Jenis Aktivitas"
          value={actionTypeFilter}
          options={ACTION_TYPE_OPTIONS}
          onValueChange={(val) => {
            setActionTypeFilter(val as AuditActionType | '')
            setPage(1)
          }}
        />

        <TextField
          label="Dari Tanggal"
          type="date"
          value={dateFrom}
          onValueChange={(val) => {
            setDateFrom(val)
            setPage(1)
          }}
        />

        <TextField
          label="Sampai Tanggal"
          type="date"
          value={dateTo}
          onValueChange={(val) => {
            setDateTo(val)
            setPage(1)
          }}
        />

        <div class="flex items-center gap-2">
          <Button
            variant="outlined"
            size="sm"
            class="flex-1 text-xs"
            onClick={() => {
              setActionTypeFilter('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
          >
            Reset Filter
          </Button>
          <Button
            variant="tonal"
            size="sm"
            title="Segarkan Log"
            class="px-3"
            onClick={() => void loadAuditLogs()}
            disabled={loading}
          >
            <IconRefresh class={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* Logs Table */}
      <Card class="overflow-hidden">
        <div class="p-4 border-b border-m3-outline-variant/60 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <IconShield class="w-4 h-4 text-m3-primary" />
            <h3 class="text-sm font-semibold text-m3-on-surface">
              Riwayat Log Audit & Integritas Sistem
            </h3>
          </div>
          <span class="text-xs text-m3-on-surface-variant font-mono">
            Total {meta.totalItems.toLocaleString('id-ID')} Peristiwa
          </span>
        </div>

        {loading && logs.length === 0 ? (
          <div class="p-12 text-center text-m3-on-surface-variant">
            <IconRefresh class="w-6 h-6 animate-spin mx-auto mb-2 text-m3-primary" />
            <p class="text-xs">Memuat catatan log audit...</p>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<IconShield />}
            title="Tidak Ada Catatan Log"
            description="Tidak ada aktivitas yang sesuai dengan kriteria filter yang dipilih."
          />
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-m3-on-surface">
              <thead class="bg-m3-surface-container text-m3-on-surface-variant border-b border-m3-outline-variant/60">
                <tr>
                  <th class="p-3.5 font-semibold">Waktu</th>
                  <th class="p-3.5 font-semibold">Aktor / Pengguna</th>
                  <th class="p-3.5 font-semibold">Jenis Peristiwa</th>
                  <th class="p-3.5 font-semibold">Entitas Target</th>
                  <th class="p-3.5 font-semibold">Rincian Perubahan (Details)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-m3-outline-variant/40">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    class="hover:bg-m3-surface-container-low/50 transition-colors"
                  >
                    <td class="p-3.5 whitespace-nowrap text-m3-on-surface-variant font-mono text-[11px]">
                      <div class="flex items-center gap-1.5">
                        <IconClock class="w-3.5 h-3.5 text-m3-on-surface-variant/70 shrink-0" />
                        <span>{formatDateTime(log.createdAt)}</span>
                      </div>
                    </td>

                    <td class="p-3.5 whitespace-nowrap">
                      {log.actorName ? (
                        <div>
                          <div class="font-bold text-m3-on-surface">{log.actorName}</div>
                          {log.actorRole && (
                            <div class="mt-0.5">
                              <Badge tone="neutral" class="text-[10px] px-1.5 py-0.2">
                                {ROLE_LABELS[log.actorRole] ?? log.actorRole}
                              </Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span class="text-m3-on-surface-variant italic">
                          Sistem / Background
                        </span>
                      )}
                    </td>

                    <td class="p-3.5 whitespace-nowrap">
                      <Badge tone={getAuditBadgeTone(log.actionType)}>
                        {AUDIT_ACTION_TYPE_LABELS[log.actionType] ?? log.actionType}
                      </Badge>
                    </td>

                    <td class="p-3.5 whitespace-nowrap">
                      <span class="font-mono text-m3-on-surface bg-m3-surface-container px-2 py-0.5 rounded-lg border border-m3-outline-variant/60 text-[11px] font-semibold">
                        {log.resourceType}
                        {log.resourceId ? ` #${log.resourceId}` : ''}
                      </span>
                    </td>

                    <td class="p-3.5 text-m3-on-surface max-w-md break-words">
                      {log.details ? (
                        <div class="bg-m3-surface-container/60 rounded-xl p-2.5 border border-m3-outline-variant/40 text-[11px] font-mono space-y-1">
                          {Object.entries(log.details).map(([key, val]) => (
                            <div key={key} class="flex items-start gap-1.5">
                              <span class="text-m3-on-surface-variant">{key}:</span>
                              <span class="text-m3-on-surface font-sans font-medium">
                                {typeof val === 'object'
                                  ? JSON.stringify(val)
                                  : String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span class="text-m3-on-surface-variant/60">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div class="p-3 border-t border-m3-outline-variant/60">
            <Pagination
              meta={meta}
              onPageChange={(newPage) => {
                setPage(newPage)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
