import { useAuth } from '../../stores/auth.store.js'
import { usePosCart } from '../../stores/pos-cart.store.js'
import { useRouter } from '../../stores/router.store.js'
import { NAVIGATION_ITEMS } from './nav-items.js'

export function NavigationRail() {
  const { can } = useAuth()
  const { currentRoute, navigate } = useRouter()
  const { totalItemsCount } = usePosCart()

  const allowedItems = NAVIGATION_ITEMS.filter((item) => can(item.permission))

  return (
    <aside class="hidden md:flex flex-col w-20 xl:w-64 shrink-0 bg-m3-surface-container-low border-r border-m3-outline-variant/60 select-none">
      <div class="h-16 px-4 xl:px-6 flex items-center gap-3 border-b border-m3-outline-variant/50">
        <div class="w-10 h-10 rounded-2xl bg-m3-primary text-m3-on-primary flex items-center justify-center font-bold text-base shadow-xs shrink-0 mx-auto xl:mx-0">
          S
        </div>
        <div class="hidden xl:block min-w-0">
          <p class="text-base font-bold tracking-tight text-m3-on-surface">Stokku</p>
          <p class="text-[11px] font-medium text-m3-on-surface-variant">
            Inventory &amp; POS
          </p>
        </div>
      </div>

      <nav class="flex-1 py-4 px-2.5 xl:px-3.5 flex flex-col gap-1.5">
        {allowedItems.map((item) => {
          const isActive = currentRoute === item.route
          const showPosBadge = item.route === '/pos' && totalItemsCount > 0

          return (
            <button
              key={item.route}
              type="button"
              onClick={() => navigate(item.route)}
              title={item.label}
              class={[
                'group relative w-full rounded-full py-2.5 px-3 xl:px-4 flex flex-col xl:flex-row items-center gap-1 xl:gap-3 transition-colors duration-150 cursor-pointer',
                isActive
                  ? 'bg-m3-primary-container text-m3-on-primary-container font-semibold'
                  : 'text-m3-on-surface-variant hover:bg-m3-surface-container hover:text-m3-on-surface font-medium',
              ].join(' ')}
            >
              <span class="relative flex items-center justify-center">
                {item.renderIcon()}
                {showPosBadge && (
                  <span class="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-m3-primary text-m3-on-primary text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {totalItemsCount > 99 ? '99+' : totalItemsCount}
                  </span>
                )}
              </span>

              <span class="text-[10px] xl:text-sm leading-tight truncate max-w-full">
                <span class="xl:hidden">{item.shortLabel}</span>
                <span class="hidden xl:inline">{item.label}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div class="hidden xl:block p-4 m-3 rounded-2xl bg-m3-surface-container text-xs text-m3-on-surface-variant">
        <p class="font-semibold text-m3-on-surface">SSOT Ledger Aktif</p>
        <p class="mt-0.5 leading-relaxed">
          Setiap perubahan stok tercatat otomatis di Kartu Stok secara atomik.
        </p>
      </div>
    </aside>
  )
}
