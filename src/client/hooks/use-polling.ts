import { useEffect, useRef } from 'hono/jsx/dom'

export function usePolling(
  refetch: () => void | Promise<void>,
  intervalMs = 5000,
  enabled = true,
) {
  const busyRef = useRef(false)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    if (!enabled) return

    const tick = async () => {
      if (busyRef.current || document.hidden) return
      busyRef.current = true
      try {
        await refetchRef.current()
      } finally {
        busyRef.current = false
      }
    }

    const id = setInterval(tick, intervalMs)

    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs])
}
