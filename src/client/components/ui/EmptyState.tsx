import type { Child } from 'hono/jsx/dom'

export interface EmptyStateProps {
  readonly icon: Child
  readonly title: string
  readonly description: string
  readonly action?: Child
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="py-12 px-4 flex flex-col items-center justify-center text-center">
      <div class="w-12 h-12 rounded-2xl bg-m3-primary-container/70 text-m3-primary flex items-center justify-center mb-3.5">
        {props.icon}
      </div>
      <h3 class="text-sm font-semibold text-m3-on-surface">{props.title}</h3>
      <p class="mt-1 max-w-sm text-xs text-m3-on-surface-variant leading-relaxed">
        {props.description}
      </p>
      {props.action && <div class="mt-4">{props.action}</div>}
    </div>
  )
}
