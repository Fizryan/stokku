import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import type { SupplierDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconEdit, IconPlus, IconTruck } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface SupplierManagerModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onSupplierMutated?: () => void
}

export function SupplierManagerModal(props: SupplierManagerModalProps) {
  const { showToast } = useToast()
  const [suppliers, setSuppliers] = useState<readonly SupplierDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Form Fields
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.suppliers.list({ pageSize: 100 })
      setSuppliers(res.items)
    } catch {
      showToast('Gagal memuat daftar supplier.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (props.open) {
      void loadSuppliers()
      resetForm()
    }
  }, [props.open, loadSuppliers])

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setName('')
    setContactPerson('')
    setPhone('')
    setAddress('')
    setNotes('')
    setIsActive(true)
    setErrorMessage(null)
  }

  const startEdit = (s: SupplierDTO) => {
    setIsEditing(true)
    setEditingId(s.id)
    setName(s.name)
    setContactPerson(s.contactPerson ?? '')
    setPhone(s.phone ?? '')
    setAddress(s.address ?? '')
    setNotes(s.notes ?? '')
    setIsActive(s.isActive)
    setErrorMessage(null)
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (editingId) {
        await api.suppliers.update(editingId, {
          name: name.trim(),
          contactPerson: contactPerson.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          isActive,
        })
        showToast(`Supplier "${name.trim()}" berhasil diperbarui.`, 'success')
      } else {
        await api.suppliers.create({
          name: name.trim(),
          contactPerson: contactPerson.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        })
        showToast(`Supplier "${name.trim()}" berhasil ditambahkan.`, 'success')
      }

      resetForm()
      void loadSuppliers()
      props.onSupplierMutated?.()
    } catch (err) {
      const msg =
        err instanceof ClientApiError ? err.message : 'Gagal menyimpan data supplier.'
      setErrorMessage(msg)
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Kelola Data Pemasok (Supplier)"
      maxWidthClass="max-w-3xl"
    >
      <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Supplier List */}
        <div class="md:col-span-6 flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-m3-on-surface uppercase tracking-wider">
              Daftar Supplier ({suppliers.length})
            </h3>
            {!isEditing && (
              <Button size="sm" variant="tonal" onClick={resetForm}>
                <IconPlus class="w-3.5 h-3.5 mr-1" />
                Tambah Baru
              </Button>
            )}
          </div>

          {loading ? (
            <div class="space-y-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  class="h-16 rounded-xl bg-m3-surface-container animate-pulse"
                />
              ))}
            </div>
          ) : suppliers.length === 0 ? (
            <EmptyState
              icon={<IconTruck />}
              title="Belum ada supplier"
              description="Tambahkan supplier pertama untuk mulai mencatat faktur pembelian."
            />
          ) : (
            <div class="divide-y divide-m3-outline-variant/50">
              {suppliers.map((s) => (
                <div
                  key={s.id}
                  class={[
                    'p-3 rounded-2xl transition-colors flex items-start justify-between gap-3',
                    editingId === s.id
                      ? 'bg-m3-primary-container/30 border border-m3-primary/40'
                      : 'hover:bg-m3-surface-container-low',
                  ].join(' ')}
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-xs font-bold text-m3-on-surface truncate">
                        {s.name}
                      </p>
                      <Badge
                        tone={s.isActive ? 'success' : 'neutral'}
                        class="text-[10px]"
                      >
                        {s.isActive ? 'Aktif' : 'Arsip'}
                      </Badge>
                    </div>
                    {s.contactPerson && (
                      <p class="text-[11px] text-m3-on-surface-variant mt-0.5">
                        Kontak: {s.contactPerson} {s.phone ? `(${s.phone})` : ''}
                      </p>
                    )}
                    {s.address && (
                      <p class="text-[10px] text-m3-on-surface-variant truncate mt-0.5">
                        {s.address}
                      </p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(s)}
                    aria-label={`Edit ${s.name}`}
                  >
                    <IconEdit class="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Create / Edit Form */}
        <div class="md:col-span-6 flex flex-col gap-3 border-t md:border-t-0 md:border-l border-m3-outline-variant/60 pt-4 md:pt-0 md:pl-5">
          <div class="flex items-center justify-between pb-2 border-b border-m3-outline-variant/40">
            <h3 class="text-xs font-bold text-m3-on-surface uppercase tracking-wider">
              {editingId ? 'Edit Data Supplier' : 'Tambah Supplier Baru'}
            </h3>
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                class="text-xs text-m3-primary hover:underline cursor-pointer"
              >
                + Formulir Baru
              </button>
            )}
          </div>

          {errorMessage && (
            <div class="p-2.5 rounded-xl bg-m3-danger-container/60 border border-m3-danger/40 text-xs text-m3-danger">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} class="flex flex-col gap-3">
            <TextField
              label="Nama Supplier / Distributor"
              placeholder="Misal: PT Sumber Pangan Makmur"
              value={name}
              onValueChange={setName}
              disabled={submitting}
              required
            />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <TextField
                label="Nama Kontak (Sales/PIC)"
                placeholder="Pak Budi"
                value={contactPerson}
                onValueChange={setContactPerson}
                disabled={submitting}
              />
              <TextField
                label="No. Telepon / WhatsApp"
                placeholder="08123456789"
                value={phone}
                onValueChange={setPhone}
                disabled={submitting}
              />
            </div>

            <TextField
              label="Alamat Gudang / Kantor"
              placeholder="Jl. Raya Industri No. 12"
              value={address}
              onValueChange={setAddress}
              disabled={submitting}
            />

            <TextField
              label="Catatan Rekening / Tempo"
              placeholder="BCA 12345678 a.n. PT SPM (Tempo 30 hari)"
              value={notes}
              onValueChange={setNotes}
              disabled={submitting}
            />

            {editingId && (
              <label class="flex items-center gap-2 text-xs text-m3-on-surface cursor-pointer select-none py-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) =>
                    setIsActive((e.currentTarget as HTMLInputElement).checked)
                  }
                  class="rounded text-m3-primary focus:ring-m3-primary"
                />
                Status Supplier Aktif
              </label>
            )}

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-m3-outline-variant/40">
              <Button type="submit" loading={submitting} fullWidth>
                {editingId ? 'Simpan Perubahan' : 'Tambah Supplier'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}
