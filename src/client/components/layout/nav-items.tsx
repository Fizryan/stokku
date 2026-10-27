import type { Child } from 'hono/jsx/dom'
import type { Permission } from '../../../shared/constants.js'
import type { AppRoute } from '../../stores/router.store.js'
import {
  IconCatalog,
  IconDashboard,
  IconInventory,
  IconPos,
  IconReceipt,
  IconUsers,
} from '../ui/Icons.js'

export interface NavigationItemConfig {
  readonly route: AppRoute
  readonly label: string
  readonly shortLabel: string
  readonly permission: Permission
  readonly renderIcon: () => Child
}

export const NAVIGATION_ITEMS: readonly NavigationItemConfig[] = [
  {
    route: '/',
    label: 'Dashboard',
    shortLabel: 'Beranda',
    permission: 'dashboard:view',
    renderIcon: () => <IconDashboard />,
  },
  {
    route: '/pos',
    label: 'Kasir (POS)',
    shortLabel: 'Kasir',
    permission: 'pos:checkout',
    renderIcon: () => <IconPos />,
  },
  {
    route: '/catalog',
    label: 'Produk & Kategori',
    shortLabel: 'Produk',
    permission: 'catalog:view',
    renderIcon: () => <IconCatalog />,
  },
  {
    route: '/inventory',
    label: 'Mutasi & Kartu Stok',
    shortLabel: 'Stok',
    permission: 'inventory:view',
    renderIcon: () => <IconInventory />,
  },
  {
    route: '/sales',
    label: 'Riwayat Penjualan',
    shortLabel: 'Penjualan',
    permission: 'sales:view',
    renderIcon: () => <IconReceipt />,
  },
  {
    route: '/users',
    label: 'Manajemen User',
    shortLabel: 'Pengguna',
    permission: 'users:manage',
    renderIcon: () => <IconUsers />,
  },
]
