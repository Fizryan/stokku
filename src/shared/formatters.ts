const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const integerFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateShortFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) return 'Rp 0'
  return rupiahFormatter.format(Math.trunc(amount))
}

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return integerFormatter.format(Math.trunc(value))
}

export function parseDigitsToInt(raw: string): number {
  const digitsOnly = raw.replace(/[^\d]/g, '')
  if (digitsOnly.length === 0) return 0
  const parsed = Number.parseInt(digitsOnly, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return 0
  }
  return Math.min(parsed, 1_000_000_000_000)
}

function normalizeSqliteIso(raw: string): Date {
  if (raw.includes('T')) {
    return new Date(raw)
  }
  return new Date(`${raw.replace(' ', 'T')}Z`)
}

export function formatDateTime(isoOrSqliteDate: string): string {
  const date = normalizeSqliteIso(isoOrSqliteDate)
  if (Number.isNaN(date.getTime())) return isoOrSqliteDate
  return dateTimeFormatter.format(date)
}

export function formatDateShort(isoOrSqliteDate: string): string {
  const date = normalizeSqliteIso(isoOrSqliteDate)
  if (Number.isNaN(date.getTime())) return isoOrSqliteDate
  return dateShortFormatter.format(date)
}

export function todayIsoDateLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
