import {
  type Child,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'hono/jsx/dom'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  readonly id: number
  readonly title: string
  readonly variant: ToastVariant
}

interface ToastContextValue {
  readonly toasts: readonly ToastMessage[]
  readonly showToast: (title: string, variant?: ToastVariant) => void
  readonly dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider(props: { children: Child }) {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([])
  const idCounterRef = useRef(0)
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: number) => {
    const existingTimer = timersRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const showToast = useCallback((title: string, variant: ToastVariant = 'info') => {
    idCounterRef.current += 1
    const id = idCounterRef.current
    setToasts((prev) => [...prev.slice(-3), { id, title, variant }])

    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 4200)
    timersRef.current.set(id, timer)
  }, [])

  useEffect(() => {
    const timersMap = timersRef.current
    return () => {
      for (const timer of timersMap.values()) {
        clearTimeout(timer)
      }
      timersMap.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  )

  return <ToastContext.Provider value={value}>{props.children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
