import { useCallback, useEffect, useState } from 'hono/jsx/dom'
import { formatDateTime } from '../../../shared/formatters.js'
import type { BackupFileDTO } from '../../../shared/types.js'
import { api, ClientApiError, isAbortError } from '../../api/client.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { EmptyState } from '../../components/ui/EmptyState.js'
import { IconClock, IconDatabase, IconRefresh } from '../../components/ui/Icons.js'
import { useToast } from '../../stores/toast.store.js'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function BackupManagerPanel() {
  const { showToast } = useToast()
  const [backups, setBackups] = useState<readonly BackupFileDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const loadBackups = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const list = await api.backup.list(signal)
        setBackups(list)
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return
        showToast(
          err instanceof ClientApiError ? err.message : 'Gagal memuat daftar backup.',
          'error',
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [showToast],
  )

  useEffect(() => {
    const ac = new AbortController()
    void loadBackups(ac.signal)
    return () => ac.abort()
  }, [loadBackups])

  const handleCreateBackup = async () => {
    setCreating(true)
    try {
      const created = await api.backup.create()
      showToast(
        `Backup database "${created.fileName}" berhasil dibuat (${formatFileSize(created.fileSizeBytes)}).`,
        'success',
      )
      await loadBackups()
    } catch (err) {
      showToast(
        err instanceof ClientApiError ? err.message : 'Gagal membuat snapshot backup.',
        'error',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div class="space-y-6">
      {/* Overview & Action Card */}
      <Card class="p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <IconDatabase class="w-5 h-5 text-m3-primary" />
              <h3 class="text-base font-bold text-m3-on-surface">
                Manajer Cadangan Database (Disaster Recovery)
              </h3>
            </div>
            <p class="text-xs sm:text-sm text-m3-on-surface-variant max-w-2xl leading-relaxed">
              Membuat snapshot database SQLite terisolasi secara live menggunakan
              mekanisme WAL-Safe (<code>VACUUM INTO</code>). Proses ini tidak mengunci
              transaksi kasir, tidak memerlukan restart aplikasi, dan menghasilkan file
              mandiri <code>.sqlite</code> yang siap dipulihkan kapan saja.
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <Button
              variant="outlined"
              size="sm"
              title="Segarkan Daftar"
              onClick={() => void loadBackups()}
              disabled={loading || creating}
            >
              <IconRefresh class={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="filled"
              size="sm"
              onClick={handleCreateBackup}
              disabled={creating}
              loading={creating}
              class="gap-1.5"
            >
              <IconDatabase class="w-4 h-4 mr-1.5" />
              <span>{creating ? 'Membuat Snapshot...' : 'Buat Backup Sekarang'}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Backups List */}
      <Card class="overflow-hidden">
        <div class="p-4 border-b border-m3-outline-variant/60 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-m3-on-surface">
            Daftar Berkas Cadangan Tersedia ({backups.length})
          </h4>
          <span class="text-xs text-m3-on-surface-variant">
            Lokasi server:{' '}
            <code class="bg-m3-surface-container px-1 py-0.5 rounded font-mono">
              data/backups/
            </code>
          </span>
        </div>

        {loading && backups.length === 0 ? (
          <div class="p-12 text-center text-m3-on-surface-variant">
            <IconRefresh class="w-6 h-6 animate-spin mx-auto mb-2 text-m3-primary" />
            <p class="text-xs">Memeriksa direktori backup...</p>
          </div>
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<IconDatabase />}
            title="Belum Ada Cadangan Database"
            description="Klik tombol 'Buat Backup Sekarang' di atas untuk membuat snapshot perdana database toko Anda."
          />
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-m3-on-surface">
              <thead class="bg-m3-surface-container text-m3-on-surface-variant border-b border-m3-outline-variant/60">
                <tr>
                  <th class="p-3.5 font-semibold">Nama File Snapshot</th>
                  <th class="p-3.5 font-semibold">Ukuran Berkas</th>
                  <th class="p-3.5 font-semibold">Waktu Pembuatan</th>
                  <th class="p-3.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-m3-outline-variant/40">
                {backups.map((b) => (
                  <tr
                    key={b.fileName}
                    class="hover:bg-m3-surface-container-low/50 transition-colors"
                  >
                    <td class="p-3.5 whitespace-nowrap">
                      <div class="flex items-center gap-2">
                        <IconDatabase class="w-4 h-4 text-m3-primary shrink-0" />
                        <span class="font-mono font-medium text-m3-on-surface">
                          {b.fileName}
                        </span>
                      </div>
                    </td>

                    <td class="p-3.5 whitespace-nowrap font-mono text-m3-on-surface">
                      <Badge tone="neutral">{formatFileSize(b.fileSizeBytes)}</Badge>
                    </td>

                    <td class="p-3.5 whitespace-nowrap text-m3-on-surface-variant font-mono text-[11px]">
                      <div class="flex items-center gap-1.5">
                        <IconClock class="w-3.5 h-3.5 text-m3-on-surface-variant/70 shrink-0" />
                        <span>{formatDateTime(b.createdAt)}</span>
                      </div>
                    </td>

                    <td class="p-3.5 whitespace-nowrap text-right">
                      <a
                        href={b.downloadUrl}
                        download={b.fileName}
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-m3-outline-variant bg-m3-surface-container-lowest text-m3-primary hover:bg-m3-surface-container-low transition-colors shadow-2xs"
                      >
                        <svg
                          class="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          aria-hidden="true"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Unduh Snapshot</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Disaster Recovery Guide Box */}
      <Card class="p-5 border border-m3-outline-variant/60 bg-m3-surface-container-low/40 space-y-3">
        <h4 class="text-xs font-bold uppercase tracking-wider text-m3-on-surface flex items-center gap-2">
          <svg
            class="w-4 h-4 text-m3-warning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Prosedur Pemulihan Bencana (Disaster Recovery Runbook)
        </h4>
        <div class="text-xs text-m3-on-surface-variant space-y-2 leading-relaxed">
          <p>
            Jika terjadi kerusakan perangkat keras atau kehilangan data di lingkungan
            produksi, ikuti langkah pemulihan terstandarisasi berikut:
          </p>
          <ol class="list-decimal list-inside space-y-1.5 pl-2 font-mono text-[11px] text-m3-on-surface">
            <li>
              Hentikan proses service Stokku:{' '}
              <code class="text-m3-primary bg-m3-surface-container px-1.5 py-0.5 rounded font-mono border border-m3-outline-variant/50">
                pnpm stop
              </code>{' '}
              atau matikan container Docker.
            </li>
            <li>
              Salin berkas cadangan{' '}
              <code class="text-m3-primary bg-m3-surface-container px-1.5 py-0.5 rounded font-mono border border-m3-outline-variant/50">
                stokku-backup-*.sqlite
              </code>{' '}
              yang telah diunduh ke lokasi database utama:{' '}
              <code class="text-m3-primary bg-m3-surface-container px-1.5 py-0.5 rounded font-mono border border-m3-outline-variant/50">
                ./data/stokku.sqlite
              </code>
              .
            </li>
            <li>
              Pastikan berkas sementara lama seperti{' '}
              <code class="text-m3-on-surface-variant bg-m3-surface-container px-1.5 py-0.5 rounded font-mono border border-m3-outline-variant/50">
                stokku.sqlite-wal
              </code>{' '}
              dan{' '}
              <code class="text-m3-on-surface-variant bg-m3-surface-container px-1.5 py-0.5 rounded font-mono border border-m3-outline-variant/50">
                stokku.sqlite-shm
              </code>{' '}
              dihapus sebelum menyalakan server.
            </li>
            <li>
              Jalankan kembali aplikasi:{' '}
              <code class="text-m3-primary bg-m3-surface-container px-1.5 py-0.5 rounded font-mono border border-m3-outline-variant/50">
                pnpm start
              </code>
              . Database akan otomatis berada di kondisi snapshot yang dipilih.
            </li>
          </ol>
        </div>
      </Card>
    </div>
  )
}
