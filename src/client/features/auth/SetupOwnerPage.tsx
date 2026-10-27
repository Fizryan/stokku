import { useState } from 'hono/jsx/dom'
import { ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'

export function SetupOwnerPage() {
  const { completeInitialSetup } = useAuth()
  const { showToast } = useToast()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrorMessage(null)

    if (password.length < 8) {
      setErrorMessage('Password minimal 8 karakter.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi password belum sesuai.')
      return
    }

    setLoading(true)
    try {
      await completeInitialSetup({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        password,
      })
      showToast('Akun Owner berhasil dibuat. Selamat datang di Stokku!', 'success')
    } catch (err) {
      setErrorMessage(
        err instanceof ClientApiError
          ? err.message
          : 'Gagal menyelesaikan inisialisasi awal.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen bg-m3-surface flex items-center justify-center p-4 sm:p-6">
      <Card class="w-full max-w-md p-6 sm:p-8 shadow-sm">
        <div class="flex items-center gap-3.5 mb-6">
          <div class="w-12 h-12 rounded-2xl bg-m3-primary text-m3-on-primary flex items-center justify-center font-bold text-xl">
            S
          </div>
          <div>
            <span class="inline-block text-[11px] font-semibold uppercase tracking-wider text-m3-primary bg-m3-primary-container px-2.5 py-0.5 rounded-full">
              Inisialisasi Awal
            </span>
            <h1 class="mt-1 text-xl font-bold text-m3-on-surface">Siapkan Akun Owner</h1>
          </div>
        </div>

        <p class="text-xs text-m3-on-surface-variant leading-relaxed mb-6">
          Database Stokku masih kosong. Buat akun <strong>Owner / Admin</strong> pertama
          untuk mengelola produk, stok, kasir, dan staf toko Anda.
        </p>

        <form onSubmit={handleSubmit} class="flex flex-col gap-4">
          {errorMessage && (
            <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <TextField
            label="Nama Lengkap Owner"
            placeholder="Contoh: Budi Santoso"
            value={fullName}
            onValueChange={setFullName}
            autoComplete="name"
            required
          />

          <TextField
            label="Username"
            placeholder="Contoh: owner"
            value={username}
            onValueChange={setUsername}
            helperText="Huruf kecil, angka, titik, atau garis bawah (3–32 karakter)."
            autoComplete="username"
            required
          />

          <TextField
            label="Password"
            type="password"
            placeholder="Minimal 8 karakter"
            value={password}
            onValueChange={setPassword}
            autoComplete="new-password"
            required
          />

          <TextField
            label="Konfirmasi Password"
            type="password"
            placeholder="Ulangi password"
            value={confirmPassword}
            onValueChange={setConfirmPassword}
            autoComplete="new-password"
            required
          />

          <Button type="submit" size="lg" fullWidth loading={loading} class="mt-2">
            Buat Akun Owner &amp; Mulai
          </Button>
        </form>
      </Card>
    </div>
  )
}
