import type { Child } from 'hono/jsx/dom'
import { Card } from './Card.js'

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral'

export interface StatCardProps {
  readonly label: string
  readonly value: string
  readonly subtitle?: string
  readonly icon: Child
  readonly tone?: StatTone
}

const iconToneClasses: Readonly<Record<StatTone, string>> = {
  primary: 'bg-m3-primary-container text-m3-primary',
  success: 'bg-m3-success-container text-m3-success',
  warning: 'bg-m3-warning-container text-m3-warning',
  danger: 'bg-m3-danger-container text-m3-danger',
  neutral: 'bg-m3-surface-container-high text-m3-on-surface-variant',
}

export function StatCard(props: StatCardProps) {
  const tone = props.tone ?? 'primary'
  return (
    <Card class="p-4 sm:p-5 flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-m3-on-surface-variant truncate">
          {props.label}
        </p>
        <p class="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-m3-on-surface tabular-nums truncate">
          {props.value}
        </p>
        {props.subtitle && (
          <p class="mt-1 text-xs text-m3-on-surface-variant truncate">{props.subtitle}</p>
        )}
      </div>

      <div
        class={[
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          iconToneClasses[tone],
        ].join(' ')}
      >
        {props.icon}
      </div>
    </Card>
  )
}
