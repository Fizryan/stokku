import { useEffect, useState } from 'hono/jsx/dom'
import type { UserDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { TextField } from '../../components/ui/TextField.js'
import { useToast } from '../../stores/toast.store.js'

export interface ResetPasswordModalProps {
  readonly targetUser: UserDTO | null
  readonly onClose: () => void
}

export function ResetPasswordModal(props: ResetPasswordModalProps) {
  const { showToast } = useToast()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorText, setErrorText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (props.targetUser) {
      setNewPassword('')
      setConfirmPassword('')
      setErrorText('')
      setSubmitting(false)
    }
  }, [props.targetUser])

  const target = props.targetUser
  if (!target) return null

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      setErrorText('Password baru minimal 8 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorText('Konfirmasi password tidak cocok.')
      return
    }

    setErrorText('')
    setSubmitting(true)
    try {
      await api.users.resetPassword(target.id, { newPassword })
      showToast(
        `Password untuk @${target.username} berhasil direset dan sesi lamanya telah dicabut.`,
        'success',
      )
      props.onClose()
    } catch (err) {
      setErrorText(
        err instanceof ClientApiError ? err.message : 'Gagal mereset password pengguna.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      title={`Reset Password — ${target.fullName}`}
      description={` Mengatur ulang password untuk akun @${target.username}. Seluruh sesi login aktif pengguna tersebut akan otomatis dikeluarkan.`}
      maxWidthClass="max-w-md"
      onClose={() => {
        if (!submitting) props.onClose()
      }}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={submitting} onClick={props.onClose}>
            Batal
          </Button>
          <Button
            size="sm"
            loading={submitting}
            onClick={() => {
              const form = document.getElementById(
                'reset-user-password-form',
              ) as HTMLFormElement | null
              form?.requestSubmit()
            }}
          >
            Simpan Password Baru
          </Button>
        </>
      }
    >
      <form
        id="reset-user-password-form"
        onSubmit={handleSubmit}
        class="flex flex-col gap-4"
      >
        {errorText && (
          <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
            {errorText}
          </div>
        )}

        <TextField
          label="Password Baru"
          type="password"
          placeholder="Minimal 8 karakter"
          value={newPassword}
          onValueChange={setNewPassword}
          disabled={submitting}
          required
          maxLength={128}
          autoComplete="new-password"
        />

        <TextField
          label="Konfirmasi Password Baru"
          type="password"
          placeholder="Ketik ulang password baru"
          value={confirmPassword}
          onValueChange={setConfirmPassword}
          disabled={submitting}
          required
          maxLength={128}
          autoComplete="new-password"
        />
      </form>
    </Modal>
  )
}
