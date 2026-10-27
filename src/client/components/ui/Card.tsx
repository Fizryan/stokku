import type { Child } from 'hono/jsx/dom'

export type CardVariant = 'lowest' | 'filled' | 'outlined'

export interface CardProps {
  readonly children: Child
  readonly variant?: CardVariant
  readonly class?: string
}

const cardVariantClasses: Readonly<Record<CardVariant, string>> = {
  lowest: 'bg-m3-surface-container-lowest border border-m3-outline-variant/60 shadow-2xs',
  filled: 'bg-m3-surface-container-low border border-transparent',
  outlined: 'bg-m3-surface-container-lowest border border-m3-outline-variant',
}

export function Card(props: CardProps) {
  const variant = props.variant ?? 'lowest'
  return (
    <div
      class={[
        'rounded-2xl transition-colors duration-200',
        cardVariantClasses[variant],
        props.class ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  )
}
