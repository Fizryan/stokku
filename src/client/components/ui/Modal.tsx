import { type Child, createPortal, useId } from 'hono/jsx/dom'
import { IconClose } from './Icons.js'
import {
  OverlayBackdrop,
  resolveOverlayPortalRoot,
  useOverlayBehavior,
} from './overlay-primitive.js'

export interface ModalProps {
  readonly open: boolean
  readonly title: string
  readonly description?: string
  readonly maxWidthClass?: string
  readonly onClose: () => void
  readonly children: Child
  readonly footer?: Child
}

export function Modal(props: ModalProps) {
  const titleId = useId()
  useOverlayBehavior(props.open, props.onClose)

  if (!props.open) {
    return null
  }

  const portalRoot = resolveOverlayPortalRoot()

  return (
    <>
      {createPortal(
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <OverlayBackdrop ariaLabel="Tutup dialog" onClose={props.onClose} />
          <div
            class={[
              'relative z-10 w-full rounded-3xl bg-m3-surface-container-lowest border border-m3-outline-variant/60 shadow-xl flex flex-col max-h-[90vh] overflow-hidden',
              props.maxWidthClass ?? 'max-w-lg',
            ].join(' ')}
          >
            <div class="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-m3-outline-variant/50">
              <div class="min-w-0">
                <h2
                  id={titleId}
                  class="text-lg font-semibold text-m3-on-surface leading-snug"
                >
                  {props.title}
                </h2>
                {props.description && (
                  <p class="mt-0.5 text-xs text-m3-on-surface-variant">
                    {props.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={props.onClose}
                aria-label="Tutup dialog"
                class="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-surface-container transition-colors cursor-pointer shrink-0"
              >
                <IconClose />
              </button>
            </div>

            <div class="px-6 py-5 overflow-y-auto flex-1">{props.children}</div>

            {props.footer && (
              <div class="px-6 py-4 bg-m3-surface-container-low border-t border-m3-outline-variant/50 flex items-center justify-end gap-2.5">
                {props.footer}
              </div>
            )}
          </div>
        </div>,
        portalRoot,
      )}
    </>
  )
}
