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

export const SHIFT_STATUSES = ['OPEN', 'CLOSED'] as const
export type ShiftStatus = (typeof SHIFT_STATUSES)[number]

export const SHIFT_STATUS_LABELS: Readonly<Record<ShiftStatus, string>> = {
  OPEN: 'Aktif (Berjalan)',
  CLOSED: 'Ditutup',
}

export const SHIFT_MOVEMENT_TYPES = ['CASH_IN', 'CASH_OUT'] as const
export type ShiftMovementType = (typeof SHIFT_MOVEMENT_TYPES)[number]

export const SHIFT_MOVEMENT_TYPE_LABELS: Readonly<Record<ShiftMovementType, string>> = {
  CASH_IN: 'Kas Masuk Operasional',
  CASH_OUT: 'Kas Keluar Operasional',
}

export const PURCHASE_PAYMENT_STATUSES = ['PAID', 'UNPAID'] as const
export type PurchasePaymentStatus = (typeof PURCHASE_PAYMENT_STATUSES)[number]

export const PURCHASE_PAYMENT_STATUS_LABELS: Readonly<
  Record<PurchasePaymentStatus, string>
> = {
  PAID: 'Lunas',
  UNPAID: 'Hutang / Tempo',
}

export const POINT_MUTATION_TYPES = [
  'EARNED',
  'REDEEMED',
  'VOID_REVERSED',
  'VOID_RESTORED',
  'ADJUSTMENT',
] as const
export type PointMutationType = (typeof POINT_MUTATION_TYPES)[number]

export const POINT_MUTATION_TYPE_LABELS: Readonly<Record<PointMutationType, string>> = {
  EARNED: 'Perolehan Poin Belanja',
  REDEEMED: 'Penukaran Diskon Belanja',
  VOID_REVERSED: 'Pembatalan Transaksi (Poin Ditarik)',
  VOID_RESTORED: 'Pembatalan Transaksi (Poin Dikembalikan)',
  ADJUSTMENT: 'Penyesuaian Manual',
}

export const LOYALTY_RULES = {
  SPEND_PER_POINT: 10_000,
  POINT_VALUE_IN_RUPIAH: 100,
} as const

export const AUDIT_ACTION_TYPES = [
  'USER_ROLE_CHANGED',
  'USER_DEACTIVATED',
  'USER_ACTIVATED',
  'PASSWORD_RESET',
  'SALE_VOIDED',
  'STOCK_ADJUSTED',
  'POINTS_ADJUSTED',
  'SALES_EXPORTED',
  'BACKUP_CREATED',
] as const
export type AuditActionType = (typeof AUDIT_ACTION_TYPES)[number]

export const AUDIT_ACTION_TYPE_LABELS: Readonly<Record<AuditActionType, string>> = {
  USER_ROLE_CHANGED: 'Perubahan Role Pengguna',
  USER_DEACTIVATED: 'Nonaktifkan Pengguna',
  USER_ACTIVATED: 'Aktivasi Pengguna',
  PASSWORD_RESET: 'Reset Password Pengguna',
  SALE_VOIDED: 'Pembatalan Penjualan (Void)',
  STOCK_ADJUSTED: 'Penyesuaian Manual Stok',
  POINTS_ADJUSTED: 'Penyesuaian Poin Reward',
  SALES_EXPORTED: 'Ekspor Data Penjualan (CSV)',
  BACKUP_CREATED: 'Pembuatan Cadangan Database (Backup)',
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
  'shifts:manage',
  'shifts:view',
  'shifts:view_all',
  'suppliers:view',
  'suppliers:manage',
  'purchases:view',
  'purchases:manage',
  'customers:view',
  'customers:manage',
  'customers:adjust_points',
  'audit:view',
  'backup:manage',
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
    'suppliers:view',
    'suppliers:manage',
    'purchases:view',
    'purchases:manage',
    'customers:view',
  ]),
  CASHIER: new Set<Permission>([
    'dashboard:view',
    'catalog:view',
    'pos:checkout',
    'sales:view',
    'shifts:manage',
    'shifts:view',
    'customers:view',
    'customers:manage',
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
