import { type Child, useState } from 'hono/jsx/dom'
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal.js'
import { useRouter } from '../../stores/router.store.js'
import { BottomNavigationBar } from './BottomNavigationBar.js'
import { NavigationRail } from './NavigationRail.js'
import { NAVIGATION_ITEMS } from './nav-items.js'
import { TopAppBar } from './TopAppBar.js'

export function AppShell(props: { children: Child }) {
  const { currentRoute } = useRouter()
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const activeNav = NAVIGATION_ITEMS.find((i) => i.route === currentRoute)
  const pageTitle = activeNav?.label ?? 'Dashboard'

  return (
    <div class="min-h-screen flex bg-m3-surface text-m3-on-surface">
      <NavigationRail />

      <div class="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <TopAppBar
          pageTitle={pageTitle}
          onOpenChangePassword={() => setPasswordModalOpen(true)}
        />

        <main class="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {props.children}
        </main>
      </div>

      <BottomNavigationBar />

      <ChangePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </div>
  )
}
