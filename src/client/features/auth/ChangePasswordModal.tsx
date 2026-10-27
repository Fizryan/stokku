import { useState } from 'hono/jsx/dom'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface ChangePasswordModalProps {
  readonly open: boolean
  readonly onClose: () => void
}

export function ChangePasswordModal(props: ChangePasswordModalProps) {
  const { showToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const resetAndClose = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setErrorMessage(null)
    props.onClose()
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrorMessage(null)

    if (newPassword.length < 8) {
      setErrorMessage('Password baru minimal 8 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi password baru tidak cocok.')
      return
    }

    setSubmitting(true)
    try {
      await api.auth.changePassword({
        currentPassword,
        newPassword,
      })
      showToast('Password berhasil diperbarui.', 'success')
      resetAndClose()
    } catch (err) {
      setErrorMessage(
        err instanceof ClientApiError ? err.message : 'Gagal memperbarui password.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      title="Ubah Password Akun"
      description="Sesi aktif di perangkat lain akan otomatis dikeluarkan demi keamanan."
      onClose={resetAndClose}
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-4">
        {errorMessage && (
          <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <TextField
          label="Password Saat Ini"
          type="password"
          value={currentPassword}
          onValueChange={setCurrentPassword}
          autoComplete="current-password"
          required
        />

        <TextField
          label="Password Baru"
          type="password"
          value={newPassword}
          onValueChange={setNewPassword}
          helperText="Minimal 8 karakter."
          autoComplete="new-password"
          required
        />

        <TextField
          label="Konfirmasi Password Baru"
          type="password"
          value={confirmPassword}
          onValueChange={setConfirmPassword}
          autoComplete="new-password"
          required
        />

        <div class="pt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={resetAndClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            Simpan Password
          </Button>
        </div>
      </form>
    </Modal>
  )
}
