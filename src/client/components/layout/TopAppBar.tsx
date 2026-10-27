import { ROLE_LABELS } from '../../../shared/constants.js'
import { useAuth } from '../../stores/auth.store.js'
import { useRouter } from '../../stores/router.store.js'
import { Badge } from '../ui/Badge.js'
import { IconKey, IconLogout, IconUsers } from '../ui/Icons.js'

export interface TopAppBarProps {
  readonly pageTitle: string
  readonly onOpenChangePassword: () => void
}

export function TopAppBar(props: TopAppBarProps) {
  const { user, can, logout } = useAuth()
  const { currentRoute, navigate } = useRouter()

  if (!user) return null

  return (
    <header class="sticky top-0 z-30 h-16 bg-m3-surface/90 backdrop-blur-md border-b border-m3-outline-variant/60 px-4 sm:px-6 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="md:hidden w-9 h-9 rounded-xl bg-m3-primary text-m3-on-primary flex items-center justify-center font-bold text-sm shrink-0">
          S
        </div>
        <div class="min-w-0">
          <h1 class="text-base sm:text-lg font-semibold text-m3-on-surface truncate">
            {props.pageTitle}
          </h1>
          <p class="hidden sm:block text-xs text-m3-on-surface-variant truncate">
            Sistem Manajemen Stok &amp; Kasir Terpadu
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {can('users:manage') && (
          <button
            type="button"
            onClick={() => navigate('/users')}
            title="Manajemen Pengguna"
            class={[
              'md:hidden h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer',
              currentRoute === '/users'
                ? 'bg-m3-primary-container text-m3-on-primary-container'
                : 'text-m3-on-surface-variant hover:bg-m3-surface-container',
            ].join(' ')}
          >
            <IconUsers class="w-4 h-4" />
            <span>User</span>
          </button>
        )}

        <div class="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1 rounded-full bg-m3-surface-container-low border border-m3-outline-variant/60">
          <div class="w-7 h-7 rounded-full bg-m3-primary-container text-m3-primary flex items-center justify-center text-xs font-bold uppercase">
            {user.fullName.charAt(0)}
          </div>
          <div class="text-left leading-tight">
            <p class="text-xs font-semibold text-m3-on-surface max-w-32 truncate">
              {user.fullName}
            </p>
          </div>
          <Badge tone="primary">{ROLE_LABELS[user.role]}</Badge>
        </div>

        <button
          type="button"
          onClick={props.onOpenChangePassword}
          title="Ubah Password Akun"
          aria-label="Ubah Password Akun"
          class="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-surface-container hover:text-m3-on-surface transition-colors cursor-pointer"
        >
          <IconKey class="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            void logout()
          }}
          title="Keluar Sesi"
          aria-label="Keluar Sesi"
          class="h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-medium text-m3-danger hover:bg-m3-danger-container/60 transition-colors cursor-pointer"
        >
          <IconLogout class="w-4 h-4" />
          <span class="hidden sm:inline">Keluar</span>
        </button>
      </div>
    </header>
  )
}
