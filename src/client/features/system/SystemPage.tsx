import { useState } from 'hono/jsx/dom'
import { Card } from '../../components/ui/Card.js'
import { IconDatabase, IconShield } from '../../components/ui/Icons.js'
import { useAuth } from '../../stores/auth.store.js'
import { AuditLogTable } from './AuditLogTable.js'
import { BackupManagerPanel } from './BackupManagerPanel.js'

type SystemTab = 'audit' | 'backup'

export function SystemPage() {
  const { can } = useAuth()
  const [activeTab, setActiveTab] = useState<SystemTab>('audit')

  if (!can('audit:view')) {
    return (
      <div class="p-8 max-w-lg mx-auto">
        <Card class="p-6 text-center border-m3-danger/40 bg-m3-danger-container/20">
          <IconShield class="w-10 h-10 text-m3-danger mx-auto mb-3" />
          <h2 class="text-base font-bold text-m3-on-surface">Akses Ditolak</h2>
          <p class="text-xs text-m3-on-surface-variant mt-1">
            Halaman Sistem & Audit Trail hanya dapat diakses oleh akun dengan peran Owner.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-6">
      {/* Page Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-m3-on-surface flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-2xl bg-m3-primary/10 text-m3-primary flex items-center justify-center shrink-0">
              <IconShield class="w-5 h-5" />
            </div>
            <span>Sistem, Keamanan & Tata Kelola</span>
          </h1>
          <p class="text-xs sm:text-sm text-m3-on-surface-variant mt-1">
            Audit trail immutable atas aktivitas sensitif dan manajer pencadangan live
            database (Disaster Recovery).
          </p>
        </div>
      </div>

      {/* Segmented Control Tabs */}
      <div class="inline-flex p-1 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/60 gap-1 self-start">
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-m3-surface-container-lowest text-m3-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-high/60'
          }`}
        >
          <IconShield class="w-4 h-4" />
          <span>Audit Trail (Log Aktivitas)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('backup')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'backup'
              ? 'bg-m3-surface-container-lowest text-m3-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-high/60'
          }`}
        >
          <IconDatabase class="w-4 h-4" />
          <span>Cadangan Database (Disaster Recovery)</span>
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'audit' ? <AuditLogTable /> : <BackupManagerPanel />}
    </div>
  )
}
