import { type ToastVariant, useToast } from '../../stores/toast.store.js'
import { IconAlert, IconCheck, IconClose } from './Icons.js'

const variantStyles: Readonly<Record<ToastVariant, string>> = {
  info: 'bg-m3-on-surface text-white',
  success: 'bg-m3-success text-white',
  warning: 'bg-m3-warning text-white',
  error: 'bg-m3-danger text-white',
}

export function ToastViewport() {
  const { toasts, dismissToast } = useToast()
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      class="fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:w-96 z-60 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          class={[
            'pointer-events-auto rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-sm font-medium transition-all duration-200',
            variantStyles[toast.variant],
          ].join(' ')}
        >
          <div class="flex items-center gap-2.5 min-w-0">
            {toast.variant === 'success' ? (
              <IconCheck class="w-4 h-4 shrink-0" />
            ) : toast.variant === 'error' || toast.variant === 'warning' ? (
              <IconAlert class="w-4 h-4 shrink-0" />
            ) : null}
            <span class="leading-snug">{toast.title}</span>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Tutup notifikasi"
            class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/15 shrink-0 cursor-pointer"
          >
            <IconClose class="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
