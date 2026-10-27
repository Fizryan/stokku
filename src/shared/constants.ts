export const ROLES = ['OWNER', 'WAREHOUSE', 'CASHIER'] as const
export type UserRole = (typeof ROLES)[number]

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  OWNER: 'Owner / Admin',
  WAREHOUSE: 'Staff Gudang',
  CASHIER: 'Kasir',
}

export const MOVEMENT_TYPES = [
  'INITIAL',
  'IN_PURCHASE',
  'OUT_SALE',
  'ADJUSTMENT_OPNAME',
  'OUT_DAMAGED',
  'VOID_REVERSAL',
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export const MANUAL_MOVEMENT_TYPES = [
  'IN_PURCHASE',
  'ADJUSTMENT_OPNAME',
  'OUT_DAMAGED',
] as const
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number]

export const MOVEMENT_TYPE_LABELS: Readonly<Record<MovementType, string>> = {
  INITIAL: 'Stok Awal',
  IN_PURCHASE: 'Stok Masuk (Restock)',
  OUT_SALE: 'Penjualan (POS)',
  ADJUSTMENT_OPNAME: 'Penyesuaian Opname',
  OUT_DAMAGED: 'Barang Rusak / Hilang',
  VOID_REVERSAL: 'Pengembalian Void Transaksi',
}

export const MOVEMENT_REFERENCE_TYPES = ['INITIAL', 'MANUAL', 'SALE', 'VOID'] as const
export type MovementReferenceType = (typeof MOVEMENT_REFERENCE_TYPES)[number]

export const PAYMENT_METHODS = ['CASH', 'QRIS', 'TRANSFER'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Tunai',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer Bank',
}

export const SALE_STATUSES = ['COMPLETED', 'VOIDED'] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

export const SALE_STATUS_LABELS: Readonly<Record<SaleStatus, string>> = {
  COMPLETED: 'Selesai',
  VOIDED: 'Dibatalkan (Void)',
}

export const PRODUCT_UNITS = [
  'pcs',
  'box',
  'pack',
  'lusin',
  'botol',
  'sachet',
  'kg',
  'gram',
  'liter',
  'meter',
] as const
export type ProductUnit = (typeof PRODUCT_UNITS)[number]

export const PERMISSIONS = [
  'dashboard:view',
  'dashboard:financials',
  'catalog:view',
  'catalog:manage',
  'inventory:view',
  'inventory:manage',
  'pos:checkout',
  'sales:view',
  'sales:view_all',
  'sales:void',
  'sales:export',
  'users:manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSION_SETS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  OWNER: new Set<Permission>(PERMISSIONS),
  WAREHOUSE: new Set<Permission>([
    'dashboard:view',
    'catalog:view',
    'catalog:manage',
    'inventory:view',
    'inventory:manage',
  ]),
  CASHIER: new Set<Permission>([
    'dashboard:view',
    'catalog:view',
    'pos:checkout',
    'sales:view',
  ]),
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSION_SETS[role].has(permission)
}

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const

export const SESSION_COOKIE_NAME = 'stokku_session'
