import { useEffect, useState } from 'hono/jsx/dom'
import { ROLE_LABELS, ROLES, type UserRole } from '../../../shared/constants.js'
import type { UserDTO } from '../../../shared/types.js'
import { api, ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { SelectField } from '../../components/ui/SelectField.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'

export interface UserFormModalProps {
  readonly open: boolean
  readonly editingUser: UserDTO | null
  readonly onClose: () => void
  readonly onSaved: () => void
}

export function UserFormModal(props: UserFormModalProps) {
  const { user: currentUser, refreshSession } = useAuth()
  const { showToast } = useToast()

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('CASHIER')
  const [isActive, setIsActive] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEdit = props.editingUser !== null
  const isEditingSelf =
    props.editingUser !== null && props.editingUser.id === currentUser?.id

  useEffect(() => {
    if (!props.open) return
    if (props.editingUser) {
      setUsername(props.editingUser.username)
      setFullName(props.editingUser.fullName)
      setPassword('')
      setRole(props.editingUser.role)
      setIsActive(props.editingUser.isActive)
    } else {
      setUsername('')
      setFullName('')
      setPassword('')
      setRole('CASHIER')
      setIsActive(true)
    }
    setErrorText('')
    setSubmitting(false)
  }, [props.open, props.editingUser])

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrorText('')

    const trimmedFullName = fullName.trim()
    if (trimmedFullName.length < 2) {
      setErrorText('Nama lengkap minimal 2 karakter.')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && props.editingUser) {
        await api.users.update(props.editingUser.id, {
          fullName: trimmedFullName,
          role,
          isActive,
        })
        if (isEditingSelf) {
          await refreshSession()
        }
        showToast(`Data pengguna "${trimmedFullName}" berhasil diperbarui.`, 'success')
      } else {
        const trimmedUsername = username.trim().toLowerCase()
        if (trimmedUsername.length < 3) {
          setErrorText('Username minimal 3 karakter.')
          setSubmitting(false)
          return
        }
        if (password.length < 8) {
          setErrorText('Password minimal 8 karakter.')
          setSubmitting(false)
          return
        }

        await api.users.create({
          username: trimmedUsername,
          fullName: trimmedFullName,
          password,
          role,
        })
        showToast(`Akun "${trimmedUsername}" berhasil dibuat.`, 'success')
      }

      props.onSaved()
      props.onClose()
    } catch (err) {
      const message =
        err instanceof ClientApiError ? err.message : 'Gagal menyimpan data pengguna.'
      setErrorText(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={props.open}
      title={isEdit ? 'Edit Akun Pengguna' : 'Tambah Akun Staff Baru'}
      description={
        isEdit
          ? 'Perbarui peran akses (RBAC) atau status keaktifan akun.'
          : 'Buat kredensial login untuk kasir, staff gudang, atau owner tambahan.'
      }
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
                'user-form-modal',
              ) as HTMLFormElement | null
              form?.requestSubmit()
            }}
          >
            {isEdit ? 'Simpan Perubahan' : 'Buat Akun'}
          </Button>
        </>
      }
    >
      <form id="user-form-modal" onSubmit={handleSubmit} class="flex flex-col gap-4">
        {errorText && (
          <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
            {errorText}
          </div>
        )}

        <TextField
          label="Username"
          placeholder="contoh: kasir.pagi"
          value={username}
          onValueChange={(v) => setUsername(v.toLowerCase())}
          disabled={isEdit || submitting}
          required={!isEdit}
          maxLength={32}
          autoComplete="off"
          helperText={
            isEdit
              ? 'Username bersifat permanen untuk integritas log audit.'
              : 'Huruf kecil, angka, titik, garis bawah, atau tanda hubung.'
          }
        />

        <TextField
          label="Nama Lengkap"
          placeholder="Contoh: Budi Santoso"
          value={fullName}
          onValueChange={setFullName}
          disabled={submitting}
          required
          maxLength={80}
        />

        {!isEdit && (
          <TextField
            label="Password Awal"
            type="password"
            placeholder="Minimal 8 karakter"
            value={password}
            onValueChange={setPassword}
            disabled={submitting}
            required
            maxLength={128}
            autoComplete="new-password"
            helperText="Pengguna dapat mengganti password sendiri setelah login."
          />
        )}

        <SelectField
          label="Peran Akses (Role)"
          value={role}
          disabled={submitting || isEditingSelf}
          options={ROLES.map((r) => ({
            value: r,
            label: ROLE_LABELS[r],
          }))}
          onValueChange={(val) => setRole(val as UserRole)}
        />

        {isEdit && (
          <label
            class={[
              'rounded-xl border border-m3-outline-variant p-3.5 flex items-start gap-3 text-xs select-none',
              isEditingSelf
                ? 'bg-m3-surface-container opacity-70 cursor-not-allowed'
                : 'bg-m3-surface-container-low cursor-pointer',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={isActive}
              disabled={submitting || isEditingSelf}
              onChange={(e) => {
                setIsActive((e.currentTarget as HTMLInputElement).checked)
              }}
              class="mt-0.5 w-4 h-4 accent-m3-primary rounded"
            />
            <div class="flex flex-col gap-0.5">
              <span class="font-semibold text-m3-on-surface">
                Akun Aktif Diizinkan Login
              </span>
              <span class="text-m3-on-surface-variant leading-relaxed">
                {isEditingSelf
                  ? 'Anda tidak dapat menonaktifkan atau menurunkan peran akun Anda sendiri.'
                  : 'Jika dinonaktifkan, seluruh sesi login aktif pengguna ini langsung dicabut.'}
              </span>
            </div>
          </label>
        )}
      </form>
    </Modal>
  )
}
