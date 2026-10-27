import { useState } from 'hono/jsx/dom'
import { formatInteger } from '../../../shared/formatters.js'
import type { CategoryDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { IconEdit, IconTrash } from '../../components/ui/Icons.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface CategoryManagerModalProps {
  readonly open: boolean
  readonly categories: readonly CategoryDTO[]
  readonly onClose: () => void
  readonly onCategoriesChanged: () => void
}

export function CategoryManagerModal(props: CategoryManagerModalProps) {
  const { showToast } = useToast()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setDescription('')
    setErrorMessage(null)
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrorMessage(null)
    setSaving(true)

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
      }
      if (editingId !== null) {
        await api.categories.update(editingId, payload)
        showToast('Kategori berhasil diperbarui.', 'success')
      } else {
        await api.categories.create(payload)
        showToast('Kategori baru berhasil ditambahkan.', 'success')
      }
      resetForm()
      props.onCategoriesChanged()
    } catch (err) {
      setErrorMessage(
        err instanceof ClientApiError ? err.message : 'Gagal menyimpan kategori.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (cat: CategoryDTO) => {
    if (cat.productCount > 0) {
      showToast(
        `Kategori "${cat.name}" masih digunakan oleh ${cat.productCount} produk.`,
        'warning',
      )
      return
    }
    try {
      await api.categories.remove(cat.id)
      if (editingId === cat.id) resetForm()
      showToast(`Kategori "${cat.name}" dihapus.`, 'info')
      props.onCategoriesChanged()
    } catch (err) {
      showToast(
        err instanceof ClientApiError ? err.message : 'Gagal menghapus kategori.',
        'error',
      )
    }
  }

  return (
    <Modal
      open={props.open}
      title="Kelola Kategori Produk"
      description="Kelompokkan produk agar pencarian di katalog dan kasir lebih rapi."
      maxWidthClass="max-w-xl"
      onClose={() => {
        resetForm()
        props.onClose()
      }}
    >
      <div class="flex flex-col gap-5">
        <form
          onSubmit={handleSubmit}
          class="p-4 rounded-2xl bg-m3-surface-container-low flex flex-col gap-3"
        >
          {errorMessage && (
            <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3 py-2 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label={editingId !== null ? 'Ubah Nama Kategori' : 'Nama Kategori Baru'}
              placeholder="Contoh: Minuman Dingin"
              value={name}
              onValueChange={setName}
              required
            />
            <TextField
              label="Deskripsi (Opsional)"
              placeholder="Keterangan singkat"
              value={description}
              onValueChange={setDescription}
            />
          </div>

          <div class="flex justify-end gap-2">
            {editingId !== null && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Batal Edit
              </Button>
            )}
            <Button type="submit" size="sm" loading={saving}>
              {editingId !== null ? 'Simpan Perubahan' : 'Tambah Kategori'}
            </Button>
          </div>
        </form>

        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant">
            Daftar Kategori ({formatInteger(props.categories.length)})
          </h3>

          {props.categories.length === 0 ? (
            <p class="py-6 text-center text-xs text-m3-on-surface-variant">
              Belum ada kategori terdaftar.
            </p>
          ) : (
            <div class="divide-y divide-m3-outline-variant/60 rounded-2xl border border-m3-outline-variant/60 overflow-hidden">
              {props.categories.map((cat) => (
                <div
                  key={cat.id}
                  class="px-4 py-3 bg-m3-surface-container-lowest flex items-center justify-between gap-3 text-xs"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-m3-on-surface">{cat.name}</span>
                      <Badge tone="neutral" class="tabular-nums">
                        {formatInteger(cat.productCount)} produk
                      </Badge>
                    </div>
                    {cat.description && (
                      <p class="text-m3-on-surface-variant mt-0.5 truncate">
                        {cat.description}
                      </p>
                    )}
                  </div>

                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(cat.id)
                        setName(cat.name)
                        setDescription(cat.description ?? '')
                        setErrorMessage(null)
                      }}
                      title="Ubah kategori"
                      class="w-8 h-8 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-surface-container cursor-pointer"
                    >
                      <IconEdit class="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(cat)
                      }}
                      title="Hapus kategori"
                      class="w-8 h-8 rounded-full flex items-center justify-center text-m3-danger hover:bg-m3-danger-container/50 cursor-pointer"
                    >
                      <IconTrash class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
