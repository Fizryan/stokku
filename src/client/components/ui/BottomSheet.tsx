import { type Child, createPortal, useId } from 'hono/jsx/dom'
import { IconClose } from './Icons.js'
import {
  OverlayBackdrop,
  resolveOverlayPortalRoot,
  useOverlayBehavior,
} from './overlay-primitive.js'

export interface BottomSheetProps {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
  readonly children: Child
}

export function BottomSheet(props: BottomSheetProps) {
  const titleId = useId()
  useOverlayBehavior(props.open, props.onClose)

  if (!props.open) return null

  const portalRoot = resolveOverlayPortalRoot()

  return (
    <>
      {createPortal(
        <div
          class="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <OverlayBackdrop ariaLabel="Tutup panel" onClose={props.onClose} />
          <div class="relative z-10 w-full rounded-t-3xl bg-m3-surface-container-lowest border-t border-m3-outline-variant max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div class="pt-2.5 pb-1 flex justify-center">
              <span class="w-10 h-1 rounded-full bg-m3-outline-variant" />
            </div>
            <div class="px-5 py-3 flex items-center justify-between border-b border-m3-outline-variant/50">
              <h2 id={titleId} class="text-base font-semibold text-m3-on-surface">
                {props.title}
              </h2>
              <button
                type="button"
                onClick={props.onClose}
                aria-label="Tutup panel"
                class="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-surface-container cursor-pointer"
              >
                <IconClose />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">{props.children}</div>
          </div>
        </div>,
        portalRoot,
      )}
    </>
  )
}
