import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import { ROLE_LABELS, type UserRole } from '../../../shared/constants.js'
import { formatDateShort } from '../../../shared/formatters.js'
import type { UserDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge, type BadgeTone } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconEdit, IconKey, IconPlus, IconUsers } from '../../components/ui/Icons.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'
import { ResetPasswordModal } from './ResetPasswordModal.js'
import { UserFormModal } from './UserFormModal.js'

const ROLE_BADGE_TONES: Readonly<Record<UserRole, BadgeTone>> = {
  OWNER: 'primary',
  WAREHOUSE: 'warning',
  CASHIER: 'neutral',
}

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()

  const [users, setUsers] = useState<readonly UserDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null)
  const [resetTarget, setResetTarget] = useState<UserDTO | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.users.list()
      setUsers(list)
    } catch (err) {
      showToast(
        err instanceof ClientApiError ? err.message : 'Gagal memuat daftar pengguna.',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-m3-on-surface">
            Manajemen Pengguna &amp; Hak Akses
          </h2>
          <p class="text-xs text-m3-on-surface-variant">
            Kelola akun Owner, Staff Gudang, dan Kasir dengan pembatasan hak akses
            berbasis peran (RBAC).
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => {
            setEditingUser(null)
            setFormOpen(true)
          }}
        >
          <IconPlus class="w-4 h-4" />
          <span>Tambah Pengguna</span>
        </Button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <Card variant="filled" class="p-4 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <Badge tone="primary">{ROLE_LABELS.OWNER}</Badge>
          </div>
          <p class="text-m3-on-surface-variant mt-1 leading-relaxed">
            Akses penuh ke keuangan (HPP &amp; laba kotor), katalog, stok, POS, void
            transaksi, ekspor CSV, dan manajemen pengguna.
          </p>
        </Card>

        <Card variant="filled" class="p-4 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <Badge tone="warning">{ROLE_LABELS.WAREHOUSE}</Badge>
          </div>
          <p class="text-m3-on-surface-variant mt-1 leading-relaxed">
            Mengelola katalog produk, kategori, HPP pembelian, opname, serta mutasi Kartu
            Stok tanpa akses kasir &amp; void penjualan.
          </p>
        </Card>

        <Card variant="filled" class="p-4 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <Badge tone="neutral">{ROLE_LABELS.CASHIER}</Badge>
          </div>
          <p class="text-m3-on-surface-variant mt-1 leading-relaxed">
            Fokus operasional Kasir (POS) dan riwayat struk sendiri. Harga modal (HPP) dan
            laba kotor disembunyikan dari API.
          </p>
        </Card>
      </div>

      <Card class="p-4 sm:p-5">
        {loading && users.length === 0 ? (
          <div class="py-12 text-center text-xs text-m3-on-surface-variant">
            Memuat daftar pengguna...
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<IconUsers />}
            title="Belum ada data pengguna"
            description="Tambahkan akun staff untuk mulai memisahkan hak akses operasional."
          />
        ) : (
          <>
            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-m3-outline-variant text-m3-on-surface-variant uppercase tracking-wider text-[11px]">
                    <th class="py-3 px-3 font-semibold">Nama Lengkap</th>
                    <th class="py-3 px-3 font-semibold">Username</th>
                    <th class="py-3 px-3 font-semibold">Peran (RBAC)</th>
                    <th class="py-3 px-3 font-semibold text-center">Status</th>
                    <th class="py-3 px-3 font-semibold">Terdaftar</th>
                    <th class="py-3 px-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-m3-outline-variant/50">
                  {users.map((item) => {
                    const isSelf = item.id === currentUser?.id
                    return (
                      <tr
                        key={item.id}
                        class="hover:bg-m3-surface-container-low/70 transition-colors"
                      >
                        <td class="py-3 px-3 font-semibold text-m3-on-surface">
                          <span>{item.fullName}</span>
                          {isSelf && (
                            <span class="ml-2 text-[11px] font-medium text-m3-primary">
                              (Anda)
                            </span>
                          )}
                        </td>
                        <td class="py-3 px-3 text-m3-on-surface-variant font-mono">
                          @{item.username}
                        </td>
                        <td class="py-3 px-3">
                          <Badge tone={ROLE_BADGE_TONES[item.role]}>
                            {ROLE_LABELS[item.role]}
                          </Badge>
                        </td>
                        <td class="py-3 px-3 text-center">
                          {item.isActive ? (
                            <Badge tone="success">Aktif</Badge>
                          ) : (
                            <Badge tone="neutral">Nonaktif</Badge>
                          )}
                        </td>
                        <td class="py-3 px-3 text-m3-on-surface-variant tabular-nums">
                          {formatDateShort(item.createdAt)}
                        </td>
                        <td class="py-3 px-3 text-right">
                          <div class="inline-flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingUser(item)
                                setFormOpen(true)
                              }}
                            >
                              <IconEdit class="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </Button>
                            {!isSelf && (
                              <Button
                                variant="outlined"
                                size="sm"
                                onClick={() => setResetTarget(item)}
                              >
                                <IconKey class="w-3.5 h-3.5" />
                                <span>Reset Password</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div class="md:hidden flex flex-col gap-3">
              {users.map((item) => {
                const isSelf = item.id === currentUser?.id
                return (
                  <div
                    key={item.id}
                    class="rounded-2xl border border-m3-outline-variant/70 p-3.5 flex flex-col gap-2.5 bg-m3-surface-container-lowest text-xs"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <p class="font-semibold text-sm text-m3-on-surface">
                          {item.fullName} {isSelf ? '(Anda)' : ''}
                        </p>
                        <p class="text-m3-on-surface-variant font-mono">
                          @{item.username}
                        </p>
                      </div>
                      <Badge tone={item.isActive ? 'success' : 'neutral'}>
                        {item.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </div>

                    <div class="flex items-center justify-between pt-2 border-t border-m3-outline-variant/40">
                      <Badge tone={ROLE_BADGE_TONES[item.role]}>
                        {ROLE_LABELS[item.role]}
                      </Badge>
                      <span class="text-m3-on-surface-variant">
                        Sejak {formatDateShort(item.createdAt)}
                      </span>
                    </div>

                    <div class="flex justify-end gap-2 pt-1">
                      {!isSelf && (
                        <Button
                          variant="outlined"
                          size="sm"
                          onClick={() => setResetTarget(item)}
                        >
                          Reset Password
                        </Button>
                      )}
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={() => {
                          setEditingUser(item)
                          setFormOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <UserFormModal
        open={formOpen}
        editingUser={editingUser}
        onClose={() => setFormOpen(false)}
        onSaved={() => void loadUsers()}
      />

      <ResetPasswordModal targetUser={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  )
}
