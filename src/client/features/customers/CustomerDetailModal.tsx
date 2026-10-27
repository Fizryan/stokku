import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import { LOYALTY_RULES, POINT_MUTATION_TYPE_LABELS } from '../../../shared/constants.js'
import {
  formatDateTime,
  formatInteger,
  formatRupiah,
} from '../../../shared/formatters.js'
import type { CustomerDTO, CustomerPointMutationDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { IconCheck, IconRefresh, IconStar } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'

export interface CustomerDetailModalProps {
  readonly customer: CustomerDTO | null
  readonly onClose: () => void
  readonly onCustomerUpdated?: (updated: CustomerDTO) => void
}

export function CustomerDetailModal(props: CustomerDetailModalProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isOwner = user?.role === 'OWNER'

  const customer = props.customer
  if (!customer) return null

  const [mutations, setMutations] = useState<readonly CustomerPointMutationDTO[]>([])
  const [loadingMutations, setLoadingMutations] = useState(false)

  // Points adjustment form state
  const [showAdjustForm, setShowAdjustForm] = useState(false)
  const [adjustPointsValue, setAdjustPointsValue] = useState('')
  const [adjustDescription, setAdjustDescription] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const loadMutations = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingMutations(true)
      try {
        const res = await api.customers.listMutations(customer.id, signal)
        setMutations(res)
      } catch {
        // Non-blocking
      } finally {
        setLoadingMutations(false)
      }
    },
    [customer.id],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadMutations(controller.signal)
    return () => controller.abort()
  }, [loadMutations])

  const handleAdjustSubmit = async (e: Event) => {
    e.preventDefault()
    setAdjustError(null)

    const pointsNum = Number.parseInt(adjustPointsValue, 10)
    if (Number.isNaN(pointsNum) || pointsNum === 0) {
      setAdjustError('Masukkan nominal poin yang valid (tidak boleh 0).')
      return
    }
    if (!adjustDescription.trim()) {
      setAdjustError('Alasan penyesuaian poin wajib diisi.')
      return
    }

    setAdjusting(true)
    try {
      const updated = await api.customers.adjustPoints(customer.id, {
        points: pointsNum,
        description: adjustDescription.trim(),
      })
      showToast(
        `Saldo poin berhasil disesuaikan (${pointsNum > 0 ? `+${pointsNum}` : pointsNum} poin).`,
        'success',
      )
      setShowAdjustForm(false)
      setAdjustPointsValue('')
      setAdjustDescription('')
      props.onCustomerUpdated?.(updated)
      void loadMutations()
    } catch (err) {
      setAdjustError(
        err instanceof ClientApiError ? err.message : 'Gagal melakukan penyesuaian poin.',
      )
    } finally {
      setAdjusting(false)
    }
  }

  const rupiahEquivalent = customer.pointsBalance * LOYALTY_RULES.POINT_VALUE_IN_RUPIAH

  return (
    <Modal
      open={Boolean(customer)}
      title={`Profil Pelanggan — ${customer.name}`}
      description="Histori perolehan dan penukaran poin reward serta ringkasan akumulasi belanja."
      maxWidthClass="max-w-2xl"
      onClose={props.onClose}
      footer={
        <div class="w-full flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Tutup
          </Button>
        </div>
      }
    >
      <div class="space-y-4">
        {/* Top 3 Stat Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card class="p-3 bg-m3-surface-container-low border border-m3-outline-variant">
            <div class="flex items-center gap-1.5 text-xs text-m3-on-surface-variant font-medium">
              <IconStar class="w-4 h-4 text-amber-500" />
              <span>Saldo Poin Loyalitas</span>
            </div>
            <p class="text-xl font-bold text-m3-primary mt-1">
              {formatInteger(customer.pointsBalance)}{' '}
              <span class="text-xs font-normal text-m3-on-surface-variant">Poin</span>
            </p>
            <p class="text-[11px] text-m3-on-surface-variant mt-0.5">
              Setara diskon {formatRupiah(rupiahEquivalent)}
            </p>
          </Card>

          <Card class="p-3 bg-m3-surface-container-low border border-m3-outline-variant">
            <p class="text-xs text-m3-on-surface-variant font-medium">
              Total Belanja (CLV)
            </p>
            <p class="text-xl font-bold text-m3-on-surface mt-1">
              {formatRupiah(customer.totalSpend)}
            </p>
            <p class="text-[11px] text-m3-on-surface-variant mt-0.5">
              Akumulasi belanja terselesaikan
            </p>
          </Card>

          <Card class="p-3 bg-m3-surface-container-low border border-m3-outline-variant">
            <p class="text-xs text-m3-on-surface-variant font-medium">
              Frekuensi Kunjungan
            </p>
            <p class="text-xl font-bold text-m3-on-surface mt-1">
              {formatInteger(customer.visitCount)}{' '}
              <span class="text-xs font-normal text-m3-on-surface-variant">
                Transaksi
              </span>
            </p>
            <p class="text-[11px] text-m3-on-surface-variant mt-0.5">
              Status:{' '}
              <Badge tone={customer.isActive ? 'success' : 'neutral'}>
                {customer.isActive ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </p>
          </Card>
        </div>

        {/* Identity & Contact Details */}
        <div class="p-3 bg-m3-surface-container-low border border-m3-outline-variant rounded-xl text-xs grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <span class="text-m3-on-surface-variant">No. Telepon / WhatsApp:</span>
            <p class="font-bold text-m3-on-surface mt-0.5 font-mono">{customer.phone}</p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant">Email:</span>
            <p class="font-medium text-m3-on-surface mt-0.5">{customer.email ?? '-'}</p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant">Alamat:</span>
            <p class="font-medium text-m3-on-surface mt-0.5">{customer.address ?? '-'}</p>
          </div>
          <div>
            <span class="text-m3-on-surface-variant">Terdaftar Sejak:</span>
            <p class="font-medium text-m3-on-surface mt-0.5">
              {formatDateTime(customer.createdAt)}
            </p>
          </div>
          {customer.notes && (
            <div class="sm:col-span-2 pt-1 border-t border-m3-outline-variant">
              <span class="text-m3-on-surface-variant">Catatan Tambahan:</span>
              <p class="text-m3-on-surface mt-0.5 italic">{customer.notes}</p>
            </div>
          )}
        </div>

        {/* Owner Points Adjustment Action */}
        {isOwner && (
          <div class="border border-m3-outline-variant rounded-xl p-3 bg-m3-surface-container-low/40">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-xs text-m3-on-surface">
                  Penyesuaian Saldo Poin Manual
                </p>
                <p class="text-[11px] text-m3-on-surface-variant">
                  Koreksi atau berikan bonus loyalitas khusus yang diaudit langsung ke
                  buku besar.
                </p>
              </div>
              <Button
                variant={showAdjustForm ? 'outlined' : 'filled'}
                size="sm"
                onClick={() => setShowAdjustForm(!showAdjustForm)}
              >
                {showAdjustForm ? 'Tutup Form' : 'Sesuaikan Poin'}
              </Button>
            </div>

            {showAdjustForm && (
              <form
                onSubmit={handleAdjustSubmit}
                class="mt-3 pt-3 border-t border-m3-outline-variant space-y-3"
              >
                {adjustError && (
                  <div class="p-2.5 bg-m3-danger-container/40 border border-m3-danger/30 rounded-xl text-m3-danger text-xs">
                    {adjustError}
                  </div>
                )}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <TextField
                    label="Jumlah Poin (+ Tambah / - Kurang)"
                    placeholder="Contoh: 50 atau -20"
                    value={adjustPointsValue}
                    required
                    disabled={adjusting}
                    onValueChange={setAdjustPointsValue}
                  />
                  <TextField
                    label="Alasan Penyesuaian"
                    placeholder="Contoh: Bonus ulang tahun pelanggan"
                    value={adjustDescription}
                    required
                    disabled={adjusting}
                    onValueChange={setAdjustDescription}
                  />
                </div>
                <div class="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={adjusting}
                    onClick={() => setShowAdjustForm(false)}
                  >
                    Batal
                  </Button>
                  <Button variant="filled" size="sm" loading={adjusting} type="submit">
                    <IconCheck class="w-4 h-4" />
                    <span>Konfirmasi Penyesuaian</span>
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Mutation Ledger History */}
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider">
              Buku Besar Riwayat Poin (Audit Trail)
            </h4>
            <Button
              variant="ghost"
              size="sm"
              loading={loadingMutations}
              onClick={() => void loadMutations()}
            >
              <IconRefresh class="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </Button>
          </div>

          <div class="overflow-x-auto rounded-xl border border-m3-outline-variant">
            {loadingMutations ? (
              <div class="p-6 text-center text-xs text-m3-on-surface-variant">
                Memuat riwayat mutasi poin...
              </div>
            ) : mutations.length === 0 ? (
              <div class="p-6 text-center text-xs text-m3-on-surface-variant">
                Belum ada aktivitas mutasi poin untuk pelanggan ini.
              </div>
            ) : (
              <table class="w-full text-left text-xs">
                <thead class="bg-m3-surface-container text-m3-on-surface-variant font-semibold">
                  <tr>
                    <th class="py-2.5 px-3">Waktu</th>
                    <th class="py-2.5 px-3">Jenis Mutasi</th>
                    <th class="py-2.5 px-3 text-right">Poin</th>
                    <th class="py-2.5 px-3">Keterangan</th>
                    <th class="py-2.5 px-3">Operator</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant">
                  {mutations.map((m) => {
                    const isPositive = m.points > 0
                    return (
                      <tr key={m.id} class="hover:bg-m3-surface-container-low/50">
                        <td class="py-2 px-3 text-m3-on-surface whitespace-nowrap">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td class="py-2 px-3">
                          <Badge tone={isPositive ? 'success' : 'warning'}>
                            {POINT_MUTATION_TYPE_LABELS[m.mutationType]}
                          </Badge>
                        </td>
                        <td class="py-2 px-3 text-right font-bold whitespace-nowrap">
                          <span
                            class={
                              isPositive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {isPositive
                              ? `+${formatInteger(m.points)}`
                              : formatInteger(m.points)}
                          </span>
                        </td>
                        <td class="py-2 px-3 text-m3-on-surface">{m.description}</td>
                        <td class="py-2 px-3 text-m3-on-surface-variant whitespace-nowrap">
                          {m.actorName}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
