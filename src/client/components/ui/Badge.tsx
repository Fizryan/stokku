import type { Child } from 'hono/jsx/dom'

export type BadgeTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger'

export interface BadgeProps {
  readonly children: Child
  readonly tone?: BadgeTone
  readonly class?: string
}

const toneClasses: Readonly<Record<BadgeTone, string>> = {
  primary: 'bg-m3-primary-container text-m3-on-primary-container',
  neutral: 'bg-m3-surface-container-high text-m3-on-surface-variant',
  success: 'bg-m3-success-container text-m3-on-success-container',
  warning: 'bg-m3-warning-container text-m3-on-warning-container',
  danger: 'bg-m3-danger-container text-m3-on-danger-container',
}

export function Badge(props: BadgeProps) {
  const tone = props.tone ?? 'neutral'
  return (
    <span
      class={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClasses[tone],
        props.class ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </span>
  )
}
