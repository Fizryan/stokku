import { useState } from 'hono/jsx/dom'
import { ClientApiError } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { TextField } from '../../components/ui/TextField.js'
import { useAuth } from '../../stores/auth.store.js'
import { useToast } from '../../stores/toast.store.js'

export function LoginPage() {
  const { login, refreshSession } = useAuth()
  const { showToast } = useToast()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)

    try {
      await login({
        username: username.trim().toLowerCase(),
        password,
      })
      showToast('Berhasil masuk.', 'success')
    } catch (err) {
      if (err instanceof ClientApiError && err.code === 'SETUP_REQUIRED') {
        await refreshSession()
        return
      }
      setErrorMessage(
        err instanceof ClientApiError ? err.message : 'Gagal masuk ke sistem.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="min-h-screen bg-m3-surface flex items-center justify-center p-4 sm:p-6">
      <Card class="w-full max-w-md p-6 sm:p-8 shadow-sm">
        <div class="flex flex-col items-center text-center mb-7">
          <div class="w-13 h-13 rounded-2xl bg-m3-primary text-m3-on-primary flex items-center justify-center font-bold text-2xl shadow-xs mb-3.5">
            S
          </div>
          <h1 class="text-xl font-bold tracking-tight text-m3-on-surface">
            Masuk ke Stokku
          </h1>
          <p class="mt-1 text-xs text-m3-on-surface-variant">
            Manajemen Stok &amp; Penjualan Berbasis Ledger Atomik
          </p>
        </div>

        <form onSubmit={handleSubmit} class="flex flex-col gap-4">
          {errorMessage && (
            <div class="rounded-xl bg-m3-danger-container text-m3-on-danger-container px-3.5 py-2.5 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <TextField
            label="Username"
            placeholder="Masukkan username Anda"
            value={username}
            onValueChange={setUsername}
            autoComplete="username"
            required
          />

          <TextField
            label="Password"
            type="password"
            placeholder="Masukkan password Anda"
            value={password}
            onValueChange={setPassword}
            autoComplete="current-password"
            required
          />

          <Button type="submit" size="lg" fullWidth loading={loading} class="mt-2">
            Masuk
          </Button>
        </form>
      </Card>
    </div>
  )
}
