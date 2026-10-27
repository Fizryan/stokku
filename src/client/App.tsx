import type { Permission } from '../shared/constants.js'
import { AppShell } from './components/layout/AppShell.js'
import { Button } from './components/ui/Button.js'
import { Card } from './components/ui/Card.js'
import { EmptyState } from './components/ui/EmptyState.js'
import { IconAlert } from './components/ui/Icons.js'
import { ToastViewport } from './components/ui/ToastViewport.js'
import { LoginPage } from './features/auth/LoginPage.js'
import { SetupOwnerPage } from './features/auth/SetupOwnerPage.js'
import { CatalogPage } from './features/catalog/CatalogPage.js'
import { DashboardPage } from './features/dashboard/DashboardPage.js'
import { InventoryPage } from './features/inventory/InventoryPage.js'
import { PosPage } from './features/pos/PosPage.js'
import { SalesHistoryPage } from './features/sales/SalesHistoryPage.js'
import { UsersPage } from './features/users/UsersPage.js'
import { useAuth } from './stores/auth.store.js'
import { type AppRoute, useRouter } from './stores/router.store.js'

const ROUTE_PERMISSIONS: Readonly<Record<AppRoute, Permission>> = {
  '/': 'dashboard:view',
  '/pos': 'pos:checkout',
  '/catalog': 'catalog:view',
  '/inventory': 'inventory:view',
  '/sales': 'sales:view',
  '/users': 'users:manage',
}

function ActiveRouteView() {
  const { currentRoute, navigate } = useRouter()
  const { can } = useAuth()

  const requiredPermission = ROUTE_PERMISSIONS[currentRoute]
  if (!can(requiredPermission)) {
    return (
      <Card class="p-6">
        <EmptyState
          icon={<IconAlert />}
          title="Akses Halaman Dibatasi"
          description="Peran akun Anda tidak memiliki izin untuk membuka modul ini."
          action={
            <Button size="sm" onClick={() => navigate('/', { replace: true })}>
              Kembali ke Dashboard
            </Button>
          }
        />
      </Card>
    )
  }

  switch (currentRoute) {
    case '/':
      return <DashboardPage />
    case '/pos':
      return <PosPage />
    case '/catalog':
      return <CatalogPage />
    case '/inventory':
      return <InventoryPage />
    case '/sales':
      return <SalesHistoryPage />
    case '/users':
      return <UsersPage />
  }
}

export function App() {
  const { isBootstrapping, needsInitialSetup, user } = useAuth()

  if (isBootstrapping) {
    return (
      <div class="min-h-screen bg-m3-surface flex flex-col items-center justify-center gap-3 p-6">
        <div
          class="w-10 h-10 rounded-full border-3 border-m3-primary border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <p class="text-xs font-medium text-m3-on-surface-variant">
          Memuat ruang kerja Stokku...
        </p>
      </div>
    )
  }

  if (needsInitialSetup) {
    return (
      <>
        <SetupOwnerPage />
        <ToastViewport />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <LoginPage />
        <ToastViewport />
      </>
    )
  }

  return (
    <>
      <AppShell>
        <ActiveRouteView />
      </AppShell>
      <ToastViewport />
    </>
  )
}
