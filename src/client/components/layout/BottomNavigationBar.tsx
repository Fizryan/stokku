import { useAuth } from '../../stores/auth.store.js'
import { usePosCart } from '../../stores/pos-cart.store.js'
import { useRouter } from '../../stores/router.store.js'
import { NAVIGATION_ITEMS } from './nav-items.js'

export function BottomNavigationBar() {
  const { can } = useAuth()
  const { currentRoute, navigate } = useRouter()
  const { totalItemsCount } = usePosCart()

  // M3 standard: keep maximum 5 primary destinations in compact mobile bottom bar
  const mobileItems = NAVIGATION_ITEMS.filter(
    (item) => item.route !== '/users' && can(item.permission),
  ).slice(0, 5)

  return (
    <nav
      aria-label="Navigasi Utama Mobile"
      class="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-m3-surface-container-lowest/95 backdrop-blur-md border-t border-m3-outline-variant/70 px-1 flex items-center justify-around select-none"
    >
      {mobileItems.map((item) => {
        const isActive = currentRoute === item.route
        const showPosBadge = item.route === '/pos' && totalItemsCount > 0

        return (
          <button
            key={item.route}
            type="button"
            onClick={() => navigate(item.route)}
            class="flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <span
              class={[
                'relative w-14 h-7 rounded-full flex items-center justify-center transition-colors duration-150',
                isActive
                  ? 'bg-m3-primary-container text-m3-on-primary-container'
                  : 'text-m3-on-surface-variant',
              ].join(' ')}
            >
              {item.renderIcon()}
              {showPosBadge && (
                <span class="absolute -top-1 right-1.5 min-w-4 h-4 px-1 rounded-full bg-m3-primary text-m3-on-primary text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {totalItemsCount > 99 ? '99+' : totalItemsCount}
                </span>
              )}
            </span>

            <span
              class={[
                'text-[11px] leading-tight truncate max-w-full px-1',
                isActive
                  ? 'font-semibold text-m3-on-surface'
                  : 'font-medium text-m3-on-surface-variant',
              ].join(' ')}
            >
              {item.shortLabel}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
