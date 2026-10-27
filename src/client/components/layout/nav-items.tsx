import type { Child } from 'hono/jsx/dom'
import type { Permission } from '../../../shared/constants.js'
import type { AppRoute } from '../../stores/router.store.js'
import {
  IconCatalog,
  IconClock,
  IconDashboard,
  IconHeart,
  IconInventory,
  IconPos,
  IconReceipt,
  IconShield,
  IconTruck,
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
    route: '/purchases',
    label: 'Pembelian & Supplier',
    shortLabel: 'Beli',
    permission: 'purchases:view',
    renderIcon: () => <IconTruck />,
  },
  {
    route: '/customers',
    label: 'Pelanggan & Poin',
    shortLabel: 'Member',
    permission: 'customers:view',
    renderIcon: () => <IconHeart />,
  },
  {
    route: '/sales',
    label: 'Riwayat Penjualan',
    shortLabel: 'Penjualan',
    permission: 'sales:view',
    renderIcon: () => <IconReceipt />,
  },
  {
    route: '/shifts',
    label: 'Shift & Laci Kas',
    shortLabel: 'Shift',
    permission: 'shifts:view',
    renderIcon: () => <IconClock />,
  },
  {
    route: '/users',
    label: 'Manajemen User',
    shortLabel: 'Pengguna',
    permission: 'users:manage',
    renderIcon: () => <IconUsers />,
  },
  {
    route: '/system',
    label: 'Sistem & Keamanan',
    shortLabel: 'Sistem',
    permission: 'audit:view',
    renderIcon: () => <IconShield />,
  },
]
