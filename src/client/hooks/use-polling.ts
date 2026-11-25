import { useEffect, useRef } from 'hono/jsx/dom'

export function usePolling(
  refetch: (signal: AbortSignal) => void | Promise<void>,
  intervalMs = 5000,
  enabled = true,
) {
  const busyRef = useRef(false)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    if (!enabled) return
    let controller: AbortController | null = null

    const tick = async () => {
      if (busyRef.current || document.hidden) return
      busyRef.current = true
      try {
        controller = new AbortController()
        await refetchRef.current(controller.signal)
      } finally {
        busyRef.current = false
        controller = null
      }
    }

    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(tick, intervalMs)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      controller?.abort()
    }
  }, [enabled, intervalMs])
}
