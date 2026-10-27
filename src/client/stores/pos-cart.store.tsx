import {
  type Child,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'hono/jsx/dom'
import type { PaymentMethod } from '../../shared/constants.js'
import type { ProductDTO } from '../../shared/types.js'

export interface PosCartLine {
  readonly productId: number
  readonly sku: string
  readonly name: string
  readonly unit: string
  readonly sellPrice: number
  readonly maxStockQty: number
  readonly qty: number
}

interface PersistedPosDraft {
  readonly lines: readonly PosCartLine[]
  readonly discountAmount: number
  readonly paymentMethod: PaymentMethod
  readonly customerName: string
}

const STORAGE_KEY = 'stokku_pos_cart_draft_v1'

function loadPersistedDraft(): PersistedPosDraft {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        lines: [],
        discountAmount: 0,
        paymentMethod: 'CASH',
        customerName: '',
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedPosDraft>
    const validatedLines: PosCartLine[] = []
    if (Array.isArray(parsed.lines)) {
      for (const line of parsed.lines) {
        if (
          line &&
          typeof line.productId === 'number' &&
          Number.isInteger(line.productId) &&
          line.productId > 0 &&
          typeof line.sku === 'string' &&
          typeof line.name === 'string' &&
          typeof line.unit === 'string' &&
          typeof line.sellPrice === 'number' &&
          Number.isFinite(line.sellPrice) &&
          line.sellPrice >= 0 &&
          typeof line.maxStockQty === 'number' &&
          Number.isFinite(line.maxStockQty) &&
          line.maxStockQty > 0 &&
          typeof line.qty === 'number' &&
          Number.isFinite(line.qty) &&
          line.qty > 0
        ) {
          validatedLines.push({
            productId: line.productId,
            sku: line.sku,
            name: line.name,
            unit: line.unit,
            sellPrice: Math.trunc(line.sellPrice),
            maxStockQty: Math.trunc(line.maxStockQty),
            qty: Math.min(Math.trunc(line.qty), Math.trunc(line.maxStockQty)),
          })
        }
      }
    }

    return {
      lines: validatedLines,
      discountAmount:
        typeof parsed.discountAmount === 'number' &&
        Number.isFinite(parsed.discountAmount) &&
        parsed.discountAmount >= 0
          ? Math.trunc(parsed.discountAmount)
          : 0,
      paymentMethod:
        parsed.paymentMethod === 'QRIS' || parsed.paymentMethod === 'TRANSFER'
          ? parsed.paymentMethod
          : 'CASH',
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
    }
  } catch {
    return {
      lines: [],
      discountAmount: 0,
      paymentMethod: 'CASH',
      customerName: '',
    }
  }
}

export interface AddProductResult {
  readonly added: boolean
  readonly reason?: string
}

interface PosCartContextValue {
  readonly lines: readonly PosCartLine[]
  readonly discountAmount: number
  readonly paymentMethod: PaymentMethod
  readonly customerName: string
  readonly totalItemsCount: number
  readonly subtotalAmount: number
  readonly effectiveDiscountAmount: number
  readonly grandTotalAmount: number
  readonly addProduct: (product: ProductDTO, addQty?: number) => AddProductResult
  readonly updateLineQty: (productId: number, nextQty: number) => AddProductResult
  readonly syncProductStockSnapshot: (products: readonly ProductDTO[]) => void
  readonly removeLine: (productId: number) => void
  readonly setDiscountAmount: (amount: number) => void
  readonly setPaymentMethod: (method: PaymentMethod) => void
  readonly setCustomerName: (name: string) => void
  readonly clearCart: () => void
}

const PosCartContext = createContext<PosCartContextValue | null>(null)

