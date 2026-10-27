import type { Child } from 'hono/jsx/dom'

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  readonly children: Child
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly type?: 'button' | 'submit' | 'reset'
  readonly form?: string
  readonly disabled?: boolean
  readonly loading?: boolean
  readonly fullWidth?: boolean
  readonly title?: string
  readonly class?: string
  readonly onClick?: (e: MouseEvent) => void
}

const variantClasses: Readonly<Record<ButtonVariant, string>> = {
  filled: 'bg-m3-primary text-m3-on-primary hover:bg-m3-primary-hover shadow-xs',
  tonal:
    'bg-m3-primary-container text-m3-on-primary-container hover:bg-m3-secondary-container',
  outlined:
    'border border-m3-outline-variant bg-m3-surface-container-lowest text-m3-primary hover:bg-m3-surface-container-low',
  ghost:
    'bg-transparent text-m3-on-surface-variant hover:bg-m3-surface-container hover:text-m3-on-surface',
  danger: 'bg-m3-danger text-m3-on-danger hover:bg-m3-danger-hover shadow-xs',
}

const sizeClasses: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-9 px-3.5 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-sm gap-2.5',
}

export function Button(props: ButtonProps) {
  const variant = props.variant ?? 'filled'
  const size = props.size ?? 'md'
  const isDisabled = Boolean(props.disabled || props.loading)

  return (
    <button
      type={props.type ?? 'button'}
      form={props.form}
      disabled={isDisabled}
      title={props.title}
      onClick={props.onClick}
      class={[
        'inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-m3-primary disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        props.fullWidth ? 'w-full' : '',
        props.class ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.loading && (
        <span
          class="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      {props.children}
    </button>
  )
}
