import { useEffect, useState } from 'hono/jsx/dom'
import type { CustomerDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface CustomerModalProps {
  readonly open: boolean
  readonly customerToEdit?: CustomerDTO | null
  readonly initialPhone?: string
  readonly onClose: () => void
  readonly onCustomerSaved?: (saved: CustomerDTO) => void
}

export function CustomerModal(props: CustomerModalProps) {
  const { showToast } = useToast()
  const isEditing = Boolean(props.customerToEdit)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (props.open) {
      if (props.customerToEdit) {
        setPhone(props.customerToEdit.phone)
        setName(props.customerToEdit.name)
        setEmail(props.customerToEdit.email ?? '')
        setAddress(props.customerToEdit.address ?? '')
        setNotes(props.customerToEdit.notes ?? '')
        setIsActive(props.customerToEdit.isActive)
      } else {
        setPhone(props.initialPhone ?? '')
        setName('')
        setEmail('')
        setAddress('')
        setNotes('')
        setIsActive(true)
      }
      setErrorMessage(null)
    }
  }, [props.open, props.customerToEdit, props.initialPhone])

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (isEditing && props.customerToEdit) {
        const updated = await api.customers.update(props.customerToEdit.id, {
          name: name.trim(),
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          isActive,
        })
        showToast(`Pelanggan "${updated.name}" berhasil diperbarui.`, 'success')
        props.onCustomerSaved?.(updated)
      } else {
        const created = await api.customers.create({
          phone: phone.trim(),
          name: name.trim(),
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        })
        showToast(`Pelanggan "${created.name}" berhasil didaftarkan.`, 'success')
        props.onCustomerSaved?.(created)
      }
      props.onClose()
    } catch (err) {
      if (err instanceof ClientApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Terjadi kesalahan saat menyimpan data pelanggan.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      title={isEditing ? 'Edit Profil Pelanggan' : 'Daftar Pelanggan / Member Baru'}
      description="Kelola data kontak dan identitas pelanggan untuk program poin reward loyalitas."
      maxWidthClass="max-w-md"
      onClose={props.onClose}
      footer={
        <div class="w-full flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={submitting} onClick={props.onClose}>
            Batal
          </Button>
          <Button
            variant="filled"
            size="sm"
            loading={submitting}
            type="submit"
            form="customer-form"
          >
            {isEditing ? 'Simpan Perubahan' : 'Daftarkan Pelanggan'}
          </Button>
        </div>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} class="space-y-3.5 text-xs">
        {errorMessage && (
          <div class="p-3 bg-m3-danger-container/40 border border-m3-danger/30 rounded-xl text-m3-danger font-medium">
            {errorMessage}
          </div>
        )}

        <TextField
          label="Nomor Telepon / WhatsApp"
          placeholder="081234567890"
          value={phone}
          required
          disabled={isEditing || submitting}
          helperText={
            isEditing
              ? 'Nomor telepon merupakan identitas unik dan tidak dapat diubah.'
              : 'Gunakan nomor WhatsApp aktif pelanggan.'
          }
          onValueChange={setPhone}
        />

        <TextField
          label="Nama Lengkap Pelanggan"
          placeholder="Contoh: Budi Santoso"
          value={name}
          required
          disabled={submitting}
          onValueChange={setName}
        />

        <TextField
          label="Alamat Email (Opsional)"
          placeholder="budi@example.com"
          type="text"
          value={email}
          disabled={submitting}
          onValueChange={setEmail}
        />

        <TextField
          label="Alamat Domisili (Opsional)"
          placeholder="Nama jalan, perumahan, kelurahan..."
          value={address}
          disabled={submitting}
          onValueChange={setAddress}
        />

        <TextField
          label="Catatan Tambahan (Opsional)"
          placeholder="Contoh: Preferensi kemasan, diskon langganan..."
          value={notes}
          disabled={submitting}
          onValueChange={setNotes}
        />

        {isEditing && (
          <div class="pt-2 border-t border-m3-outline-variant flex items-center justify-between">
            <div>
              <span class="font-medium text-m3-on-surface">Status Pelanggan</span>
              <p class="text-[11px] text-m3-on-surface-variant">
                Pelanggan nonaktif tidak dapat mengumpulkan atau menukarkan poin di kasir.
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) =>
                  setIsActive((e.currentTarget as HTMLInputElement).checked)
                }
                disabled={submitting}
                class="sr-only peer"
              />
              <div class="w-10 h-5 bg-m3-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-m3-primary" />
            </label>
          </div>
        )}
      </form>
    </Modal>
  )
}