export function PosCartProvider(props: { children: Child }) {
  const initial = useMemo(() => loadPersistedDraft(), [])
  const [lines, setLines] = useState<readonly PosCartLine[]>(initial.lines)
  const [discountAmount, setDiscountAmountState] = useState<number>(
    initial.discountAmount,
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial.paymentMethod)
  const [customerName, setCustomerName] = useState<string>(initial.customerName)

  useEffect(() => {
    try {
      const payload: PersistedPosDraft = {
        lines,
        discountAmount,
        paymentMethod,
        customerName,
      }
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore storage quota warnings
    }
  }, [lines, discountAmount, paymentMethod, customerName])

  const addProduct = useCallback((product: ProductDTO, addQty = 1): AddProductResult => {
    if (!product.isActive) {
      return { added: false, reason: `Produk "${product.name}" sedang nonaktif.` }
    }
    if (product.stockQty <= 0) {
      return { added: false, reason: `Stok "${product.name}" habis.` }
    }

    let outcome: AddProductResult = { added: true }

    setLines((prev) => {
      const idx = prev.findIndex((item) => item.productId === product.id)
      if (idx === -1) {
        const clampedQty = Math.min(addQty, product.stockQty)
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            sellPrice: product.sellPrice,
            maxStockQty: product.stockQty,
            qty: clampedQty,
          },
        ]
      }

      const existing = prev[idx]
      if (!existing) {
        return prev
      }
      const targetQty = existing.qty + addQty
      if (targetQty > product.stockQty) {
        outcome = {
          added: false,
          reason: `Maksimal stok tersedia untuk "${product.name}" adalah ${product.stockQty} ${product.unit}.`,
        }
        return prev.map((item, i) =>
          i === idx
            ? {
                ...item,
                sellPrice: product.sellPrice,
                maxStockQty: product.stockQty,
                qty: Math.min(item.qty, product.stockQty),
              }
            : item,
        )
      }

      return prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              sellPrice: product.sellPrice,
              maxStockQty: product.stockQty,
              qty: targetQty,
            }
          : item,
      )
    })

    return outcome
  }, [])

  const updateLineQty = useCallback(
    (productId: number, nextQty: number): AddProductResult => {
      if (nextQty <= 0) {
        setLines((prev) => prev.filter((item) => item.productId !== productId))
        return { added: true }
      }

      let outcome: AddProductResult = { added: true }
      setLines((prev) =>
        prev.map((item) => {
          if (item.productId !== productId) return item
          if (nextQty > item.maxStockQty) {
            outcome = {
              added: false,
              reason: `Stok tersedia maksimal ${item.maxStockQty} ${item.unit}.`,
            }
            return { ...item, qty: item.maxStockQty }
          }
          return { ...item, qty: Math.trunc(nextQty) }
        }),
      )
      return outcome
    },
    [],
  )

  const syncProductStockSnapshot = useCallback((products: readonly ProductDTO[]) => {
    if (products.length === 0) return
    const byId = new Map(products.map((p) => [p.id, p]))
    setLines((prev) => {
      let changed = false
      const updated: PosCartLine[] = []
      for (const line of prev) {
        const fresh = byId.get(line.productId)
        if (!fresh) {
          updated.push(line)
          continue
        }
        if (!fresh.isActive || fresh.stockQty <= 0) {
          changed = true
          continue
        }
        const clampedQty = Math.min(line.qty, fresh.stockQty)
        if (
          clampedQty !== line.qty ||
          fresh.sellPrice !== line.sellPrice ||
          fresh.stockQty !== line.maxStockQty
        ) {
          changed = true
          updated.push({
            ...line,
            sellPrice: fresh.sellPrice,
            maxStockQty: fresh.stockQty,
            qty: clampedQty,
          })
        } else {
          updated.push(line)
        }
      }
      return changed ? updated : prev
    })
  }, [])

  const removeLine = useCallback((productId: number) => {
    setLines((prev) => prev.filter((item) => item.productId !== productId))
  }, [])

  const setDiscountAmount = useCallback((amount: number) => {
    setDiscountAmountState(Math.max(0, Math.trunc(amount)))
  }, [])

  const clearCart = useCallback(() => {
    setLines([])
    setDiscountAmountState(0)
    setPaymentMethod('CASH')
    setCustomerName('')
  }, [])

  const { totalItemsCount, subtotalAmount, effectiveDiscountAmount, grandTotalAmount } =
    useMemo(() => {
      let count = 0
      let sub = 0
      for (const line of lines) {
        count += line.qty
        sub += line.sellPrice * line.qty
      }
      const effDisc = Math.min(discountAmount, sub)
      return {
        totalItemsCount: count,
        subtotalAmount: sub,
        effectiveDiscountAmount: effDisc,
        grandTotalAmount: sub - effDisc,
      }
    }, [lines, discountAmount])

  const value = useMemo<PosCartContextValue>(
    () => ({
      lines,
      discountAmount,
      paymentMethod,
      customerName,
      totalItemsCount,
      subtotalAmount,
      effectiveDiscountAmount,
      grandTotalAmount,
      addProduct,
      updateLineQty,
      syncProductStockSnapshot,
      removeLine,
      setDiscountAmount,
      setPaymentMethod,
      setCustomerName,
      clearCart,
    }),
    [
      lines,
      discountAmount,
      paymentMethod,
      customerName,
      totalItemsCount,
      subtotalAmount,
      effectiveDiscountAmount,
      grandTotalAmount,
      addProduct,
      updateLineQty,
      syncProductStockSnapshot,
      removeLine,
      setDiscountAmount,
      setPaymentMethod,
      setCustomerName,
      clearCart,
    ],
  )

  return <PosCartContext.Provider value={value}>{props.children}</PosCartContext.Provider>
}

export function usePosCart(): PosCartContextValue {
  const ctx = useContext(PosCartContext)
  if (!ctx) {
    throw new Error('usePosCart must be used within PosCartProvider')
  }
  return ctx
}
