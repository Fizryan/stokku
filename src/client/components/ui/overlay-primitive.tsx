import { useEffect, useRef } from 'hono/jsx/dom'

let activeOverlayLockCount = 0
let savedBodyOverflow = ''

function acquireBodyScrollLock(): () => void {
  if (activeOverlayLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  activeOverlayLockCount += 1

  let released = false
  return () => {
    if (released) return
    released = true
    activeOverlayLockCount = Math.max(0, activeOverlayLockCount - 1)
    if (activeOverlayLockCount === 0) {
      document.body.style.overflow = savedBodyOverflow
    }
  }
}

export function useOverlayBehavior(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const releaseScrollLock = acquireBodyScrollLock()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      releaseScrollLock()
    }
  }, [open])
}

export function resolveOverlayPortalRoot(): HTMLElement {
  return document.getElementById('modal-root') ?? document.body
}

export interface OverlayBackdropProps {
  readonly ariaLabel: string
  readonly onClose: () => void
}

export function OverlayBackdrop(props: OverlayBackdropProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={props.ariaLabel}
      onClick={props.onClose}
      class="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] cursor-default"
    />
  )
}
